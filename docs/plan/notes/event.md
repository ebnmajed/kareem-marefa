# notes — `event` teammate (wave 1, M2)

Working notes for the EVT / RAT / Realtime track. Not a plan document — `01-prd.md` defines,
`09` describes, `03` governs permissions; this only records how I am building it. Append as I go.

---

## 0. One thing the lead should read before promoting `02_ratings_admin_rpc.sql`

`REQ-RAT-005` requires that an org admin's per-rater ratings read **is audited**. Migration
`0010` (wave 0) already grants admins a *direct* `select` on `ratings` (`ratings_read_admin`,
using `is_org_admin()`) with no way for a bare `select` to leave an audit row — RLS can't run a
side effect. `tests/rls/m2-schema.test.ts` (outside my globs) already asserts that direct policy
works as-is ("select — an admin sees rows").

So I did **not** touch that policy. Instead `list_session_ratings_admin(p_session)` is a new
`SECURITY DEFINER` RPC that re-checks admin freshness (`assert_fresh_admin()`, the same staleness
discipline as `0005`), writes one `audit_log` row, then returns the rows. `src/lib/dal/ratings.ts`
calls **only** this RPC for the admin view — the app never does a bare `select` against `ratings`
as an admin.

**Honest residual gap:** the direct-select policy still exists, so a client bypassing the DAL (or
a future code path that queries the table directly) would read per-rater ratings unaudited. Closing
that means dropping `ratings_read_admin` in a migration and updating the wave-0 test, which is the
lead's call, not mine to make unilaterally by editing a file outside my globs. Flagging it here
per the note-taking convention `sessions.md` set.

---

## 1. STORY-EVT-002 — threaded comments (`REQ-EVT-002`, `REQ-EVT-003`, `REQ-EVT-005`)

Schema is already in `0010` (`comments`, `comments_guard()`), and wave 0's
`tests/rls/m2-schema.test.ts` already proves the policy-level cases (depth, edit window,
moderator remove/restore, "no RSVP needed"). What is mine to add:

- **`src/lib/dal/comments.ts`** — `listComments(sessionId)` returns a flat list of `CommentDTO`
  (id, parentId, author {id, displayName, avatarUrl}, body, createdAt, editedAt, deletedAt,
  mentions, `canEdit`/`canDelete` computed against `org_settings.comment_edit_window_minutes` and
  the viewer's own `memberId`) — the component nests it into threads (one level, matching the
  schema). `createComment`, `updateComment`, `softDeleteComment` wrap the direct table
  insert/update the RLS policies already allow (no RPC needed here — the grant + `comments_guard()`
  trigger *are* the authority boundary). Author name comes from embedding `members(...)` on the
  FK (`comments_author_id_fkey`) — the column grant on `members` (`0004`) already exposes exactly
  `display_name`/`avatar_url`, so this cannot leak `email` even by accident.
- **Mentions (`REQ-EVT-006`) and reply notifications (`REQ-EVT-007`) are partially out of reach**:
  there is no `notifications` table yet — it is `notify`'s, M3. I store `@mention` targets into the
  existing `comments.mentions uuid[]` column (resolved against `members_member_view`, which is
  already org-scoped by its own RLS, satisfying "mention search returns only members of the same
  org"), and expose them in the DTO so the UI can render "‪@name‬" as a link. **Delivery** — the
  notified toast/email/inbox row — is deferred to M3 and noted as such rather than silently
  skipped. Reactions earning zero points (`REQ-EVT-004`) needs nothing from me: `reactions` is
  simply absent from the scoring catalogue (`05`), which is `scoring`'s table, not mine to touch.
- **Tombstones (`REQ-EVT-005`):** the schema only supports soft delete (`deleted_at`/`deleted_by`
  — there is no delete policy at all on `comments`). "Leaves a tombstone when replies exist" is
  therefore a **client-side rendering rule**, not a schema one: the `Comments` component hides a
  deleted, reply-less comment entirely and renders the tombstone copy only when
  `replies.length > 0`. Nothing to prove at the database layer beyond what wave 0 already covers.
- **A second real bug, also confirmed against the live policy text, not assumed:**
  `comments_update_own`'s `USING` clause gates *every* update through it — both a body edit and a
  soft-delete — behind the same `created_at > now() - comment_edit_window` predicate, because a
  soft-delete is just another `UPDATE` on the same table. That means an author's comment older
  than the edit window **cannot be self-deleted at all** today — `REQ-EVT-005` ("delete own
  comment at any time") is violated for anything but a moderator/admin removal. Splitting the
  policy in two does not fix it cleanly: Postgres OR's multiple permissive `UPDATE` policies at
  both `USING` and `WITH CHECK`, and nothing in a policy (unlike a trigger) can see the pre-update
  row to tell "only `deleted_at` changed" from "`body` changed" — so a second, time-unrestricted
  policy would reopen body edits past the window too, which `tests/rls/m2-schema.test.ts` (outside
  my globs) already pins as blocked. Fix: `supabase/proposed/event/03_comments_self_delete_rpc.sql`
  — a small `SECURITY DEFINER` RPC, `delete_own_comment(p_comment)`, that does exactly the one
  thing the policy can't: set `deleted_at`/`deleted_by` on the caller's own row with no time check.
  Purely additive; the existing policy and trigger are untouched, so the wave-0 test is unaffected.
  `src/lib/dal/comments.ts` calls this RPC for a member's own delete; moderator/admin removal keeps
  using the existing `p6_staff_update` path directly.
- **Realtime:** `session:{id}` gets an `AFTER INSERT OR UPDATE` broadcast trigger on `comments`
  using `realtime.broadcast_changes()` (the full row — see §3), plus a `reactions` trigger that
  broadcasts **totals**, not rows (`03` §7.4). Both are `supabase/proposed/event/01_realtime_authorization.sql`,
  proven with `applyProposed()` in `tests/rls/realtime.test.ts`.

## 2. STORY-EVT-003 (reactions, mentions — see above) / STORY-EVT-004 (report and flag)

- **`src/lib/dal/reactions.ts`** — `toggleReaction(target, kind)` where target is
  `{ commentId } | { sessionId }`; a plain insert/delete against the RLS policies already in
  `0010` (`p3_self_insert`/`p3_self_delete`). No RPC.
- **`src/lib/dal/reports.ts`** — `reportComment(commentId, reason)` — a plain insert
  (`reports_insert_self`). The **moderation queue UI is `app/admin/**`**, which is `console`'s in
  wave 3 — out of my globs and out of scope here. `REQ-EVT-008`'s acceptance ("reporter never
  shown to the reported") is already structural: no policy lets a non-staff member read `reports`
  at all, let alone the reported member.

## 3. Realtime — what I actually verified against the local database, not memory

`node_modules` ships no realtime SQL to read, so I introspected the local Postgres directly
(`pg` against `127.0.0.1:54322`, the same instance the RLS suite uses) rather than trust anything
about a moving target:

- `realtime.messages` already has `relrowsecurity = true`, `relforcerowsecurity = false`, and
  **zero policies** — so today it is deny-all for `authenticated`/`anon` despite holding table
  grants. My three policies (session select/insert, host select — copied from `03` §7.2 verbatim)
  are what turns that into anything at all.
- `realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text default 'ROW')` builds
  `{old_record, record, operation, table, schema}` itself and inserts through `realtime.send()`.
  `realtime.send(payload jsonb, event text, topic text, private boolean default true)` inserts
  directly into `realtime.messages`.
- Both are called from `SECURITY DEFINER` trigger functions owned by `postgres`, which has
  `rolbypassrls = true` — confirmed locally (`pg_roles`), so the insert into `realtime.messages`
  bypasses my own `insert` policy on it (correct: the *policy* gates a client's own
  `channel.send()`, not the server-side trigger).
- **Channel privacy (`config: { private: true }`) is a client concern, not SQL.**
  `src/lib/realtime/channel.ts` is the one place `createBrowserClient()` is used (per my globs) and
  the one function that opens a channel — it hard-codes `private: true` and refuses to open a
  public one, so there is exactly one place a future `channel()` call without it could slip in,
  and it's mine to keep honest.

### 3.1 — A real cross-org bug in `03` §7.2's own sample SQL

`tests/rls/realtime.test.ts` ("a member of org B cannot read org A's host topic at all, staff or
not") caught that `03` §7.2's literal `realtime_host_select` sample —
`is_staff() or is_presenter_of(...)`, with no org check — lets **any admin or moderator of any
org** subscribe to **any** org's `host:{id}` topic, because `is_staff()` only reads the caller's
own role, never the session's org. That is a live cross-org leak of check-in counts, exactly the
class of thing `03` §8.1's isolation sweep exists to catch elsewhere — except the sweep walks
tables, not Realtime topics (DEC-022 says as much), so nothing else would have caught this one.

My proposed file adds the missing `exists (... s.org_id = auth_org_id())` clause and documents the
deviation inline. **This needs a `DECISIONS.md` entry and a correction to `03` §7.2 itself** —
both outside my paths. Until the lead does that, the corrected policy is what's live.

## 4. STORY-RAT-001 / STORY-RAT-002 — rate, gated by check-in; anonymity and its limit

- **`src/lib/dal/ratings.ts`**: `getRatingEligibility(sessionId)` (checked-in? session completed?
  within `rating_window_days`? already rated — editable or closed?), `submitRating`,
  `updateRating` (plain insert/update against `ratings_write_self`/`ratings_update_self` — the
  `check_in_id in (select ... where member_id = auth_member_id())` clause in the `with check`
  already rejects someone else's check-in, so I don't re-derive that in the DAL, only surface the
  error as the Arabic copy), `getPresenterAggregate` (reads `session_rating_aggregates` — empty
  below `rating_min_aggregate`, exactly `REQ-RAT-006`), `getRatingsForAdmin` (calls
  `list_session_ratings_admin()`, §0).
- **SCR-015** (`app/sessions/[id]/rate/**`, mine) — stars fill **from the right** in RTL: the star
  row is built with `flex-direction: row-reverse` inside the RTL document rather than mirroring
  icons, so pointer-drag/keyboard selection and the visual fill agree (a mirrored icon with
  left-to-right event handling is the classic way this goes silently wrong per `09`'s own warning).
  The anonymity copy states the D36 exception explicitly (admins can see per-rater data) — see
  `messages/ar/ratings.json`.
- **The `Ratings` slot** (`components/event/ratings.tsx`) is a *summary*, not the form: per SCR-012's
  page order it renders item 10 — a prompt/link to `/rate` for a checked-in attendee post-completion,
  or, for the presenter, the aggregate (or the "results appear after 3 ratings" copy) — and renders
  nothing otherwise (draft/future sessions, non-checked-in members).

## 5. Message namespaces

Added `event` and `ratings` to `NAMESPACES` in `src/messages/index.ts` (the one shared line, per
`TEAM.md` §2 — appended, not reordered). Arabic authored first in both files; English twins written
alongside rather than left to fall back, since both are short enough to do properly now.

## 6. Status at handoff

STORY-EVT-002, EVT-004, RAT-001, RAT-002 done; EVT-003 done except reply
notifications (needs the M3 notifications table). Commits on `wave-1/m2`:
`d42bcf1` (Realtime authorization + the host-topic fix), `584b7ae` (ratings
admin + count RPCs), `03_comments_self_delete_rpc.sql`/its test (folded
into the lead's `6efd2c8` — see below), `176d821` (DAL), `5c4f97f`
(Comments/Ratings slots + components + tests), `d326698` (SCR-015 rate
route + e2e). `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test`
(117/117) and `npm run test:rls` (161+ passing, only unrelated in-flight
WIP in other teammates' files ever red) all green as of this commit.

**Two incidental commit mix-ups from the shared git index, content intact,
nothing lost:** `d42bcf1` also carries `tests/e2e/checkin.spec.ts`
(`checkin`'s file, staged by them between my `add` and `commit`), and
`5c4f97f` also carries the lead's rename of three proposed SQL files into
`supabase/migrations/0013–0015`. Both are exactly what they say, just
attributed under my commit message rather than the right one. A third:
`e4bbe64` (`sessions`'s) carries my fix in §7.1 below, same shared-index
race, same non-issue for content.

### 6.1 — Two real bugs found once the event page actually existed (`c81f4af`)

Both caught by looking at the real page and running `tests/e2e/event-comments.spec.ts`
against it, not by inspection:

1. **Duplicate headings.** The page wraps every slot in its own
   `<section aria-labelledby>` + `<h2>` ("التعليقات" / "التقييم" —
   `commentsLabel`/`ratingLabel`, `sessions`'s copy). `Comments` and
   `Ratings` also rendered their own, identical `<h2>` — a screen reader
   announces the same heading twice, and Playwright hit it immediately as a
   strict-mode violation (two elements, one accessible name). Fixed: both
   slots render a plain `<div>` now; the page owns the landmark and the
   heading, matching what `09`/SCR-012 always specified (the slot renders
   *content*, item 8 or 10, not a second copy of the section's own title).
   `Comments` keeps its live count, now as plain text next to the list
   rather than folded into a duplicate heading.
2. **A comment could fail to appear for the person who just wrote it.** The
   original design (documented in `actions.ts`'s own comment, now
   corrected) relied entirely on the private channel's broadcast for a
   just-written comment to render, on the theory that the poster's own
   browser gets the broadcast back like anyone else's. That is only true
   once the channel's subscription has finished establishing — a fresh
   page load can lose that race against the insert it is about to make,
   and the poster is left looking at an empty composer. Fixed: every
   mutation (post/edit/delete/react) also calls `router.refresh()` on
   success, independent of the broadcast, which still carries the update
   to everyone *else* watching live. This is a correction to my own
   earlier design, not a gap the plan left — worth being honest about
   rather than folding quietly into "it works now".

### 6.2 — Two more real bugs, found only by the e2e actually flaking

Both required a rebuild to prove; commit `18c3946`.

1. **The rate form's own React 19 reset** — same class of bug `sessions`
   found on the propose form (`26772e2`): an uncontrolled textarea reverts
   to its ORIGINAL `defaultValue` on any failed submission. The comment
   composer (`comment-composer.tsx`) is unaffected — it is fully controlled
   (`value={body}`), never a native `<form action>` at all — but SCR-015's
   rate form is exactly the vulnerable shape. Fixed the same way: the
   action returns what was typed, the field reads it back.
2. **`CommentList`'s `useState(initialComments)` only reads the prop at
   mount.** This is the deeper bug behind §6.1's router.refresh() fix
   actually working: refresh re-runs the server component and hands the
   client component a fresh prop, but an already-mounted `useState` never
   re-reads its initializer. The heading's live count (computed straight
   in the server component) updated correctly on every refresh; the list
   sitting right below it did not — so the failure looked exactly like
   "sometimes the post doesn't show up," which is what intermittent test
   flakiness against a real server always looks like before you find the
   actual mechanism. Fixed by adjusting `comments`/`reactions`/`reported`
   during render when their prop identity changes (React's documented
   pattern for this; a `useEffect` version was tried first and correctly
   refused by `react-hooks/set-state-in-effect` for the extra visible
   render it would add on every refresh).

**How this was actually found, because it is a lesson worth keeping:**
`tests/e2e/event-comments.spec.ts`'s first case passed in isolation,
passed again, then failed on a THIRD run with an identical setup and no
code change in between — the classic shape of "a real bug, not a flaky
test," since a genuinely flaky *test* fails at some roughly constant rate
regardless of what else is running, while this failed more often under
load (two parallel workers, or right after several consecutive runs) and
less often on a quiet system, which is exactly what a client component
racing a server refresh against its own mount-time state looks like from
the outside. `tsc`, lint, the unit suite and the full RLS suite were green
on every single one of these bugs, in both directions — the reason the
e2e budget is spent on the unhappy path in a real browser is that nothing
else in this stack would have caught any of the four found this way.

## 7. What I have not built, and why

- **Photos** (`REQ-EVT-009`…`013`) — `STORY-EVT-005`/`006`, **M5**, not this wave.
- **Notification delivery** for mentions/replies — **M3** (`notify`), see §1.
- **The moderation queue UI** for reports — `console`, wave 3.
- **`app/sessions/[id]/page.tsx`** itself and its ordering — `sessions`'s file; I only fill the two
  slots it imports.

---

# Wave 10 plan — the survey, end to end (`REQ-SUR-001` … `009`, `DEC-160`)

**Status: PLAN ONLY.** Nothing outside this file is edited until the lead approves it at sync 1. Everything
below was written after reading the live text of what it talks about — `rate/{page,rate-form,actions,state}.tsx`,
`lib/dal/ratings.ts`, `components/event/{ratings,star-rating}.tsx`, `0004` (`org_settings`), `0010` (`ratings`,
its four policies, `session_rating_aggregates`), `0017`, `0019`, `0025` (`enqueue_job`), `0029`, `0058`
(`write_admin_export_audit`), `0087` (`ratings_write_self`, `has_checked_in`), `lib/dal/admin-exports.ts`,
`worker/src/{index.ts,tasks/award_points.ts}`, `tests/rls/{definer-exposure,isolation,award-hooks-ratings-comments}.test.ts`
and `src/components/ui/reorderable-list.tsx` (present in the tree, uncommitted, at the time of reading).

## 0. The two things this plan is measured against

1. ★ **A stored survey response names no member** (`DEC-160` §3, contract 1). It is not repairable later, so
   every design choice below that could have gone either way went the way that removes the join rather than
   the way that blurs it.
2. ★ **A session with no survey shows nothing about one, anywhere** (`REQ-SUR-001`). The proof is §11: the
   rate screen's existing specs pass with their assertions untouched.

## 1. Tables and columns I need from the lead (row L2)

**Ten tables, one enum, one column on `org_settings`.** No column below exists without something that renders
it or a rule that reads it. `org_id` on every table, RLS enabled, and the policy posture named per table.

**The enum** (a Postgres enum type, never `text` + check — `CLAUDE.md` naming):
`create type public.survey_question_kind as enum ('scale_1_5', 'single_choice', 'multi_choice', 'free_text');`
— `REQ-SUR-002`'s four types, in the order SCR-065 offers them.

### 1a. The authoring side — a template an org reuses (`REQ-SUR-001`, `REQ-SUR-002`)

| Table | Column | Type / rule | Why it exists |
|---|---|---|---|
| `survey_templates` | `id` | `uuid pk default gen_random_uuid()` | |
| | `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| | `title` | `text not null check (char_length(btrim(title)) between 1 and 200)` | SCR-065's list and «قالب جديد» |
| | | `unique (org_id, title)` | two templates named the same are indistinguishable in the attach picker |
| | `created_at` · `updated_at` | `timestamptz not null default now()` + `set_updated_at` trigger | the list orders by «آخر تعديل»; `updated_at` is the only ordering the screen offers |
| `survey_template_questions` | `id`, `org_id` | as above | |
| | `template_id` | `uuid not null references survey_templates(id) on delete cascade` | a template's questions die with it |
| | `position` | `int not null`, `unique (template_id, position) deferrable initially deferred` | `REQ-SUR-002` «order is authored and preserved»; deferrable so one `update` can renumber the whole set |
| | `kind` | `public.survey_question_kind not null` | `REQ-SUR-002` |
| | `prompt` | `text not null check (char_length(btrim(prompt)) between 1 and 300)` | the question |
| | `required` | `boolean not null default false` | `REQ-SUR-002`; default false because the safe default is «optional» |
| `survey_template_options` | `id`, `org_id` | as above | |
| | `question_id` | `uuid not null references survey_template_questions(id) on delete cascade` | |
| | `position` | `int not null`, `unique (question_id, position) deferrable initially deferred` | SCR-065: «a choice question's options are their own ordered list» |
| | `label` | `text not null check (char_length(btrim(label)) between 1 and 120)` | the option |

**Policy posture (all three):** `select` to `authenticated` **for staff of the org**
(`org_id = auth_org_id() and public.is_staff()`) — `REQ-SUR-005`'s audience, and a template is not an answer.
**No insert / update / delete policy**: every write renumbers `position` across a whole set, which a policy
cannot do atomically; the writes are the definer RPCs in §2.

### 1b. The copy attached to a session (`REQ-SUR-001`, SCR-064)

| Table | Column | Type / rule | Why it exists |
|---|---|---|---|
| `surveys` | `id`, `org_id` | as above | |
| | `session_id` | `uuid not null unique references sessions(id) on delete cascade` | **one survey per session** (`REQ-SUR-001`, `DEC-074`) — `unique` is that sentence made structural |
| | `source_template_id` | `uuid references survey_templates(id) on delete set null` | provenance only: SCR-065's «كم جلسة تستخدمه». **Never read to render a question** — the questions are the copy below. `set null` so deleting a template never deletes a survey members have answered |
| | `title` | `text not null` | copied at attach; editing the template must not rewrite it |
| | `attached_at` | `timestamptz not null default now()` | names no member (see §3). SCR-064 renders it **only** when it is after `sessions.completed_at`, to say «أُضيفت بعد انتهاء الجلسة» — the honest reading of a low response rate (§8, case 4) |
| `survey_questions` | `id`, `org_id` | | |
| | `survey_id` | `uuid not null references surveys(id) on delete cascade` | |
| | `position`, `kind`, `prompt`, `required` | exactly as the template's, `unique (survey_id, position) deferrable initially deferred` | the copy |
| | `source_question_id` | `uuid references survey_template_questions(id) on delete set null` | provenance only |
| `survey_question_options` | `id`, `org_id`, `question_id → survey_questions(id) on delete cascade`, `position`, `label` | as the template's | |

**Policy posture:** `select` for **staff of the org**, as in 1a. The member never selects these tables — the
rate screen reads the survey through `survey_for_member()` (§2 E), which is one call and one audience test.
**No write policy** (attach and detach are RPCs).

### 1c. ★ The register, and the box (`REQ-SUR-003`, `REQ-SUR-009`, `DEC-160` §3)

| Table | Column | Type / rule | Why it exists |
|---|---|---|---|
| `survey_participations` | `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| | `survey_id` | `uuid not null references surveys(id) on delete cascade` | |
| | `member_id` | `uuid not null references members(id) on delete cascade` | «one member, one response» lives **here and only here** |
| | — | `primary key (survey_id, member_id)` | ★ **no surrogate id on purpose**: there is no participation id that could ever be written onto a response by a later mistake |
| | — | ★ **no timestamp column of any kind** (`DEC-160` §3.1) | this is the one table in the product with no `created_at`, and that is the point: the register must not say *when* |
| `survey_responses` | `id` | `uuid pk default gen_random_uuid()` | |
| | `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| | `survey_id` | `uuid not null references surveys(id) on delete cascade` | |
| | — | index `(survey_id)` | the results function groups by it |
| | — | **and nothing else** | |
| `survey_answers` | `id` | `uuid pk default gen_random_uuid()` | |
| | `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| | `response_id` | `uuid not null references survey_responses(id) on delete cascade` | |
| | `question_id` | `uuid not null references survey_questions(id) on delete cascade` | |
| | `scale_value` | `smallint check (scale_value is null or scale_value between 1 and 5)` | `scale_1_5` |
| | `option_id` | `uuid references survey_question_options(id) on delete cascade` | one row per chosen option — a `multi_choice` answer is N rows |
| | `text_value` | `text check (text_value is null or char_length(text_value) <= 2000)` | `free_text`, the same ceiling a rating comment has |
| | — | `check (num_nonnulls(scale_value, option_id, text_value) = 1)` | an answer is exactly one of the three shapes |
| | — | `unique index (response_id, question_id) where option_id is null` and `unique index (response_id, question_id, option_id) where option_id is not null` | one scale/text answer per question; one row per chosen option, never twice |
| | — | index `(question_id)` | the results function groups by it |

★ **`survey_responses`: why nothing on the row can find a member.** Its only columns are its own random `id`,
its `org_id` and its `survey_id`. It has no `member_id`, no `check_in_id`, no `rating_id` and **no timestamp
of any kind**, so it cannot be ordered, paired, bracketed or diffed against `ratings`, `points_ledger`,
`audit_log`, `check_ins` or the job queue. Its two foreign keys lead to `orgs` and to `surveys`, and
`surveys` leads only to `sessions` and to a template — **no foreign-key path out of a response reaches
`members`**. It is written by a job whose payload carries no member and whose key is null, at a jittered time
of its own, so neither heap order, `xmin` nor WAL position pairs it with the participation written beside the
rating. It is selectable by no client role at all.

★ **`survey_answers`: the same sentence.** Its columns are a random `id`, `org_id`, its `response_id`, its
`question_id` and one value. `response_id` reaches a row that names no member; `question_id` reaches
`survey_questions → surveys → sessions`, which names a **session**, never a person. It has no timestamp, and
no client role may select it.

**Policy posture for all three: RLS enabled, no policy, and every grant revoked** — `revoke all on … from
anon, authenticated, service_role`. This is `DEC-160` §3.3 («no client role can select a response, an answer,
or another member's participation») stated in the only place it cannot be forgotten. The isolation sweep
passes them **by refusal** (`42501`), which `isolation.test.ts` already treats as isolation. The member learns
«أجبت عن هذه الاستبانة» from `survey_for_member()`, not from a grant. **This is open question Q4** — it is a
deliberate departure from «a full policy set» and the lead rules it.

### 1d. One column on an existing table

`org_settings.survey_min_responses int not null default 3 check (survey_min_responses between 1 and 50)`,
beside `rating_min_aggregate`, with its `grant update (…)` appended to `0004`'s list so
`/app/admin/settings` can reach it later. The reasoning, and the alternative, are open question Q1.

**No change to `sessions`.** «A session with no survey» is the absence of a `surveys` row — not a flag, not a
nullable column, nothing for a screen to read by mistake.

**Two mechanical consequences for the lead, both in his files:**

1. `tests/rls/isolation.test.ts`'s last assertion («org A's own rows are visible where the role may read the
   table at all») fires for any new table a plain member may `select` but sees zero rows of. The **six
   authoring tables** — `survey_templates`, `survey_template_questions`, `survey_template_options`,
   `surveys`, `survey_questions`, `survey_question_options` — must join that skip list, beside
   `notification_templates` and `session_certificate_designs`, which are there for exactly this reason. The
   three tables of §1c need **no** entry: with no grant they are refused, and the sweep returns.
2. No fixture row of mine is needed in `tests/rls/fixture.ts`. Every survey test builds its own survey — the
   suite's own «a demonstrable starts from nothing» (`DEC-159`) applied to the RLS suite.

## 2. The functions — names, signatures, security, grants

All are `set search_path = ''`, all are proposed under `supabase/proposed/event/`, none writes `create table`
or `alter table`. `tests/rls/definer-exposure.test.ts` fails on a definer function `anon` may execute, so
**every one below carries `revoke execute … from public, anon` in the file that creates it**, and the three
that are not for a browser also revoke from `authenticated`. None starts with an underscore.

| # | Function | Security | Grant | What it is |
|---|---|---|---|---|
| A | `survey_template_save(p_template uuid, p_title text, p_questions jsonb) returns jsonb` | definer | `authenticated` | staff write: creates (`p_template` null) or **replaces the whole question set** of a template in one call |
| B | `survey_template_delete(p_template uuid) returns jsonb` | definer | `authenticated` | staff write; surveys copied from it keep working (`source_template_id` → null) |
| C | `survey_attach(p_session uuid, p_template uuid) returns jsonb` | definer | `authenticated` | **the copy**: title, questions and options into `surveys` / `survey_questions` / `survey_question_options` |
| D | `survey_detach(p_session uuid) returns jsonb` | definer | `authenticated` | staff write; refused once anyone has answered (§8) |
| E | `survey_for_member(p_session uuid) returns jsonb` | definer, stable | `authenticated` | the member's whole survey surface in one call — `null` when there is no survey |
| F | `rating_window_open(p_session uuid) returns boolean` | definer, stable | `authenticated` | ★ **the one definition of «completed, and inside `rating_window_days`»** (§6) |
| G | `rating_eligibility(p_session uuid) returns jsonb` | definer, stable | `authenticated` | `{eligible, reason, check_in_id, window_closes_at}` — what `getRatingEligibility()` stops deriving in TypeScript |
| H | ★ `submit_survey_response(p_session uuid, p_answers jsonb) returns jsonb` | definer | `authenticated` | **the one function that accepts an answer** |
| I | ★ `record_survey_response(p_response uuid, p_survey uuid, p_answers jsonb) returns int` | definer | **`service_role` only** | **the function the worker calls** — the only writer of `survey_responses` |
| J | ★ `survey_results(p_session uuid) returns jsonb` | definer, stable | `authenticated` | **the one function that releases results**, withheld (§7) |
| K | `ratings_coarsen_instants()` | trigger, **invoker** | — | `before insert or update on ratings` (§10). It neither enqueues nor notifies, so it needs no elevated right; `definer-exposure` skips trigger functions anyway |

**The `03` §1.3 re-read.** A, B, C, D and J are staff-gated and each begins with
`m := public.assert_active_member();` (which re-reads the row and refuses `stale_claims`) followed by
`if m.org_role not in ('admin','moderator') then raise exception 'not_authorized' using errcode = '42501'; end if;`
— the shape `mark_checked_in_manually()` (`0087`) already uses, because there is no `assert_fresh_staff()` and
this plan does not invent one. H calls `assert_active_member()` too; E, F and G are read-only and answer about
the caller, so they use `auth_member_id()` / `auth_org_id()` and return «nothing» rather than raising.

**The outcome envelopes (`DEC-043`).** Every refusal a screen can act on is a `{status: …}` envelope, never a
`raise` after a write:

- A: `{status:'ok', template_id}` · `{status:'title_taken'}` (detected before any write) · `{status:'empty'}`
- C: `{status:'ok', survey_id}` · `{status:'already_attached'}` · `{status:'template_empty'}`
- D: `{status:'ok'}` · `{status:'has_responses'}` — **nothing is written in the refusal branch**
- H: `{status:'ok'}` · `{status:'no_survey'}` · `{status:'not_eligible', reason}` ·
  `{status:'already_answered'}` · `{status:'invalid', missing:[question_id…]}`
  ★ **H validates before it writes anything**, so a refusal leaves no participation behind and the member can
  fix a missed required question and submit again. The only write-then-decide moment is the register itself,
  and it is an `insert … on conflict do nothing` whose zero-row result *is* `already_answered` — no raise, no
  rollback, nothing else written.
- Authority (`42501`) and `not_found` (`P0002`) still raise, before any write, as `DEC-043` allows.

**H in order**, because the order is the guarantee:

1. `assert_active_member()`.
2. Resolve the survey from the session (`surveys.session_id`); none → `{status:'no_survey'}`.
3. Eligibility: `public.has_checked_in(p_session)` **and** `public.rating_window_open(p_session)` — the same
   two predicates the rating's own policy uses (§6). Either false → `{status:'not_eligible', reason}`.
4. Validate, reading only: every `question_id` belongs to this survey; every `option_id` belongs to its
   question; `scale_1_5` in `1…5`; `single_choice` exactly one option; `multi_choice` at least one;
   `free_text` non-empty when required and `≤ 2000` characters; **every `required` question answered**.
   Failure → `{status:'invalid', missing:[…]}` naming the question ids, so the form can put the error **at the
   field** and in the summary (`REQ-UIX-009`, `010`).
5. **Normalise**: rebuild the answer array server-side from what was validated — `question_id` plus the one
   value, nothing else. Nothing the client sent passes through verbatim; a stray `request_id` in the posted
   JSON cannot reach the queue.
6. The register: `insert into survey_participations (org_id, survey_id, member_id) values (…) on conflict do
   nothing`; zero rows → `{status:'already_answered'}` (`REQ-SUR-003`: «refused by name», and the name is read
   from the register, never from the box).
7. `v_response := gen_random_uuid();` — **generated in SQL**, uncorrelated with anything, and the reason the
   job is exactly-once (§5).
8. `perform public.enqueue_job('record_survey_response', jsonb_build_object('response_id', v_response,
   'survey_id', v_survey, 'answers', v_answers), null, v_run_at, null, 5);` — key `null`, `run_at` jittered
   (§4), `max_attempts` 5. `enqueue_job` is `service_role`-only on `execute`; H is definer and owned by
   `postgres`, which is how `check_in()` and `ratings_award_points()` already reach it.
9. `{status:'ok'}` — ★ **and no `write_audit()` call** (`DEC-160` §3.5). The submit writes no audit row.

**I** inserts `survey_responses (id, org_id, survey_id)` with the id from the payload and
`on conflict (id) do nothing` — a replayed job writes nothing — then the answers, **skipping an answer whose
`question_id` no longer exists** (so a survey whose session was rebuilt cannot make a job fail forever), and
returns the number of answer rows written. Its signature and body contain no member.

## 3. What still names a member, and where it stops

| Row | Names a member? | Why that is not the leak |
|---|---|---|
| `ratings` | yes, plus two instants | both instants are coarsened to the day (§10); the presenter never selects the table |
| `survey_participations` | yes | it carries **no answer and no time**. That this member both rated and answered is already public to the database; *what they answered* is not |
| `survey_responses` / `survey_answers` | **no** | §1c |
| `surveys.attached_at` | no | a staff action's time; the table carries no member |
| the queued job | no member in the payload; a precise `created_at` inside `graphile_worker` | `DEC-160` §3.6's stated residue — `service_role` only, deleted on completion |
| a survey with exactly one participation | the register says who; the box says what | ★ this is precisely what the withhold (§7) exists for, at read time. It is the reason the response **count** is withheld too, not only the answers |

## 4. The jitter — distribution, bounds, and what a test does instead of waiting

- **Computed in SQL**, inside H, never in TypeScript and never from anything the client sent:
  `v_run_at := now() + make_interval(secs => 600 + floor(random() * 13800));`
- **Distribution:** uniform. **Bounds: `10 minutes … 4 hours`** (`600 … 14400` seconds). Long enough that a
  busy org writes many unrelated rows in between — which is the whole job of the jitter (`DEC-160` §3.2:
  transaction ids, heap order, WAL position) — and short enough that staff reading results the same evening
  see them. A longer delay buys nothing against the one residue it cannot touch: the queue row's own
  `created_at`, which is the moment of enqueue whatever `run_at` says. **Q7** if the lead wants a different
  ceiling.
- **A test never waits.** Two mechanisms, both already used in this repo:
  - in the RLS suite, the response is produced by calling `public.record_survey_response()` directly as the
    owner — the worker's own call, with the job's own payload read back out of
    `graphile_worker._private_jobs` (the pattern `award-hooks-ratings-comments.test.ts` uses);
  - in e2e, including the lead's demonstrable, the job's `run_at` is pulled forward with one statement —
    `update graphile_worker._private_jobs set run_at = now() where task_id = (select id from
    graphile_worker._private_tasks where identifier = 'record_survey_response')` — and the **real** worker
    picks it up. The spec waits for the response to exist, not for a clock.

## 5. The job (contract 7, `11` §2)

- **Task name:** `record_survey_response` (snake_case verb). Registered by the lead in `worker/src/index.ts`;
  the file `worker/src/tasks/record_survey_response.ts` is mine.
- **Payload:** `{ response_id: uuid, survey_id: uuid, answers: [ {question_id, scale_value?} |
  {question_id, option_ids: [uuid]} | {question_id, text_value} ] }`. **No member, no rating, no check-in, no
  request id, no correlation id, no org id** (the org is derived from the survey inside I).
- **Key: `null`.** Not a random string either — `enqueue_job()` always passes `job_key_mode => 'replace'`, so
  a key is a collapse mechanism and this job must never collapse. `survey:<survey>:<member>` would have been
  the leak in one string (`DEC-160` §3.2); `null` cannot be derived from anything because it is not derived.
- **Idempotency** comes from `response_id` + `on conflict (id) do nothing`, not from a key.
- **What it logs:** `helpers.logger.info(\`record_survey_response: stored 1 response with N answers\`)` — a
  count, no ids, no payload. ★ On a malformed payload it throws **naming the missing field only**; it does not
  copy `award_points.ts`'s `JSON.stringify(payload)`, which on this task would print the answers into the
  worker log. The DAL likewise maps H's status to a message key and never puts the answers in an `Error`
  message that Sentry would breadcrumb.
- **A permanent failure** (5 attempts) leaves: the participation row (so the member cannot answer again), no
  response row, and the answers sitting in `graphile_worker._private_jobs` with `last_error` — reachable by
  `service_role` alone, and `evaluate_alerts` already watches permanently failed jobs. The member is not told,
  because telling them would need a read that pairs them with a response. **Stated, not hidden**: the response
  rate is one lower and the results are short one response. `max_attempts` is 5 rather than the default 25 so
  the failure surfaces the same day.

## 6. Eligibility — how a third copy is avoided

Today the rule «an active check-in, the session completed, inside `rating_window_days`» exists **twice**: in
`ratings_write_self` / `ratings_update_self` (`0010`, re-created by `0087`) and again, in TypeScript, in
`getRatingEligibility()`. The survey needs the same rule, and copying it would make three.

**The decomposition, which leaves one definition of each rule:**

- «an active check-in on any day» is already **one** function — `public.has_checked_in()` (`0087`). The
  policy's own `check_in_id in (select …)` clause is *not* a copy of it: it binds the **supplied column** to
  one of the caller's active check-ins, which no boolean can do, and with multi-day sessions a member may hold
  several. It stays exactly as `0087` wrote it.
- «the session is completed and `now() ≤ completed_at + rating_window_days`» becomes **F,
  `public.rating_window_open(p_session)`**. `ratings_write_self` and `ratings_update_self` are dropped and
  re-created **in the same file** to call it — the predicate is equivalent by construction, and the existing
  cases (`POL-ratings.insert.window`, `POL-ratings.insert.check_in`, `POL-ratings.select.*`,
  `POL-ratings.write_self_excludes_removed`, and `m2-schema.test.ts`'s rating cases) are the proof, **all
  unmodified**. If any of them turns red, the re-creation is wrong and it is a finding, not a test to repair.
- `submit_survey_response()` calls `has_checked_in()` and `rating_window_open()` — the same two, never a
  third text.
- **G returns the composition**, and `getRatingEligibility()` calls G instead of re-deriving it. The
  TypeScript copy is deleted; the DTO, the reasons (`not_completed` / `not_checked_in` / `window_closed`),
  `checkInId` and `windowClosesAt` are unchanged, so `rate/page.tsx`, `components/event/ratings.tsx` and
  `tests/components/event/ratings.test.tsx` see exactly what they see today. The existing rating select
  (`ratings_read_self`) stays a plain select.
- A new RLS case, `RPC-rating_eligibility.agrees_with_policy`, walks the six situations (not completed ·
  completed and never checked in · check-in removed · inside the window · past the window · another org) and
  asserts that `rating_eligibility().eligible` is **true exactly when the insert succeeds** — the two
  remaining expressions pinned to each other by a test.

## 7. The withhold (`REQ-SUR-006`, `REQ-SUR-008`)

**The minimum is `org_settings.survey_min_responses`, default `3`** (Q1 — recommendation and alternative
below). Call it `min`, and let `n` be the number of **stored responses** for the survey.

| Case | What `survey_results()` returns | What SCR-064 and the CSV show |
|---|---|---|
| `n < min` | `{withheld: true, min, eligible_count}` **and nothing else — not even `n`** | «النتائج محجوبة حتى تصل الاستجابات إلى {min}» and the reason. Never an empty chart. The CSV is one row carrying the same sentence, not an empty file |
| `n ≥ min`, per question `n_q < min` | that question alone: `{withheld: true}` | «محجوبة» in the question's own card |
| `n ≥ min`, `n_q ≥ min`, `scale_1_5` | `count`, `mean` (2 dp), and the `1…5` distribution | a bar per value, growing from the **start** edge, each bar carrying its own number |
| `n ≥ min`, `n_q ≥ min`, `single_choice` / `multi_choice` | `count` per option, in the options' authored order | the distribution; **no cell-level suppression** — a cell count says that *someone* chose an option, never who, while a distribution over two responses read against a twelve-person attendance list narrows to two people. The unit of disclosure is the **response**, not the cell |
| `n ≥ min`, `n_q ≥ min`, `free_text` | the texts, ordered by `survey_answers.id` | an anonymised list. ★ Ordered by a random v4 uuid **on purpose**: not by `ctid`, not by insertion order, not by any expression that could re-derive who answered first |
| response rate | `{response_count: n, eligible_count: e}` only when `n ≥ min` | `n / e` in Western digits. ★ The numerator is **withheld below the minimum too** — in a survey one person answered, the register says who, and publishing «1» is the other half of that sentence |
| `e = 0` | `{eligible_count: 0}` | «لا حضور مؤهلون بعد» — a sentence, not a division (`REQ-SUR-008`) |

- `n_q` is «how many responses answered *this* question», which differs from `n` whenever a question is
  optional — which is why the withhold is evaluated per question and not once for the survey.
- `e` = **distinct members with an active check-in on this session, on any day** (`removed_at is null`) —
  `REQ-SUR-008`'s «checked-in attendee count», and the same population `has_checked_in()` gates.
- **One function, two exits.** `survey_results()` is called once by `lib/dal/surveys.ts`; the screen and the
  CSV are two shapes of the one already-withheld result, so `REQ-SUR-007`'s «the withhold applies to the
  export exactly as to the screen» is true by construction and not by a second implementation.
- **No audit row on the screen read**: the results name nobody, unlike `REQ-RAT-005`'s per-rater ratings. The
  **CSV** is audited, through the existing path (contract 6).

## 8. Copy semantics — the four cases, each with a rule and a test

1. **A template edited after it was attached.** Nothing happens to the session's survey. `survey_attach()`
   copies title, questions and options into `surveys` / `survey_questions` / `survey_question_options`;
   `source_template_id` and `source_question_id` are provenance and are never read to render. Test:
   `survey-authoring.test.ts` — attach, edit the template's prompts, read the survey, see the old text.
2. **A question deleted from a survey that has responses.** ★ **Refused: once a survey has any participation,
   its question set is frozen** — no add, no delete, no retype, no reorder, no change of `required`. The only
   survey-level edit left is detaching, which case 3 also refuses. The alternative (allow it, cascade the
   answers) silently destroys collected data and makes every released distribution a lie about its own
   denominator. The screen says «لا يمكن تعديل الأسئلة بعد أول إجابة» **before** the member tries. There is no
   question-level edit RPC on an attached survey at all in this plan — the only way to change one is to detach
   an unanswered survey and attach again — so the freeze is structural for everything but the template.
3. **A survey detached.** Allowed while no one has answered: `survey_detach()` deletes the survey and its
   questions (the cascade). Once anyone has answered → `{status:'has_responses'}`, nothing written. Deleting
   the **session** still deletes everything, by cascade, which is right: there is no survey without a session.
4. **A survey attached after some members already rated.** Nothing is retro-active and nothing is chased. A
   member who returns to `/rate` inside the window sees their rating pre-filled and the survey below it, and
   one action updates the rating and submits the survey. A member who never returns never answers, and the
   response rate says so — which is why SCR-064 renders `attached_at` when it is later than
   `sessions.completed_at`, with «أُضيفت بعد انتهاء الجلسة، وقد يكون بعض الحضور قيّم قبل إضافتها». No
   notification is sent: `MSG-rating_prompt` is `notify`'s and **does not mention a survey** (`REQ-SUR-001`).

## 9. What the member sees (SCR-015, `REQ-SUR-004`)

- **One screen, one action, two writes.** The rating first, the survey below it, one submit button —
  «إرسال التقييم والإجابات» (or «تحديث التقييم وإرسال الإجابات» when a rating exists).
- **The action validates the whole form before it writes anything**, exactly as `capture()` already does for
  the two star rows: a missing required question is a field error **and** a summary line linking to it
  (`REQ-UIX-009`, `010`), and the rating is not written on a round trip the survey would have failed. Every
  answered value survives the round trip through `lib/form-state.ts` — the survey's fields are
  `` `q:${questionId}` ``, which `FormState<F extends string>` already supports, with `lists` for
  `multi_choice`.
- **Between the submit and the job:** the receipt says «تم إرسال تقييمك وإجاباتك» and **nothing about a
  queue** — no «قيد المعالجة», no spinner, no poll, no timer (`DEC-146`). The member's part is over; the
  storage is not their business, and a progress indicator would be a second surface saying «something about
  you is in flight».
- **On return** (the window still open): the rating is pre-filled and editable; the survey section reads
  «شكرًا، أجبت عن هذه الاستبانة» from `survey_for_member().answered` and shows **no answers** — a member
  cannot re-open or edit them, which is `DEC-160` §3's stated cost and is stated in the copy, not hidden.
- **When the rating already exists and the survey is unanswered:** the one action updates the rating and
  submits the survey. If the RPC then refuses on a race (the survey was detached between render and submit),
  the rating is already saved and the form says so honestly — «حُفظ تقييمك، ولم تُرسَل الإجابات» — rather than
  claiming both or neither.
- **A session with no survey:** `survey_for_member()` returns `null` and the screen renders exactly what it
  renders today. §11.

## 10. E5 — `ratings` holds no instant finer than a day (`DEC-160` §3.4, contract 3)

**The trigger.** `public.ratings_coarsen_instants()`, `before insert or update on public.ratings for each
row`, plain (invoker) plpgsql, `set search_path = ''`:

```
new.submitted_at := date_trunc('day', new.submitted_at at time zone 'UTC') at time zone 'UTC';
if new.edited_at is not null then
  new.edited_at := date_trunc('day', new.edited_at at time zone 'UTC') at time zone 'UTC';
end if;
```

★ **Pinned to UTC on purpose.** `date_trunc('day', timestamptz)` truncates in the *session's* `TimeZone` GUC,
so an unpinned expression would store a different instant depending on who connected — a trigger whose output
depends on a client setting is not a guarantee. The org's own zone was the alternative and is rejected: it
reads `org_settings` on every rating insert, and an org that later changes its zone would have two
generations of rows meaning different things. **It covers `update` as well as `insert` because `main`'s app
writes `edited_at` from JavaScript at millisecond precision** (`lib/dal/ratings.ts:146`) and will keep doing
so until Vercel redeploys.

**The backfill**, in the same migration (`DEC-160` §3.4 asks for it there; this is the completion of a schema
change, not `DEC-023`'s «one-off data fix as a migration»):

```
update public.ratings
   set submitted_at = date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC',
       edited_at    = case when edited_at is null then null
                           else date_trunc('day', edited_at at time zone 'UTC') at time zone 'UTC' end
 where submitted_at <> date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC'
    or (edited_at is not null and edited_at <> date_trunc('day', edited_at at time zone 'UTC') at time zone 'UTC');
```

The `where` clause makes it idempotent and makes the production run's row count meaningful (the owner's order
item (a): count first, then update). ★ **No trigger fires on this update**: `ratings` carries exactly one
other trigger, `ratings_award_points`, and it is `after insert` — the backfill enqueues nothing.

**`session_rating_aggregates`** is re-created in the same file, `create or replace view … with
(security_invoker = false)`, identical in every column, with one change:
`array_agg(r.comment order by r.submitted_at)` → `array_agg(r.comment order by r.id)`. Submission order is
itself a disclosure to a presenter who watched people leave, and after coarsening the old ordering would in
any case be arbitrary-within-a-day — «arbitrary» is not a guarantee, `order by id` (a random v4 uuid) is. No
test asserts the comment order today: `ratings-count.test.ts:18` and `m2-schema.test.ts:260,264` read
`rating_count` and the column list only.

**Every existing reader of either instant, read rather than remembered:**

| Reader | Reads | What a coarsened value does to it |
|---|---|---|
| `src/lib/dal/ratings.ts:81` (`getRatingEligibility`) | both, into `RatingDTO` | nothing renders them — `rate/page.tsx` shows stars, comment and the window's closing date only; its own header already says «nothing here writes `submitted_at`» |
| `src/lib/dal/ratings.ts:146` (`updateRating`) | writes `edited_at` | coarsened by the trigger; the call returns `select id` and never compares what it wrote |
| `src/app/[locale]/app/admin/sessions/[id]/attendance/page.tsx:317-331` | `AdminRatingRow` | renders the member, the two star counts and the comment — **no time at all** |
| `tests/components/event/ratings.test.tsx:57` | `submittedAt: "x"` | a literal in a fixture; unaffected |
| `0010`'s `session_rating_aggregates` | `order by submitted_at` | changed above, in my file |
| `0073` / `0088`'s member data export (`REQ-PRF-006`) | emits and orders by `submitted_at` | the member's own export now shows a date instead of an instant, ordered arbitrarily within a day. **`platform`'s function, held by the lead — I change nothing.** Q6 |
| `0035`'s rating-prompt filter | `not exists (… ratings …)` | no instant read |
| `0041`'s recognition evaluators | `count(*)`, `avg(session_stars)` | no instant read |
| `admin-exports.ts:327` (`exportRatingsCsv`) | the aggregate view, counts and averages | no instant read |

**So, contract 3 — what `main` does between the push and the redeploy:** `main`'s app inserts a rating with
`submitted_at` defaulted and the trigger coarsens it (no column dropped, no signature changed, the insert
still succeeds); it writes `edited_at` at millisecond precision and the trigger coarsens that too, which is
exactly why the trigger covers `update`; it reads both into a DTO that renders neither; and `main`'s worker
never touches either — `rating_prompt`, `award_points` and the recognition evaluators read existence, counts
and averages. **Nothing on `main` breaks, and nothing needs the order to hold anything back for the rating.**
The one thing the order must carry is the backfill's row count on production, read before it runs.

## 11. The «no survey» proof — the files I do not touch

`REQ-SUR-001`'s «shows nothing about one, anywhere» is proven by these passing **with their assertions
untouched**, and none of them is in a commit of mine:

- **e2e:** `tests/e2e/wave7-sessions-rate.spec.ts` (six cases: empty · the stars fill from the right ·
  error · submitted · closed · not eligible) and `tests/e2e/event-rate.spec.ts` (four cases: no check-in ·
  rates and is reflected · the edit is pre-filled · a failed submission keeps what was typed). Both are in my
  edit list «as evidence»; **I edit neither**, and no ledger line is needed from me. A survey case goes into
  the new `tests/e2e/wave10-event-rate-survey.spec.ts`, which builds its own session **with** a survey.
- **components:** `tests/components/event/ratings.test.tsx` (seven cases) and
  `tests/components/event/star-rating.test.tsx` (eight, including the one that pins that the row is never
  laid out reversed). Unchanged; the new survey components get `tests/components/survey/**`.
- **RLS:** `tests/rls/ratings-audit.test.ts`, `ratings-count.test.ts`,
  `award-hooks-ratings-comments.test.ts`, and `m2-schema.test.ts`'s rating cases (not mine at all) — all
  unchanged, and they are also the proof that §6's re-created policies are equivalent.
- **structurally:** the survey adds no column to `sessions` and no row anywhere for a session with no survey,
  so `survey_for_member()` returns `null` and the rate screen's tree is byte-for-byte what it is today. The
  capture `wave10-event-rate-no-survey.png` is taken beside `wave7-sessions-rate-empty.png` for the lead to
  put side by side.

## 12. The structural test that restates `REQ-SUR-009`

`tests/rls/survey-structure.test.ts`, generated over the catalogue the way `definer-exposure` and the
isolation sweep are, so a column added next year fails it:

1. **No column can name a member.** For `survey_responses` and `survey_answers`: no column whose name matches
   `member|check_in|checkin|rating|rater|user|auth`, and **no column of type `timestamptz`, `timestamp`,
   `date` or `time` at all**. For `survey_participations`: no timestamp column either.
2. **No foreign-key path reaches `members`.** Walk `pg_constraint` from the two tables transitively; assert
   `members` is not reachable, and that the referenced set is exactly `{orgs, surveys, survey_questions,
   survey_question_options, survey_responses}`.
3. **The queued payload names no member.** Submit as a member, read the job row as the owner, assert the
   payload's keys are exactly `{response_id, survey_id, answers}`, that `payload::text` contains neither the
   member id, nor the rating id, nor any check-in id of that member, and that **`key` is null**.
4. **No client role selects a response, an answer or a participation** — `anon`, a member, the session's
   presenter, a moderator, an admin and `service_role` each get `42501` on all three tables.
5. **`REQ-SUR-005`'s explicit case:** the presenter is refused by `survey_results()`, and there is no policy
   that would have let them read anything anyway.
6. **A rating's two instants are midnight:** insert as a member, update as a member, assert both equal
   `date_trunc('day', … at time zone 'UTC') at time zone 'UTC'`.
7. **The submit writes no audit row:** `audit_log` is unchanged across a submit.

`03` §8.2 rows to hand the lead: `POL-survey_responses.no_client_select` ·
`POL-survey_answers.no_client_select` · `POL-survey_participations.no_client_select` ·
`POL-survey_templates.staff_read` · `POL-surveys.staff_read` · `RPC-submit_survey_response.eligibility` ·
`RPC-submit_survey_response.second_submission` · `RPC-submit_survey_response.enqueues_decorrelated` ·
`RPC-record_survey_response.service_role_only` · `RPC-record_survey_response.replay` ·
`RPC-survey_results.staff_only` · `RPC-survey_results.presenter_refused` ·
`RPC-survey_results.withheld_every_type` · `RPC-survey_attach.copies` · `RPC-survey_detach.has_responses` ·
`RPC-rating_eligibility.agrees_with_policy` · `POL-ratings.day_precision` · `RPC-survey.structure`.

## 13. Routes, files, the namespace, and what I need from the lead

**Routes** (all three already in `04` §4 — `171-172` — and `09` SCR-064/SCR-065; `DEC-083` satisfied):
`/app/admin/surveys` · `/app/admin/surveys/[templateId]` · `/app/admin/sessions/[id]/survey`.

**Files I will create** (all inside my edit list):
`src/app/[locale]/app/admin/surveys/{page,loading,error}.tsx` · `surveys/[templateId]/{page,editor,actions,state}.tsx` ·
`src/app/[locale]/app/admin/sessions/[id]/survey/{page,loading,error,actions}.tsx` ·
`src/components/survey/**` (the question editor, the option list, the member-side form, the results
distributions) · `src/lib/dal/surveys.ts` · `worker/src/tasks/record_survey_response.ts` ·
`src/messages/{ar,en}/survey.json` + the one appended `"survey"` in `src/messages/index.ts` (same commit;
no collision — no namespace has a top-level `survey` key today) · `supabase/proposed/event/01_ratings_day_precision.sql`,
`02_rating_eligibility.sql`, `03_survey_authoring.sql`, `04_survey_submit.sql`, `05_survey_results.sql`.
`messages/*/ratings.json` gains only the rate screen's survey-side strings.

**What I need from the lead:**

- **Contract 2 — `ui/reorderable-list`: nothing.** See §13a — read as committed, no prop request.
- **Contract 6 — the results' two exits.** `lib/dal/surveys.ts` will export
  `getSurveyExportRows(locale, sessionId): Promise<{ headers: string[]; rows: string[][]; sessionTitle: string;
  withheld: boolean } | null>` — **already withheld**, Western digits, Arabic headers, ready for
  `buildCsv()`. The lead: adds `"survey"` to `EXPORT_TYPES` in `admin-exports.ts`, a thin
  `exportSurveyCsv(locale, sessionId)` calling `auditExport(locale, 'survey', 'session', sessionId)`, the
  route under `src/app/api/admin/exports/**`, the rail's «الاستبانات» group entry and the per-session link to
  SCR-064. ★ **Note the audience mismatch: `write_admin_export_audit()` calls `assert_fresh_admin()`** — see
  Q3.
- **Contract 7 — `record_survey_response` registered in `worker/src/index.ts`.**
- **Row L2 — the ten tables, the enum and the one `org_settings` column of §1**, plus the six names in
  `isolation.test.ts`'s skip list and the `02` / `03` §8.2 / `11` / `12` text `DEC-074` and `DEC-094` never
  wrote.
- **Nothing else.** I need no change to `session-status.ts` (`GRANTING_AFFORDANCES.ended` already lists
  `"survey"`), none to `session-matrix.ts`, none to the event page or its action card, and none to any `ui/`
  primitive — the survey form uses `field`, `radio-group`, `checkbox`, `textarea`, `form-summary`,
  `submit-button`, `panel`, `empty-state`, `card`, `badge` and `progress` **as they are**, imported by path.

## 13a. Contract 2 as landed (`d260144`) — what SCR-065 is built against

Read from disk after the commit, not from the copy I saw while it was in flight:
`src/components/ui/reorderable-list.tsx`, `ReorderableListProps<Item>` / `ReorderableRowContext` /
`ReorderableMove` in `src/components/ui/index.ts`, `messages/ar/ui.json`'s `ui.reorderableList`, the
gallery island `(dev)/ui/reorderable-demo.tsx`, and `tests/components/ui/reorderable-list.test.tsx`
(fourteen cases, including «SC 2.5.7 — a click alone moves a row down», focus kept on the button that
moved the row, and axe-clean). ★ **No prop request. Nothing to add, nothing to work around.** What the
props mean for my two lists, so the editor is designed against them rather than around them:

1. ★ **It is controlled, so the editor is a `"use client"` island holding the question array in state.**
   `onReorder(nextKeys, { key, from, to })` hands back the whole new order **by key**; the editor maps it
   back to its own array and re-renders. `renderItem` is a function prop, so a Server Component cannot hold
   it — «Event handlers cannot be passed to Client Component props», the crash only a production build
   produces (`DEC-159`). The page stays a Server Component: it reads the template through
   `lib/dal/surveys.ts` and renders `<TemplateEditor template={…}>` with plain data, and the bound
   `"use server"` action is bound **inside** the island. The gallery's demo is exactly this shape and is the
   pattern I follow.
2. ★ **`getKey` must be stable across a reorder, and a new question has no database id yet.** Each row
   carries a client-side key from `crypto.randomUUID()`, held in the editor's state from the moment «أضف
   سؤالًا» is pressed — never the array index, which changes under the row the moment it moves, and never
   the position. The key is editor state only: `survey_template_save()` reads **the array order** and
   assigns `position` `1…n` itself, so no client-generated identifier reaches the database.
3. ★ **`getName` is never empty.** It is what every ▲▼ is described by and what the status region announces,
   so an untitled question falls back to «سؤال {position}» and an empty option to «خيار {position}», in
   Western digits (`DEC-124`) — matching `ui.reorderableList.moved`, «نُقل <t>{name}</t> إلى الموضع
   {position} من {total}», which already bidi-isolates the name. Once the prompt is typed, the prompt is the
   name.
4. **`renderActions`** carries the row's own «حذف السؤال» (and «حذف الخيار» in the nested list) as an
   `IconButton`, beside ▲▼ and not inside `renderItem`, so the row's controls are one group.
5. **`size`**: `md` for the question list (the house target), **`sm` for a choice question's options**, which
   is a list nested inside a question card — the dense case the prop documents.
6. **`disabled`** covers two states I already need: a save in flight (`useActionState`'s pending — **never a
   timer, an interval or a nudge**, `DEC-146`), and a list that may not be reordered at all. The second is
   §8 case 2's freeze: on an **attached** survey there is no question-level editing, so SCR-064 never renders
   a reorderable list — the freeze is structural and `disabled` is only the courtesy.
7. **A reorder does not save by itself.** The editor holds the order and «حفظ» submits the whole set through
   `survey_template_save()`, which is a whole-set replace — a controlled list and a whole-set write are the
   same shape, which is why the RPC is specified that way in §2 A.
8. **My spec uses `click()` only** (`tests/e2e/wave10-event-templates.spec.ts`), the way the primitive's own
   SC 2.5.7 case does, and the capture `wave10-event-templates-editor-moved.png` is taken after a move.

## 14. Open questions — each with my recommendation

| # | Question | My recommendation |
|---|---|---|
| Q1 | The minimum: `org_settings.rating_min_aggregate`, or a setting of its own? | ★ **Its own column, `survey_min_responses`, default `3`.** The two instruments protect against different readers — the rating's minimum hides a session from its **presenter**, while the survey's hides respondents from **staff themselves**, who can already read the attendance list and per-rater ratings. Tying them means an org that lowers one silently lowers the other. At the default the behaviour is identical to reusing it, so nothing changes for an org that never touches it. If the lead prefers zero new columns, it is a one-line change in `survey_results()` and nothing else in this plan moves |
| Q2 | An org **admin who presents the session** — results or not? (`REQ-SUR-005` says a presenter cannot read; `DEC-074` says an admin can) | ★ **Refused: presenting wins over the role.** `survey_results()` refuses anyone for whom `is_presenter_of(p_session)` is true, whatever their `org_role`, with an explicit test. The ask exists so a presenter never reads their own session's survey, and an admin-presenter is exactly that person; the org's other admins and its moderators still read it. This deliberately differs from `ratings`, where an admin reads per-rater rows for a session they present — worth a line in `03` so the difference is a decision and not an accident |
| Q3 | The CSV and the **moderator**: `write_admin_export_audit()` (`0058`) calls `assert_fresh_admin()`, so a moderator cannot write the audit row | ★ **The export is admin-only; the screen is admin-and-moderator.** `REQ-SUR-007` says «through the existing audited export path» and `REQ-ADM-017` makes exports an admin capability; SCR-064 hides «تصدير CSV» from a moderator with «التصدير لمشرفي المؤسسة». Zero new SQL. The alternative — a staff variant of the audit function — widens a bulk-personal-data path for one button |
| Q4 | `survey_responses`, `survey_answers`, `survey_participations` have **RLS on, no policy, no grant**. Invariant 5 says «a full policy set» | ★ **Allow it, and document it** as the executable form of `DEC-160` §3.3, the way `platform_admins` / `retention_periods` / `platform_audit_log` are documented in `02` §7 (`DEC-054`). The sweep passes them by refusal. A policy that grants nobody anything would be a decorative row that a later «just add a staff select» would quietly amend |
| Q5 | Do template and attach writes leave an **audit row**? | ★ **Audit `survey_attach` and `survey_detach` only** — one `write_audit()` each (`survey.attached` / `survey.detached`), because they change what members are asked and by whom. **Not** template edits (no requirement asks, and it would be a row per keystroke-batch). ★ And **never** the submit (`DEC-160` §3.5) |
| Q6 | The PDPL self-export (`REQ-PRF-006`): `DEC-160` says it contains «you answered this survey» and not the answers. `member_data_export()` (`0073` / `0088`) is not mine | ★ **The lead adds one array** — the surveys the member has a participation in, by session title, **with no timestamp** — in the same migration as the tables. It is one `jsonb_agg`, and an export that omits a fact the database holds about the member is a completeness gap in something audited. If the lead would rather not touch `platform`'s function this wave, carry it with this sentence |
| Q7 | The jitter's bounds | ★ **Uniform on `10 minutes … 4 hours`**, in SQL. Shorter buys nothing; longer only lengthens the queue-row residue that the bounds cannot fix anyway |
| Q8 | Freezing a survey's question set after the first participation (§8 case 2) | ★ **Freeze it.** The alternative destroys collected answers by cascade and leaves released distributions lying about their own denominators. The screen says so before the staff member tries, and a template stays editable forever |
| Q9 | The demonstrable's «three members rate and answer» needs three signed-in members on one session; my own specs need fewer | ★ Mine build **one** member and drive the withhold by moving `survey_min_responses` (`1` → drawn, `3` → withheld) rather than by seeding three sign-ins. The lead's `wave10-demo-survey.spec.ts` does the real three, on the real worker — that is what it is for |

## 15. The order I would build it in

1. **E5 first** (`01_ratings_day_precision.sql` + `ratings-day-precision.test.ts`): it is the smallest, it is
   the one piece `main` runs on before the app redeploys, and it closes a finding carried since wave 6.
2. **§6** (`02_rating_eligibility.sql`): `rating_window_open()`, `rating_eligibility()`, the two re-created
   policies, the DAL switched — with the existing rating suites as the proof, before any survey table exists.
3. **E1's authoring half** on the lead's tables (`03_survey_authoring.sql`) → **E3, SCR-065**.
4. **E1's answer half** (`04_survey_submit.sql`), the worker task, the structural test → **E2, SCR-015**.
5. **E1's read half** (`05_survey_results.sql`) → **E4, SCR-064** and the CSV rows for contract 6.

Captures, all at `390 × 844` on the phone project, honouring `E2E_SHOTS_DIR`:
`wave10-event-rate-no-survey` (beside wave 7's) · `-rate-survey-empty` · `-rate-survey-error` ·
`-rate-survey-submitted` · `-templates-empty` · `-templates-list` · `-templates-editor-moved` ·
`-survey-none` · `-survey-withheld` · `-survey-results` · `-survey-presenter-refused`.

**Nothing in §1 or §2 is built until the lead approves this plan at sync 1.**
