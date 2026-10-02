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
  (`REQ-UIX-009`, `010`), and the rating is not written on a round trip the survey would have failed. ★★
  **SUPERSEDED BY `DEC-164`, and the lead was right to ask.** That last clause was my reading of
  `REQ-SUR-002`'s «blocks submission» — which does not say whose — and its consequence is a THIRD gate on
  the rating that no requirement states: the org's required question would withhold the member's own voice,
  and with it the presenter's aggregate, the rating's points and the recognition evaluators. The rule now:
  the rating's own validation fails → nothing is written, as before; the rating is valid → **it is written**,
  and the survey alone is refused, at the field and in the summary, which says «حُفظ تقييمك. أكمل الأسئلة
  المطلوبة لإرسال إجاباتك.». A second press sends the survey alone. Every
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

---

# Wave 10 — what was built, and what the building changed

**The plan above was approved at sync 1 with one defect and ten rulings (`DEC-161`).** Everything in it is
built except the e2e RUN and the captures, which wait on promotion and a production build. This section is
the record: what exists, what the build changed about the plan, and what it found.

## A. What exists, file by file

| Commit | What |
|---|---|
| `675f6a9` | **E5** — `01_ratings_day_precision.sql`: the coarsening trigger, the backfill, the aggregates view re-ordered · `tests/rls/ratings-day-precision.test.ts` (5) |
| `da59594` | **§6** — `02_rating_eligibility.sql`: `rating_window_open()` and both ratings policies re-created to call it · `tests/rls/ratings-eligibility.test.ts` (4) |
| `9a2832f` | **E1 authoring** — `03_survey_authoring.sql`: `assert_survey_staff()`, `survey_template_save/delete()`, `survey_attach/detach()` · `tests/rls/survey-authoring.test.ts` (9) |
| `2b54733` | **E1 answers** — `04_survey_submit.sql`: `survey_for_member()`, `submit_survey_response()`, `record_survey_response()` · `worker/src/tasks/record_survey_response.ts` · `tests/rls/{survey-submit,survey-structure}.test.ts` (8 + 5) · `tests/unit/survey-record-task.test.ts` (5) |
| `f54f442` | **E1 results** — `05_survey_results.sql`: the one function that releases results · `tests/rls/survey-results.test.ts` (8) |
| `ff53191` | `src/lib/dal/surveys.ts` · `messages/{ar,en}/survey.json` · the appended namespace |
| `101b102` | **E2** — SCR-015 carrying both · `components/survey/question-field.tsx` · `tests/components/survey/question-field.test.tsx` (8) |
| `59bd5cb` | **E3** — SCR-065, the list and the editor · `tests/components/survey/template-editor.test.tsx` (9) |
| `97a9caa` | **E4** — SCR-064 and `components/survey/results.tsx` · `tests/components/survey/results.test.tsx` (5) |
| `e6b38fb` | the three e2e specs and their eleven captures — written, not yet run |

## B. What the building changed about the plan

1. ★ **`rating_eligibility()` is gone** (sync 1, R1). `rating_window_open()` is the one definition the two
   policies and `submit_survey_response()` share; `getRatingEligibility()` keeps deriving the SCREEN's reason
   in TypeScript, and `tests/unit/sessions-removed-check-in.test.ts` stays untouched.
2. **`assert_survey_staff()` is new**, because `0005` has an `assert_fresh_admin()` and no staff twin, and
   five functions of mine need «admin or moderator, re-read from the row».
3. **A template is saved WHOLE**, and the cost is stated in the file: a re-save re-creates the question rows,
   so an already-attached survey loses `source_question_id` (`on delete set null`). Nothing renders
   provenance; SCR-065 counts `surveys.source_template_id`, which survives.
4. ★ **The freeze is structural, not a disabled control.** There is no RPC anywhere that edits an attached
   survey's questions, so SCR-064 renders no question editing at all and `survey_detach()` refuses once
   `survey_participations` has a row.
5. ★ **SCR-065's editor is not a `<form action>`.** Two reasons and both are load-bearing:
   `ui/reorderable-list` takes `renderItem`, so a Server Component holding it is `DEC-159`'s production-only
   crash; and **`ui/input` carries no controlled-reset repair** (`select`, `switch`, `checkbox` and
   `radio-group` do), so React's reset after a refused save would empty every prompt and every option label
   (`DEC-149` §1). The save runs in a transition.
6. ★ **`components/survey/question-field.tsx` is written rather than composed from `ui/radio-group`** —
   that primitive's `legend` is a `string`, so the «مطلوب» marker cannot be its own span, and it has **no
   `error` prop**, while a question that blocks submission must say so at the field (`REQ-UIX-010`).
   `star-rating.tsx` hand-rolls for the same reason. **The request, which I am NOT making this wave:**
   `RadioGroupProps` gains `error?: ReactNode` and a `ReactNode` legend, and three files simplify. The rows
   already use the primitive's own classes to the character.
7. **A scale shows the digit and is announced as the sentence** — «واحد من 5» — which is `star-rating.tsx`'s
   split. The plural spells one and two out, which is right in Arabic prose and wrong as a visible label.
8. **With a survey on screen, `already_rated` stops being a refusal.** The member pressed one button for two
   things; if the rating is already there a retry must not stall on the half that succeeded. Without a survey
   the behaviour is exactly what it was, which is what keeps the two untouched specs untouched.
9. **SCR-064's outcomes travel in the URL** — `?attached=1`, `?error=has_responses`, `?confirm=1` — the shape
   `?rated=1` already uses. No island for a form with one control, and a reload keeps the sentence.
10. **The CSV's columns** are `السؤال · النوع · عدد المجيبين · القيمة · العدد · المتوسط`, with the response
    rate as the first row in the same columns so both its numbers parse. A withheld result is **one row
    saying so**, never an empty file, and a question nobody answered keeps its row — a missing row would read
    as «nobody asked it».

## C. What the building found

- ★ **A plural may not use `#`.** `tests/unit/messages-numerals.test.ts` refuses it: `#` renders in the
  locale's own digits, so a number goes through `formatNumber` as `{value}` (`DEC-124`). My Arabic was right
  and the English twin was not, in all seven plurals.
- ★ **Three sessions share one database, so a full `test:rls` run is worthless unless it is alone.** Every
  failure I saw in a shared run today — six fixture-seed failures, ten in `certificates-reissue`, then
  `unknown_binding: session.title` across two admin files — passed alone minutes later. I now wait on
  `until ! pgrep -f "[n]ode_modules/.bin/vitest"` before every run, and I said so to the lead rather than
  reporting the failures as defects. **One of them was real and is `designer`'s:**
  `unrecognized GET DIAGNOSTICS item at or near "pg_exception_constraint_name"` — the item is plain
  `CONSTRAINT_NAME` and only through `GET STACKED DIAGNOSTICS`.
- **A mutation check is worth its minute.** Three of my cases could have been vacuous and I would not have
  known: unpinning the UTC truncation, restoring `order by r.submitted_at`, and dropping the org clause from
  `rating_window_open()` each turn exactly one case red. All three reverted and re-run green.
- **`getTranslations` throws in the components project**, and an async child component cannot be rendered by
  RTL at all — so a Server Component that wants a test keeps its async at the TOP and passes the translator
  down, the `day-label` idiom.

## D. What is left, and what it waits on

| | Waits on |
|---|---|
| `npm run test:e2e:local` for the three new specs **and the two untouched rate specs** | the lead promoting `01`–`05` and applying them locally — until then `/app/sessions/[id]/rate` calls a function that does not exist, for every session |
| the eleven captures, opened in bands | a production build (lead-only) |
| `admin.json`'s `survey.attached` / `survey.detached` labels | the lead, in the promotion commit, or `admin-audit-labels` goes red |
| `record_survey_response` in `worker/src/index.ts` | the lead (contract 7) |

**Already done by the lead and wired to, not guessed:** `/api/admin/exports/survey/[sessionId]`, whose
`exportSurveyCsv()` consumes `getSurveyExportRows()` exactly as contract 6 specified, and the rail's
«الاستبانات» leaf.

---

# ★ STAND-DOWN, 2026-09-17 — where the survey is, and the one thing left

**My last hash: `e662de3`. Nothing of mine is uncommitted** — `git status` at stand-down shows only
`notify`'s `packages/mail-runtime/**` and its two test files. No file of mine is half-edited on disk.

## What is DONE — the whole survey, E1 … E5

Promoted and applied: `0130` (ratings to the day), `0131` (`rating_window_open`), `0132` (authoring),
`0137` (submit + store), `0138` (results, with the lead's fail-closed correction). The DAL, the messages, the
three screens, the worker task, and 39 RLS cases + 41 unit/component cases across nine files.

★ **The «no survey» proof is established on a real build**, which is the half I could not establish myself:
the lead ran `event-rate.spec.ts` and `wave7-sessions-rate.spec.ts` **untouched** on a production build, both
projects, and both passed. `REQ-SUR-001` holds.

## ★ The lead's «next action» list is ALREADY IN `e662de3` — do not redo it

The stand-down crossed with my last message. All four items it names are committed:

| The item | Where |
|---|---|
| windows that do not overlap (`check_ins_member_id_session_window_excl`) | `wave10-event-rate-survey.spec.ts` — each session and check-in at 6 / 4 / 2 hours back |
| the status scoped to the outer list | `wave10-event-templates.spec.ts` — `.filter({ hasText: "إلى الموضع" })` |
| the heading role for «نسبة الاستجابة» | `wave10-event-survey-results.spec.ts`, **and** the screen: the Stat's label is «المجيبون» now, because the stutter was the page's fault and not the spec's |
| the six-line second-press update | `actions.ts` + `ratingChanged()` in `state.ts` + `tests/unit/ratings-second-press.test.ts` (5 cases) |

## THE ONE THING OPEN

**A production build at `e662de3` and a re-run of the five specs** — `wave10-event-{rate-survey,templates,
survey-results}.spec.ts` plus the two untouched rate specs — then the **eleven captures** at
`.qa-shots/rtl/wave10-event-*.png`, opened in bands. The previous run was at `a185ccb+`, before the three
spec fixes and before `results.tsx` moved, so a copy of the specs is not enough: **it needs a rebuild.**

Nothing else of mine is unfinished. Not started, and not mine to start: the build (lead-only).

## Two things for whoever picks this up

- ★ **The browser found what the RLS harness structurally cannot**, twice this wave. The window-overlap
  failure is the clearest case: my RLS file writes `'empty'::tstzrange` for a check-in's window, which no
  constraint can object to, so the suite would never have found that one member cannot hold two overlapping
  check-ins. Keep both harnesses; they are not redundant.
- ★ **`tests/e2e/wave10-demo-survey.spec.ts:63` fails `tsc`** — `test.skip()` has no overload taking a
  function plus `testInfo`. It is the lead's file, untouched by me, and it will fail the typecheck gate on the
  final commits.

---

# The captures' three findings, and the ruling that closed the fourth

Everything below came from opening the captures — not one of the four was visible to `tsc`, to the RLS
suite, to a component test or to a passing e2e. That is the argument for the capture step, made four times
in one afternoon.

| # | What the capture showed | Fixed at |
|---|---|---|
| 1 | SCR-064's bars passed the label and the count through `aria` only: five unlabelled grey lines, and a choice question's options nowhere on the page. `ui/progress` is a bare bar **by design** — its consumers put their own words beside it | `03ecec2` |
| 2 | «أزل الاستبانة» was offered on a survey with responses, which the database refuses. A control that leads to a refusal is not a control | `03ecec2` |
| 3 | SCR-065's question cards lost ~120 px of 325 to a side column of ▲▼ and 🗑, truncating the option inputs («مناس»). The lead landed `controls="inline"` (`c9efd7b`) and the card's header takes them, where `09` SCR-065 always put them | `4634ae5` |

## ★ The ruling on the fourth: NO `detachable` boolean (the lead, on `DEC-163`'s reasoning)

I proposed adding «≥ 1 response exists» to `survey_results()`'s envelope so the **withheld** state could hide
the detach control too. **Refused, and the reason is one I had not followed far enough:** the withhold hides
the count *precisely so that «has anyone answered» is not knowable*, and **at `n = 1` that boolean IS the
register's one row** — read against an attendance list the same staff member can open. «Someone answered»
plus «twelve attended» is not a name; «someone answered» plus «one person attended» is. My reading that the
boolean was safe was a reading of the common case, which is exactly the wrong case to read.

**So the rule, and it is what is built:** `status === "ok"` → the sentence, because a released result has at
least `min` responses by definition. `withheld` → the control is offered; the database refuses if anyone has
answered, and the refusal says «لا يمكن إزالة استبانة أجاب عنها أحد». «Attached the wrong template and
removed it at once» keeps working, which is the case that matters, and the one press a staff member can
waste costs them a sentence rather than costing a member their anonymity.

---

# Wave 19 — plan (SCR-015 and `ui/star-input`, `DEC-213`, `REQ-UIX-066`, `REQ-UIX-064`)

*Planning only. Nothing is deleted before the lead posts «the plans are approved» and «the frame is in».* Read
for this plan: STATUS's wave-19 block, `DEC-213` in full, `DEC-199` §2, `DEC-208`, `M10b.md` §2 and §7, `M10a.md` §0
and §10, `Rate.dc.html` beside its PNG at 390, `01` (`REQ-RAT-001` … `007`, `REQ-SUR-001` … `009`, `REQ-UIX-064`,
`066`), `09` `SCR-015`, `STORY-UIX-052`/`054`, and — re-derived for the table below — the five files under
`rate/`, `lib/dal/ratings.ts`, `lib/dal/surveys.ts` (the member's half), `components/event/{star-rating,ratings}.tsx`,
`components/survey/question-field.tsx`, `ui/action-bar.tsx`, `ui/submit-button.tsx`, and every suite that opens
`/rate` (listed in §5).

## 1 · The regions, in the artboard's order, and what each is built from

| # | Region (`Rate.dc.html`) | Built from | Data |
|---|---|---|---|
| 1 | **Top row**: the back control (40 px round, chevron pointing back) and `h1` «قيّم الجلسة» in the display face | `ui/link` with an `ArrowIcon direction="back"` and an `aria-label` — the shape `event-top-row.tsx` uses, not a copy of it; the `h1` is the page's own. Drawn at every width (one `h1`); below `lg` the shell's bar gives way (frame addition 2), from `lg` the shell's bar stands above it | `getSessionHeading()` (id for the href) |
| 2 | **The session's mini-row**: the poster at 44 × 56, the title, «presenter، company · date · حضرت» | `ui/card` (`density` compact, no `href`) holding `ui/poster` (the rendered master, else its placeholder in the presenter's company colour as `--team`) and two lines. «حضرت» only when the viewer holds an active check-in (`eligibility.checkInId`) | title from `getSessionHeading()`; poster from `getSessionPoster()` (`posters.ts`, read only); ★ presenter + company + team colour — **not carried by any read the page makes today** (see §7.3 and «needs») |
| 3 | **`star-input` — تقييم الجلسة**, 48 px stars, the count read back under the row | `ui/star-input` (new, §3), `size="lg"`, `name="sessionStars"` | `existing.sessionStars` or what the round trip handed back |
| 4 | **`star-input` — تقييم المُقدِّم** | `ui/star-input`, `name="presenterStars"` | as above |
| 5 | **The comment**: label «ملاحظات» with a muted «(اختياري)», the placeholder, «N من 2000» under it | `ui/field` + `ui/textarea` (`maxLength` read from one constant, §4); the counter is the field's `hint`, updated on input | `existing.comment` / the round trip |
| 6 | **The anonymity panel**: the shield glyph, `ratings.form.anonymityNotice` with `min` | `ui/panel` (`tone="info"`), the glyph from `ui/icons` if the set has one, else none — no new glyph is drawn by me (a request to the lead if wanted) | `minAggregate` from `org_settings.rating_min_aggregate` via `getRatePageData()` |
| 6a | ★★ **The survey** — not drawn; kept (`DEC-213` §5.90). See §6 | `<section aria-labelledby>` + `h2` + `components/survey/question-field.tsx` as it is | `getSurveyForMember()` |
| 7 | **The bottom bar**: the submit, then the window line «يُغلق باب التقييم في … · يمكنك تعديله حتى ذلك الحين» | `ui/action-bar` used as it is (`sessions'`): `primary` = `ui/submit-button`, `note` = the window line. Rendered **inside the `<form>`** so `useFormStatus` sees it (§6) | `eligibility.windowClosesAt` in the org's zone |

Above region 3, inside the form and only when there is one: the error summary (`ui/form-summary`) or the refused
write's alert. Above the form, only on `?rated=1`: the receipt (§4). Neither is drawn.

## 2 · ★★ The kept-behaviour table (`DEC-208`)

Re-derived from the requirements and the DAL listed above, not from memory. «Lives in» names the file **after** the
rebuild. `actions.ts` and `state.ts` are the screen's behaviour, not its markup: **they are not deleted** — the delete
commit removes `page.tsx`, `rate-form.tsx`, `loading.tsx` and `components/event/star-rating.tsx` (§5). Both survive
untouched except for one add-only constant in `state.ts` (row 14).

| # | Behaviour | Lives in, after | Kept by |
|---|---|---|---|
| 1 | Every read goes through the DAL, which calls `sessionClient()`/`requireSession()` at the data — never in a layout | `page.tsx` → `getSessionHeading`, `getRatePageData`, `getSurveyForMember`, `getSessionPoster` (+ the presenter line, §7.3) | `REQ-NFR-001`, CLAUDE.md «Data access» |
| 2 | An id the viewer cannot see → `notFound()` (from `getSessionHeading()` returning `null` under `sessions_read`), never a rule about a session not there for them | `page.tsx` | `REQ-RAT-001`; `03` `sessions_read` |
| 3 | Session not `completed` → the explanation `ratings.states.notCompleted` and «العودة إلى الجلسة», no form, no bar — **not a 404** | `page.tsx`, `ui/empty-state` with its `action` | `REQ-RAT-003` (opens at completion), `DEC-213` §2.2 |
| 4 | Not checked in → `ratings.states.notCheckedIn` and the way back, no form, no bar, no «حضرت» | `page.tsx` | `REQ-RAT-001` |
| 5 | A presenter is refused **through the check-in requirement**: they cannot check in to their own session, so they land on row 4 | unchanged: `getRatingEligibility()` + `ratings_write_self` | `REQ-RAT-001`, `REQ-CHK-011` |
| 6 | A removed check-in grants nothing (`removed_at is null` in the DAL's read and in the policy) | `lib/dal/ratings.ts` (untouched) | `REQ-CHK-017`, `0087` |
| 7 | The window: `completed_at + org_settings.rating_window_days`, computed in the DAL for the explanation and the date; enforced by `rating_window_open()` inside `ratings_write_self`, `ratings_update_self` and `submit_survey_response()` (`0131`, `0137`) — one definition in SQL | `lib/dal/ratings.ts`, SQL (untouched) | `REQ-RAT-003`, `REQ-SUR-003` |
| 8 | **The window is stated** on the open screen — the date in the org's zone | the bar's `note` | `REQ-RAT-003` («The window is stated in the rating prompt») |
| 9 | Window closed → «أُغلق باب التقييم لهذه الجلسة», the saved stars **read-only**, the comment in `<bdi>`, «العودة إلى الجلسة»; **no form, no radiogroup, no bar** | `page.tsx`, `ui/panel` + `star-input` read-only face | `REQ-RAT-003` («the form is unavailable and existing ratings are immutable») |
| 10 | The anonymity notice: the threshold **read** from `rating_min_aggregate`, six ICU forms, a Western digit, **and** «يمكن لمشرفي المؤسسة الاطلاع على التقييمات الفردية» (every form of the key carries it — `DEC-213` §2.5) | region 6 | `REQ-RAT-004`, `REQ-RAT-005`, `REQ-RAT-006`, D36, OQ-009 |
| 11 | A first rating: `submitRatingAction` bound with the locale, the session id, the active **check-in id** and the survey's shape | `rate-form.tsx` → `actions.ts` (untouched) | `REQ-RAT-001` (the check-in grants it), `REQ-RAT-002` |
| 12 | An edit: `updateRatingAction` bound with `existing.id`; the form pre-filled from the saved rating; the label «تحديث التقييم» | `rate-form.tsx` | `REQ-RAT-003` (editable within the window) |
| 13 | Validation: both rows 1 – 5 and required, comment ≤ 2000, **Zod before the DAL**; the database's `check` and `with check` are the authority | `actions.ts`, `lib/dal/ratings.ts` (untouched) | `REQ-RAT-002`, `REQ-NFR-002` |
| 14 | ★ The 2000 is **read** — one exported constant in `state.ts` used by the textarea's `maxLength`, the counter and `capture()`; the DAL's Zod and `0010:379`'s `check` stay as they are | `state.ts` (add-only), `rate-form.tsx` | contract 6, `REQ-RAT-002` |
| 15 | A refused WRITE (`already_rated`, `not_permitted`, `window_closed`, `generic`) is a focused `role="alert"` at the top of the form — never the summary | `rate-form.tsx` | `REQ-UIX-010`, `REQ-UIX-007` |
| 16 | A field error: the summary (`ui/form-summary`) linking to each field, the message adjacent at `#<name>-error`, the group's `id={name}` as the link's target, `aria-invalid` and `aria-describedby` on the group | `rate-form.tsx`, `ui/star-input` | `REQ-UIX-009`, `REQ-UIX-010` |
| 17 | **What was typed survives** a failed round trip — the stars, the comment, every survey answer — each control remounted by `key={…attempt}` and reading its default back from the returned state; `noValidate` on the form | `rate-form.tsx` | `REQ-UIX-011`, `DEC-149` §1 |
| 18 | Required rows are positively marked («مطلوب»), `aria-required` | `ui/star-input` (`requiredLabel` prop) | `REQ-UIX-011` |
| 19 | ★ **`?rated=1` is an in-page receipt**, `role="status"`, never a toast: «تم إرسال تقييمك» — or «تم إرسال تقييمك وإجاباتك» when the survey was answered — `submittedBody`, both ratings read-only, «العودة إلى الجلسة»; shown only when a rating exists; the form stays below it, editable | `page.tsx`, `ui/panel tone="success"` | `DEC-141` ruling 2, `DEC-213` §5.92, `REQ-SUR-001` |
| 20 | Success redirects to `rate?rated=1` with the locale | `actions.ts` (untouched) | `DEC-141` ruling 2 |
| 21 | No instant a rating was made is ever shown (`16` §9.2a); `submitted_at`/`edited_at` are day-coarsened in storage | not rendered anywhere on the screen | `REQ-SUR-004`, `REQ-SUR-009` |
| 22 | ★★ A session with **no survey shows nothing about one**: `getSurveyForMember()` returns `null`, no section, no heading, the bar keeps «إرسال التقييم» / «تحديث التقييم» | `page.tsx`, `rate-form.tsx` | `REQ-SUR-001` |
| 23 | ★★ **The survey section** after the anonymity panel and before the bar: `h2` «استبانة الجلسة», the intro, each question through `SurveyQuestionField`, answers kept across a round trip | `rate-form.tsx` (§6) | `REQ-SUR-004`, `REQ-SUR-002`, `DEC-213` §5.90 |
| 24 | An answered survey reads «شكرًا، أجبت عن هذه الاستبانة» and «لا يمكن تعديل الإجابات بعد إرسالها», with no questions — a member never sees their answers back | `rate-form.tsx` | `REQ-SUR-003`, `DEC-160` §3 |
| 25 | ★★ **Two decorrelated writes, one press**: the rating by the action; the answers by `submit_survey_response()`, which records the register and enqueues the answers with a jittered delay — no shared id, nothing about a queue on the screen, no answer in a log, error or redirect | `actions.ts` (untouched) | `REQ-SUR-004`, `REQ-SUR-009`, `DEC-160` §3 |
| 26 | The action receives only the survey's **shape** (ids, kinds, `required`) — bound by the form, re-derived in SQL | `rate-form.tsx` → `actions.ts` | `REQ-SUR-003` |
| 27 | ★★ A required question blocks **the survey, never the rating**; `RATING_SAVED` turns the summary's title into «لم نستطع إرسال إجاباتك» with «حُفظ تقييمك. أكمل الأسئلة المطلوبة لإرسال إجاباتك.» as its description — never the red alert | `rate-form.tsx`, `state.ts`, `actions.ts` | `REQ-SUR-002`, `DEC-164` |
| 28 | The second press after `RATING_SAVED`: `already_rated` is not a refusal when a survey is on the screen; a changed rating is updated (`ratingChanged()`), an unchanged one is not written; then the survey is sent | `actions.ts`, `state.ts` (untouched) | `DEC-164`; `tests/unit/ratings-second-press.test.ts` |
| 29 | ★★ **The bar's label follows the survey's state**: unanswered survey → «إرسال التقييم والإجابات» / «تحديث التقييم وإرسال الإجابات»; none or answered → «إرسال التقييم» / «تحديث التقييم» | the `primary` of `ui/action-bar`, in `rate-form.tsx` | `REQ-SUR-004`, `DEC-213` §5.90 |
| 30 | Pending: the submit shows «جارٍ الإرسال…» through `useFormStatus`, cannot be pressed twice; no nudge, no timer | `ui/submit-button` inside the form | `REQ-UIX-007`, `DEC-146` |
| 31 | ★ **Stars fill from the right**: star 1 first in DOM in a plain flex row, so the inline start — the right in Arabic; never `row-reverse` | `ui/star-input` | `REQ-UIX-064`, `09` `SCR-015` |
| 32 | **Five native radios** in one group: one tab stop, the browser's arrow keys (← increases in RTL), a real value in `FormData`, a form reset that restores the rendered default | `ui/star-input` | `REQ-UIX-064`, `DEC-213` §5.124 |
| 33 | The fill (and now the hover preview and the read-back) is **CSS `:has()`**, right before hydration and right after React resets the form | `ui/star-input` | `REQ-UIX-064`, `DEC-141` |
| 34 | Each radio is named by the **plural count** («نجمة واحدة», «نجمتان», «5 نجوم»), six ICU forms, Western digits; the group by its legend | strings: `ratings.form.starCount` passed as `starLabels`; markup: `ui/star-input` | `REQ-UIX-064`, `DEC-124`, `10` |
| 35 | A pointer chooses by pressing the visible star — **the radio's parent is the clickable label** (`radio.locator("xpath=..")` in five specs) | `ui/star-input` | the specs' pointer path (§5) |
| 36 | `<bdi>` on every interpolated title, name and comment: the session title (mini-row), presenter name and company (mini-row), the comment in the closed state | `page.tsx` | CLAUDE.md i18n rule, `10` |
| 37 | Dates in the org's zone (`timeZone` from `org_settings`), Western digits, through `components/sessions/numerals.ts` | `page.tsx` | OQ-018, `DEC-124` |
| 38 | The skeleton: its own, `aria-hidden`, no text, no `getTranslations` — now the new shape (top row, mini-row, two star rows, the field, the panel) | `loading.tsx` (re-written) | `REQ-UIX-005` |
| 39 | The no-JS path: the native form posts to the bound Server Action, the radios carry their values, the fill is CSS; the counter shows the server-rendered count and simply does not tick | `rate-form.tsx`, `ui/star-input` | `REQ-UIX-064`; progressive enhancement as today |
| 40 | `?next=` — **none existed on this route**; the sign-in redirect is `proxy.ts`'s, untouched | — | not applicable, recorded so the row is not mistaken for a drop |
| 41 | The accessible names the suites pin — all kept: `h1` «قيّم الجلسة»; radiogroups named /تقييم الجلسة/, /تقييم المُقدِّم/ and exactly **two** of them; radios «نجمة واحدة» … «5 نجوم»; the label «ملاحظات (اختياري)»; buttons «إرسال التقييم» (exact), «تحديث التقييم», /إرسال التقييم والإجابات/; `status` with «تم إرسال تقييمك»; `img` «تقييم الجلسة: 5 نجوم» / «تقييم المُقدِّم: 5 نجوم»; link «العودة إلى الجلسة» (exactly one per state — so the top row's back control is named «رجوع», not that); `#presenterStars-error`; `form[novalidate] [role=alert]`; the heading «استبانة الجلسة» | the files above | the specs in §5 |
| 42 | **Dropped, deliberately:** the breadcrumb «الجلسات › title» and the session's date as the header's description. The artboard replaces both with the back control and the mini-row, which names the session (in `<bdi>`) and its date. At `lg` there is no artboard; I build the same top row — **flagged** for the lead (§7.4) | — | `DEC-199` §2, `DEC-213` §3.2 |

**42 rows.** Read against the new files after the create commit, one tick per row, in this note.

## 3 · `StarInputProps` — the type for `ui/index.ts` (contract 2)

The primitive is **server-safe** — no `"use client"`, no hook, no message catalogue, no DAL: markup and CSS. So the
page (server) can draw its read-only face and the form (client) its input, from one file.

```ts
/** The five names of a star row, star 1 first — «نجمة واحدة» … «5 نجوم». The caller formats them (six ICU forms). */
export type StarLabels = readonly [string, string, string, string, string];

interface StarInputShared extends Styleable {
  /** The visible name of the row — «تقييم الجلسة». */
  legend: string;
  /** Each star's accessible name, and the line read back under the row. */
  starLabels: StarLabels;
  /** `lg` is the rate screen's 48 px star; `md` (default) a receipt's row. */
  size?: "md" | "lg";
}

/** The input: a radio group of five native radios. Star 1 is first in DOM, so it is the inline start — the right in RTL. */
export interface StarInputEditableProps extends StarInputShared {
  readOnly?: false;
  /** The field's name, and the group's `id` — the error summary's link target. */
  name: string;
  /** A saved rating, or what a failed round trip handed back. Uncontrolled: the radio is `defaultChecked`. */
  defaultValue?: 1 | 2 | 3 | 4 | 5;
  required?: boolean;
  /** «مطلوب», drawn beside the legend when `required`. */
  requiredLabel?: string;
  /** Adjacent, icon-marked, at `#<name>-error`, tied to the group by `aria-describedby`. */
  error?: ReactNode;
  disabled?: boolean;
}

/** The read-only face — the closed window and the receipt. One `role="img"`; no radio, no radiogroup. */
export interface StarInputReadOnlyProps extends StarInputShared {
  readOnly: true;
  value: 1 | 2 | 3 | 4 | 5;
  /** The image's whole accessible name — «تقييم الجلسة: 5 نجوم». The caller composes it; the primitive joins no words. */
  label: string;
}

export type StarInputProps = StarInputEditableProps | StarInputReadOnlyProps;
```

Behaviour the type cannot say, held by the tests:
- **Fill, hover and read-back from the right, by CSS.** A star is filled when its radio or a *later* sibling's is
  checked; while the row is hovered, a star is filled when it or a later sibling is hovered and the stars after the
  hovered one are not. The read-back is five `aria-hidden` lines, one shown per checked value — the checked radio
  already speaks its count, so the line is for the eye and is never read twice. Nothing scales on hover; no keyframe.
- **← increases, → decreases** in RTL because the radios are native and in ascending DOM order — not by a key
  handler. A key handler would be a second keyboard model to keep in step.
- No `row-reverse` anywhere; the group is a `fieldset role="radiogroup"` named by its `legend` (one group per row, so
  `getByRole("radiogroup")` still counts **two** on the screen).
- The empty row submits nothing — «no opinion» is not zero (`REQ-RAT-002`).
- The colour of a filled star is a semantic token — see §7.1; the outline is `edge-strong`.

Files: `src/components/ui/star-input.tsx`, `tests/components/ui/star-input.test.tsx` (the RTL check, the six cases
carried from `star-rating.test.tsx`, the read-only face, the read-back lines, the hover classes present),
`tests/components/ui/star-input-scope.test.tsx` (inside `PlayScope`), `src/app/[locale]/(dev)/ui/demos/star-input.tsx`
(empty, chosen at 4, required with an error, disabled, read-only at 3 and 5, `md` and `lg`, all in Arabic from fixture
strings). The registry entry and the gallery wiring are the lead's.

## 4 · Every state `M10b.md` §2 names (or the tree has) and how it is built

| State | Drawn? | Built as |
|---|---|---|
| Open, empty | yes | §1, regions 1 – 7; no star checked; counter «0 من 2000» |
| Open, editing within the window | no | the same screen pre-filled from `existing`; the bar reads «تحديث التقييم» (or the survey's update label) |
| Submitted — `?rated=1` | no | ★ the **in-page receipt** (`DEC-213` §5.92 — **not** the toast `M10b.md` draws): between the mini-row and the form, `role="status"` around `ui/panel tone="success"`, the survey-aware title, `submittedBody`, both rows as `star-input readOnly`, «العودة إلى الجلسة» as `ButtonLink`. The form follows, editable |
| Closed | no | mini-row with «حضرت»; `ui/panel tone="ended"` «أُغلق باب التقييم لهذه الجلسة»; when a rating exists, both rows read-only and the comment in `<bdi>`; «العودة إلى الجلسة». **No form, no radiogroup, no bar** |
| Not completed · not checked in (incl. a presenter) | no | top row, mini-row **without** «حضرت», `ui/empty-state` with the reason as its title and «العودة إلى الجلسة» as its action. No form, no bar. Never a 404 (`DEC-213` §2.2) |
| Not visible to the viewer | — | `notFound()` → the event segment's `not-found.tsx` |
| Error summary (a missing row, a long comment) | no | `ui/form-summary` at the top of the form, links to `#sessionStars` / `#presenterStars` / `#comment`, field messages adjacent; everything typed kept |
| A refused write | no | the focused `role="alert"` at the top of the form; everything typed kept |
| Rating saved, survey refused (`RATING_SAVED`) | no | the summary with the survey's title and description (row 27) |
| Survey present, unanswered / answered | no | §6 |
| Pending | no | `SubmitButton`'s pending label |
| Loading | no | `loading.tsx`, the new shape |

## 5 · Files, and every existing assertion that moves

**Created** (after P0 lands the type): `src/components/ui/star-input.tsx` · `tests/components/ui/star-input.test.tsx` ·
`tests/components/ui/star-input-scope.test.tsx` · `src/app/[locale]/(dev)/ui/demos/star-input.tsx` ·
`tests/e2e/wave19-event-rate.spec.ts` (the receipt, closed, not eligible, the counter, the read-back after a press,
hover-free fill order, the bar's label with and without a survey, captures at
`.qa-shots/rtl/wave19-event-rate-<state>-390.png` honouring `E2E_SHOTS_DIR`).

**Commit A — the delete** (`DEC-208`): `rm` `src/app/[locale]/app/sessions/[id]/rate/{page,rate-form,loading}.tsx` and
`src/components/event/star-rating.tsx`, with `tests/components/event/star-rating.test.tsx` (its cases move to the
primitive's test in commit B — one ledger line each, six lines, **selector moved, expectation unchanged**). ★ Between
A and B `tests/components/survey/rate-form.test.tsx` cannot import its subject; A and B land back to back and the
hook is judged on B. If the lead wants every commit green, A also removes that test file and B restores it
byte-identical — the lead's call.

**Commit B — the create**: the three files written from the artboard; `rate/state.ts` gains `RATING_COMMENT_MAX`
(add-only); `src/messages/ar/ratings.json` then `en/` gain ★ `form.back` «رجوع», ★ `form.attended` «حضرت», ★
`form.commentOptional` «(اختياري)» with `form.commentName` «ملاحظات» (the label is the two in one `<label>`, so its
name stays «ملاحظات (اختياري)»; `form.commentLabel` stays for the summary's line), ★ `form.commentPlaceholder` «ما
الذي نفعك، وما الذي كنت تودّ أن يكون مختلفًا؟», ★ `form.commentCount` «{count} من {max}», ★ `form.windowEditable`
«يمكنك تعديله حتى ذلك الحين», ★ `form.actionsLabel` «إرسال التقييم» (the bar's group name), ★ `form.presenterLine`
«{name}، {company}». `form.commentHint` is no longer rendered and stays in the file (keys are stable). No `survey.json`
key changes.

**Not touched:** `rate/actions.ts`, `lib/dal/{ratings,surveys}.ts` (unless the lead rules the presenter line into
`ratings.ts`, §7.3), `components/event/ratings.tsx`, `components/survey/**`.

**`ratings.tsx` (the event-page slot) does not move to `star-input`, and nothing of it goes**: it draws no star at all
— the prompt and edit links for a rater, the two averages as **numbers** and the comments for a presenter or staff.
There is nothing to replace. **`star-rating.tsx` goes** in commit A: its only importers are `rate/page.tsx`
(`StarDisplay`) and `rate/rate-form.tsx` (`StarRating`). Two comments still name it — `question-field.tsx:14`, `:115`
(mine, fixes only: I correct both to `star-input` in commit B), `tests/components/survey/question-field.test.tsx:47`
(not in my list — left, told to the lead) and `ui/index.ts:275` (the lead's).

**Existing assertions, suite by suite** — every one read; **I expect no expectation to move, and no selector either**
except the six in `star-rating.test.tsx`:

| Suite | Owner | Expected |
|---|---|---|
| `tests/components/event/star-rating.test.tsx` (6 cases) | mine | **moved** to `star-input.test.tsx`: the import and the «مطلوب» now passed as a prop (selector); every expectation identical — including the read-only face's `fill` attributes `currentColor ×3, none ×2` |
| `tests/components/survey/rate-form.test.tsx` (5 cases) | mine | unchanged — `RateForm` keeps its path and its five props; the new ones (`notice`, `windowNote`) are optional |
| `tests/components/event/ratings.test.tsx` | mine | unchanged — the slot is not touched |
| `tests/unit/ratings-second-press.test.ts` | mine | unchanged — `state.ts` keeps `ratingChanged()` |
| `tests/e2e/wave7-sessions-rate.spec.ts` (6 tests) | mine | unchanged. Note: `filled()` reads the computed `fill` of every `path` in the group, so the read-back lines carry **no** SVG (the error's icon renders only on an error, and `filled()` is never called then); a filled star of any colour is still `!== "none"` |
| `tests/e2e/event-rate.spec.ts` (4 tests) | mine | unchanged |
| `tests/e2e/wave10-event-rate-survey.spec.ts` (3 tests) | mine | unchanged — locators are from `#main`, and the bar is rendered inside the form inside `#main` |
| `tests/e2e/sessions-screens.spec.ts` §SCR-015 | not mine | unchanged expected (radiogroup ×2, label click, «ملاحظات (اختياري)», «إرسال التقييم», the status) |
| `tests/e2e/wave10-demo-survey.spec.ts`, `wave11-lead-a11y-sweep.spec.ts` | lead | unchanged expected; the sweep re-runs on the new screen |

If a run proves me wrong, each moved assertion is a ledger line in `STATUS.md` in the same commit, through the lead.

## 6 · Where the survey sits, and how the bar carries the submit

**Order inside the one `<form noValidate>`**: the summary or the alert → `star-input` ×2 → the comment → the
anonymity panel → ★★ **the survey section** (`aria-labelledby`, `h2` «استبانة الجلسة», the intro, the questions, or
«أجبت» and its note) → `ui/action-bar`. So the survey is after the panel and before the bar, as `DEC-213` §5.90 rules,
and reading order is the visual order.

**The bar**: `ui/action-bar` is used as it is — no prop added. It is rendered **inside the form** because
`SubmitButton` reads `useFormStatus()` of its enclosing form, and a `form=` attribute would leave the pending state
dark. `label` = `ratings.form.actionsLabel`; `primary` = `<SubmitButton pendingLabel=…>` whose label is row 29's four-way
choice, `size="lg" className="w-full"`, as `action-card`'s primary is; `note` = «يُغلق باب التقييم في {date} · يمكنك تعديله حتى ذلك
الحين». `position="fixed"`, so the shell's `data-action-bar` contract pads `<main>` and the scroll clears it. **No bar**
in the closed, not-completed and not-checked-in states, which have nothing to submit. The receipt keeps the bar,
because the form below it is still live.

`RateForm` gains two optional props for this, so its five existing cases stand: `notice?: ReactNode` (the panel, drawn
between the comment and the survey) and `windowNote?: ReactNode` (the bar's note). The page composes both on the server.

## 7 · Disagreements `DEC-213` §5 does not list — not picked

1. ★ **The filled star is a company's colour.** `Rate.dc.html` fills stars `#FFD23F`, which `docs/design/01-tokens.md:60`
   names `--color-team-gold` — «دبابيس», a company — and `globals.css:237` carries as `--color-team-gold` (with an
   identical `--color-sticker-gold` at `:271`). The plan's rule: a company's colour reaches the DOM only as `--team`
   from data, and is never an accent (`DEC-183` contract 3, `DEC-206` §4.62's reasoning). There is **no semantic star
   token**; the tree fills with `fg-heading` (bone). The options I can see: a semantic token for a filled star in
   `globals.css` (the lead's), the sticker gold, or bone as today. **The lead's ruling.**
2. **The mini-row's date is relative** («أمس»); the tree prints the absolute date (`formatDate`) and no relative
   formatter exists in `numerals.ts`. A relative word on a screen open for 14 days also changes under the reader.
   Not ruled by me.
3. **The mini-row's presenter and company are read by nothing the page calls.** `getSessionHeading()` carries id, title,
   state, start and zone. Not a design disagreement — a data gap like `DEC-213` §5.86 for the viewer. The poster is
   `getSessionPoster()` (read only); the presenter line needs one of: (a) an add-only field on `getSessionHeading()` —
   `presenters: { displayName, companyName, teamColor }[]` — written by `sessions` (its file), which **`content` could
   share for §5.86**; (b) an add-only read in my `ratings.ts`; (c) `getSessionForEvent()`, which reads far more than
   this row needs. I would ask for (a); **the lead decides**.
4. **`lg` has no artboard.** The phone's own top row is drawn at every width (one `h1`), and `ui/action-bar` fixed at
   `inset-x-0` spans under the nav rail at desktop width. The other choice — a static row from `lg` — needs either a
   responsive `position` on `sessions'` primitive or two submit buttons in the DOM (which breaks the exact-name
   locators and the component test). **I build one fixed bar unless the lead rules otherwise**; flagged, not picked.
5. **`09-sitemap-screens.md:321` and `:327`** still write the stars' range and the threshold in Eastern Arabic digits
   (in «Fields» and in the anonymity «Note»). `DEC-213` §2.4 corrected `09`'s numerals for `SCR-013` and `SCR-027`
   only. A citation, `DEC-124` wins; for the lead's pen.
6. *(Noted, not a disagreement.)* The artboard's anonymity copy («…؛ تظهر له النتائج…») differs in two words from
   `ratings.form.anonymityNotice`; `M10b.md`'s own rule is copy from `messages/ar/` where a string exists, so the key
   is rendered as it is.

## Needs from the lead

- **P0**: `StarInputProps` (§3) in `ui/index.ts`, the registry entry, the gallery wiring.
- **Ruling on §7.1** (the star's colour) — and the token, if it is a new one, in `globals.css`.
- **Ruling on §7.3** (who writes the presenter line) — and, if (a), the request carried to `sessions`.
- **Rulings on §7.2 and §7.4.** And whether commit A may leave `rate-form.test.tsx` red until B (§5).
- The frame's addition 2 for `/app/sessions/[id]/rate` before I build.

---

## Wave 19 — build log

★ **Sync 1 approved the plan (`DEC-214` §3).** Rulings: a filled star is `--signal`; the mini-row's date is absolute;
the presenter line is contract 8 (`getSessionHeading().presenters`, every presenter joined); from `lg` the bar is in
flow at the end of the form; commit A may leave `rate-form.test.tsx` red only if B is pushed with it.

### R2 — `ui/star-input` · the registry request (the lead's file)

```ts
"star-input.tsx": tokens("star-input", ["text-signal", "text-edge-strong", "text-fg-muted", "text-error"], "star-input-scope.test.tsx"),
```

and `./demos/star-input` (`StarInputDemo`) wired into the gallery. Files: `src/components/ui/star-input.tsx`,
`tests/components/ui/star-input.test.tsx` (14 cases — seven carried from `star-rating.test.tsx`, ledger lines
with commit A), `tests/components/ui/star-input-scope.test.tsx` (4), `src/app/[locale]/(dev)/ui/demos/star-input.tsx`.
Server-safe: no hook, no `"use client"`. `ui-playground.test.ts` is red for this one file until the entry lands.

### R1 — SCR-015, deleted then written

- **`ef0c7b48`** `ui/star-input` · **`3e5b53e5`** the delete (page, form, skeleton, `star-rating.tsx` and its test) ·
  **`84ee6e7a`** the create. ★ A and the create are pushed together (`DEC-214` §3); `rate-form.test.tsx` is red only
  between them.
- **Ledger lines for `STATUS.md`** (the lead's pen): `tests/components/event/star-rating.test.tsx`, all seven cases
  (five `StarRating`, one `StarDisplay`, one required/error) → `tests/components/ui/star-input.test.tsx`'s first
  block — **selector moved** (the import, and «مطلوب» passed as `requiredLabel`), **expectation unchanged**; in
  `3e5b53e5`/`ef0c7b48`. `tests/components/survey/question-field.test.tsx:47` — a comment only, no assertion
  (`84ee6e7a`). No other suite changed.
- `tests/e2e/wave19-event-rate.spec.ts`: eight tests — empty, chosen (read-back, hover from the right on a pointer
  project, the counter), error, submitted, ★ the survey's place and the bar's label, closed, not eligible, and the
  bar in flow at 1280. Captures `wave19-event-rate-{empty,chosen,error,submitted,survey,closed,not-eligible}-390.png`
  and `-open-1280.png`. **The lead runs it** on a production build.

**The kept-behaviour table, read against the new files** (`rate/page.tsx`, `rate/rate-form.tsx`, `rate/loading.tsx`,
`ui/star-input.tsx`; `actions.ts` and `state.ts` kept):

| Rows | Read |
|---|---|
| 1, 2 | ✓ every read through the DAL; `notFound()` on a `null` heading |
| 3 – 6 | ✓ the two reasons as `EmptyState` with «العودة إلى الجلسة», no form, no bar; the gate is still `getRatingEligibility()` and the policy |
| 7, 8 | ✓ the DAL and SQL untouched; the window date in the bar's note, in the org's zone |
| 9 | ✓ closed: the panel, both rows as `star-input` read-only (`role="img"`), the comment in `<bdi>`, the way back; no radiogroup, no bar |
| 10 | ✓ `anonymityNotice` with `min` read from `getRatePageData()`, between the comment and the survey |
| 11 – 13, 20, 25, 26, 28 | ✓ `actions.ts` unchanged but for the constant; the two bound actions as before |
| 14 | ✓ `RATING_COMMENT_MAX` in `state.ts`: `maxLength`, the counter, `capture()` |
| 15 – 18 | ✓ the focused alert, the summary, `#<name>-error`, `id={name}`, `key={…attempt}`, `noValidate`, «مطلوب» |
| 19 | ✓ `?rated=1` → `role="status"` panel, survey-aware title, read-only rows, the way back; the form below it |
| 21 | ✓ no instant shown |
| 22 – 24, 27, 29 | ✓ the survey section after the panel and before the bar; «أجبت»; `RATING_SAVED`; the four-way label |
| 30 | ✓ `SubmitButton` inside the form, inside the bar |
| 31 – 35 | ✓ in `ui/star-input` and its test |
| 36 | ✓ `<bdi>` on the title, each presenter's name and company, the comment |
| 37 | ✓ `formatDate` in the session's zone (heading) and the org's (window) |
| 38 | ✓ the skeleton in the new shape, `aria-hidden`, no text |
| 39 | ✓ native form and radios, CSS fill; the counter keeps the server's count without JS |
| 40 | ✓ n/a |
| 41 | ✓ every pinned name kept; the top row's back control is «رجوع», so «العودة إلى الجلسة» stays one link |
| 42 | ✓ dropped as planned |

**Found while building — told to the lead, not ruled by me:**
- The mini-row's thumbnail is `CardMedia` at 44 px: the rendered poster when one exists, otherwise its one-glyph
  placeholder. The artboard writes the whole title at 9 px inside the tile; at that width a 150-character title can
  only be clipped (`10` forbids it), and the title is printed beside the tile anyway.
- The panel's shield glyph is not drawn: `ui/icons` has no shield, and a glyph is the lead's file.

---

## Wave 22 — the plan (sync 1)

`SCR-064` (the hub's الاستبانة tab) and `SCR-065` (survey templates), PR C (`wave-22c/moderation-and-the-survey`),
`REQ-UIX-105`, `REQ-UIX-106`, `STORY-UIX-095`, `096`. Measured at `a6c0345a`. Planning only: nothing below is built,
and nothing is deleted before «the plans are approved» and C's worktree exists.

### 0 · The job, one line per screen (`DEC-231` §0)

- **`064`** — an admin or a moderator opens a completed session's الاستبانة tab and **reads what the room thought in
  one screen**: how many answered of how many could, the rating's two averages, the stars, every question's result,
  the written answers — each withheld below its own minimum and saying so — and the admin takes the CSV from the
  header in one press, which leaves an `export.created` row.
- **`065`** — staff see **every template with its size and its use** in one table, select one and read its questions
  beside it without opening anything, and reach «قالب جديد», «عدّل» and «احذف» in one move; **each of the three writes
  its audit row** (`survey_template.created` · `changed` · `deleted`).

### 1 · `064` — the regions, in the artboard's order

The hub draws the breadcrumb, the `h1`, the status badge, the strip and **the tab's primary** (contract 4, `DEC-228`).
**This page renders nothing of it.** Its first heading is an `h2`.

| # | Region (artboard) | Built from | Source of the figure |
|---|---|---|---|
| — | «CSV» in the header, beside the status | a plain `<a download>` with `buttonClass("secondary","md")` — **never** `ButtonLink` (prefetch would take an audited bulk read on hover, `REQ-ADM-017`) | ★ a new `SurveyHeaderAction` (`src/components/survey/survey-header-action.tsx`, mine) under the hub's `tabActions.survey` key — returns the link for an admin when a survey exists, `null` otherwise, **never throws**. ★ **The one line in `[id]/layout.tsx` is `sessions'` file: a request to the lead as custodian** |
| 1 | four `ui/stat`s in a row — أجاب · الجلسة · المُقدِّم · نسبة الرد | `Stat` ×4 (`value`, `label`) | **أجاب** = `survey_results().response_count / eligible_count` (**the survey's**, `REQ-SUR-008`) · **الجلسة**, **المُقدِّم** = `session_rating_aggregates.session_avg / presenter_avg` (**the rating's**) · **نسبة الرد** = the survey's count over eligible, rounded, Western digits. Withheld → «—» in the value, never `0` |
| 2 | «تقييم الجلسة» — a bar per star count, 5 → 1 | `Panel` + five rows of label · `Progress` · count (the label and the count visible text, as `results.tsx` learned) | ★ **see §1.1** — no reader exists today |
| 3 | the free-text answers, with «N إجابات» and the anonymity line | `Panel` per question, `<ul>` of `<bdi>` answers, the line as `text-caption` | the survey's `texts` per `free_text` question; ★ **and every other question type the survey holds** — scale and choice bars, each withheld on its own (`REQ-SUR-006`) — the artboard draws one text question, the survey may hold four types |
| 4 | (not drawn) attach / detach | the existing attach form (`Field` + `Select` + `SubmitButton`, a bound server action) and `DetachControl` unchanged | `survey_attach()` / `survey_detach()` |

#### 1.1 · Which figures are the rating's, and how the page reads them — measured

- **`session_rating_aggregates`** (`0010`, re-cut `0130`) is readable by **staff — admin AND moderator — and the
  session's presenter**, and returns **no row below `org_settings.rating_min_aggregate`**. Columns: `rating_count`,
  `session_avg`, `presenter_avg`, `comments` (unattributed). **It has no star distribution.** `getPresenterAggregate()`
  (`ratings.ts:165`) reads it; the event page's slot already does this for staff today, and **it writes no audit row,
  because it is not a per-rater read**.
- **`ratings.read_admin`** is written by `list_session_ratings_admin()` (`0017`) — **per-rater** rows, **admin only**
  (`assert_fresh_admin()`), one audit row per call (`REQ-RAT-005`, `DEC-044`).
- ★ **So the two averages come from the view, unaudited, for both staff roles, withheld below the rating's own minimum
  — and `064` writes no `ratings.read_admin` row.** `STATUS.md`'s audit table (`:67`) lists «an admin's ratings read
  → `ratings.read_admin`» against `064`; under this plan there is no such read on the page, and I say so rather than
  add one.
- ★ **The star bars need a reader that does not exist.** Three ways, the lead's ruling (Q1):
  - **(a)** a new `session_rating_distribution(p_session uuid) returns jsonb`, `security definer`, **staff only**
    (the survey's own `assert_survey_staff()`), **refusing the session's presenter** as `survey_results()` does, and
    **`null` below `rating_min_aggregate`** — counts per star of `session_stars`, no member, no audit (an aggregate,
    the view's class). Written in `supabase/proposed/event/`, proved by `applyProposed()` in a new
    `tests/rls/survey-rating-distribution.test.ts`, promoted by the lead (a function — so a migration this wave did not
    expect).
  - **(b)** build the bars from `list_session_ratings_admin()`: per-rater rows read to draw an aggregate, **an audit
    row on every page view**, and **a moderator sees no bars** (`REQ-ADM-020`). I would not.
  - **(c)** the artboard's bars are a **survey scale question's** distribution — which `survey_results()` already
    returns and `results.tsx` already draws. No new SQL. See D1: in the artboard's own model the default template
    *contains* «تقييم الجلسة» as a 1–5 question, so this reading is what the drawing means; in ours the rating is not
    a survey question.

#### 1.2 · The withhold — every type, screen and CSV alike (`DEC-160` §3, `REQ-SUR-006`, `REQ-SUR-007`)

Unchanged and not re-implemented: **`survey_results()` is the only exit**, and both the screen and
`getSurveyExportRows()` call it, so the two cannot drift. Below `survey_min_responses` (floor 3, `DEC-161`): **status
`withheld`, no count, no mean, no distribution, no text** — the screen says withheld and why (`REQ-SUR-006`'s
acceptance), أجاب and نسبة الرد show «—», the CSV is one row saying so. Above it, **each question** is withheld on its
own `answered_count`, with **no count published** for a withheld question (`DEC-163`). The rating's figures carry
**their own** minimum (`rating_min_aggregate`); the two are read, never `3`.

### 2 · `065` — the regions, in the artboard's order

| # | Region | Built from |
|---|---|---|
| 1 | `h1` «الاستبانات» and its one primary «قالب جديد» | the frame's `h1` row; `ButtonLink` → `/app/admin/surveys/new` |
| 2 | the templates table — القالب · الأسئلة · الجلسات · افتراضي · ⋯ | `ui/data-table` (a `"use client"` wrapper in `src/components/survey/templates-table.tsx`, because columns take render functions — `DEC-159`); the name a `Link` to `?template=<id>` (selection survives a reload, no JS); the counts `<bdi>`, Western; ⋯ is `ui/menu` with «عدّل» (`href` → the editor) and «احذف القالب» (`href` → `?delete=<id>`, the server-side two-step `DetachControl` already uses); the phone stack is the primitive's, below `lg` |
| 3 | the selected template's name as a section heading, and its questions — السؤال · النوع · مطلوب | an `h2` with `<bdi>`, `ui/data-table` read-only: prompt `<bdi>`, the kind's label, نعم / لا. Selected = `?template`, else the first row (the artboard's) |
| — | the editor (not drawn) | `/app/admin/surveys/[templateId]` and `template-editor.tsx` **kept as they are** — `ui/reorderable-list`, ▲▼ by taps (`REQ-SUR-002`, `REQ-UIX-106`'s acceptance). See Q4 |

### 3 · ★★ The kept-behaviour tables (`DEC-208`) — re-derived from the REQs and the DAL

#### 3.1 · `064` — `src/app/[locale]/app/admin/sessions/[id]/survey/{page,actions}.tsx`, `components/survey/results.tsx`

| # | Behaviour | Now | After | REQ |
|---|---|---|---|---|
| 1 | Results read only through `survey_results()` via `getSurveyResults()` | `page.tsx:44` | same call | `REQ-SUR-005`, `REQ-SUR-009` |
| 2 | Staff = admin **and** moderator; a member gets `notFound()` | `requireStaff()` → `null` → `notFound()` | same | `REQ-SUR-005`, `REQ-ADM-020` |
| 3 | ★ The session's presenter — **an admin who presented included** — is refused by the database | `survey_results()` raises `not_authorized` … ★★ **and `getSurveyResults()` THROWS it, so the page renders the ERROR BOUNDARY, not `notFound()`** — the header comment says «renders `notFound()` for anyone the function refuses»; the e2e case only covers a plain member (refused earlier, by `requireStaff`). **A defect the rule found.** Same for another org's session (`not_found` throws) | the page catches the two mapped refusals (`not_permitted`, `not_found`) and renders `notFound()`; anything else still throws. No change to the DAL's contract | `REQ-SUR-005` |
| 4 | Another org's session / a missing one is the presenter's answer | `getSessionHeading()` → `null` (but see #3) | `getSessionHeading()` is **no longer needed for the title** (the hub draws it); kept only if #12 stays | `REQ-TEN-*` |
| 5 | No survey → «لا استبانة على هذه الجلسة» + the attach form (templates exist) or an empty state linking `/app/admin/surveys/new` | `:99-125` | kept, in the survey region, below the rating's figures if Q2 says they render without a survey | `REQ-SUR-001` |
| 6 | Attach: a bound server action, Zod first, the outcome in the URL (`?attached=1` / `?error=<key>`), no client state, works without JS | `actions.ts` | unchanged file | `REQ-SUR-001`, `REQ-NFR-002` |
| 7 | Detach: two steps server-side (`?confirm=1`), offered only while it can work, the refusal path kept | `DetachControl` | **component unchanged**, placed after the results | `REQ-SUR-001`, `DEC-163` |
| 8 | `?attached`/`?detached` → `role="status"`; `?error` → `role="alert"` with a message key | `:83-97` | kept; no explainer, the word only | `REQ-UIX-009` |
| 9 | Withheld: says withheld and why, never an empty chart; the min read and plural | `Panel` `:131-138` | kept — **the «why» line is required by `REQ-SUR-006`, so it survives `DEC-NEXT-25`** | `REQ-SUR-006` |
| 10 | Response rate over **eligible** attendees; zero eligible says so, no divide by zero | `results.tsx:49-67` | the أجاب and نسبة الرد stats; zero eligible → «—» and the word | `REQ-SUR-008` |
| 11 | Per question: answered count + mean, withheld panel with **no count**, free text list, bars with label **and** count as visible text, `<bdi>` on prompt, option label, answer | `results.tsx` | rebuilt as the artboard's cards, every behaviour kept | `REQ-SUR-006`, `DEC-163` |
| 12 | «attached after the session ended» sentence | `:128-130` (compares to `startsAt`, though its comment says completion) | ★ **an explainer sentence (`DEC-NEXT-25`), not drawn** — Q3 | `16` §9 case 4 |
| 13 | CSV: admin only, a plain `<a download>` (no prefetch), shown only when a survey exists | `SectionHeader.actions` `:62-76` | ★ **moves into the hub's header** through `tabActions.survey` (§1). Label «CSV» (artboard) vs «تصدير CSV» today — the link's name moves (ledger) | `REQ-ADM-017`, `REQ-SUR-007` |
| 14 | A moderator sees no CSV, and «التصدير لمشرفي المؤسسة» says why | `:143` | the link is absent; ★ the sentence is explainer copy and not drawn — **proposed dropped** (Q3); the route still answers a moderator as a stranger | `REQ-ADM-020`, `DEC-163` |
| 15 | The tab's title is an `h2` (wave 21) | `SectionHeader as="h2"` | the first `h2` is the rating panel's «تقييم الجلسة» (or «نتائج الاستبانة» if the figures need a section name for SR — decided in the create commit) | `REQ-UIX-089` |
| 16 | Western digits through `formatNumber` | throughout | same | `DEC-124` |
| 17 | The two writes' records | `survey.attached` / `survey.detached` in SQL (`0132:214`, `:242`) | unchanged | `REQ-ADM-023` |
| 18 | The CSV's record | `export.created` via `write_admin_export_audit()` (`0058`), fresh admin | unchanged, the route untouched | `REQ-ADM-017` |
| 19 | No-JS path | every control is a link or a native form | same; the ⋯ menu is not on this page | `REQ-UIX-*` |

#### 3.2 · `065` — `src/app/[locale]/app/admin/surveys/page.tsx`

| # | Behaviour | Now | After | REQ |
|---|---|---|---|---|
| 1 | Staff only, both roles; a member gets `notFound()`; the tables are staff-select with no write policy | `listSurveyTemplates()` → `null` | same | `REQ-SUR-001`, `REQ-ADM-020` |
| 2 | A moderator authors templates | the e2e «a moderator writes a template» | same | `REQ-ADM-020` |
| 3 | «قالب جديد» → `/app/admin/surveys/new` | `PageHeader.actions` | the `h1` row's one primary | `REQ-UIX-106` |
| 4 | Empty: «لا قوالب بعد» and the way out | `EmptyState` | kept (in place of the table) | `REQ-SUR-001` |
| 5 | Each template: its name `<bdi>`, question count, session count (copies made) | `Card` with two plural sentences | table cells, numbers `<bdi>` and Western; the sentences' six-form plurals stay for the phone card's labels | `REQ-SUR-001` |
| 6 | Editing a template changes no attached survey (the copy) | stated in the header comment, guaranteed by `0124` | unchanged — and ★ «الجلسات» counts copies made | `REQ-SUR-001` |
| 7 | «آخر تعديل» per template, in the org's zone (`getOrgPrefs`) | `:62` | ★ **not drawn** — dropped with the read of `getOrgPrefs` (Q3) | — |
| 8 | The page's description line | `PageHeader.description` | ★ explainer, not drawn — dropped (`DEC-NEXT-25`) | — |
| 9 | Open a template → the editor | the card is the link | ⋯ → «عدّل»; the name now selects (Q4) | `REQ-UIX-106` |
| 10 | Delete asks first, then deletes; attached surveys survive (`set null`) | inside the editor, client two-step | **kept in the editor**, and ⋯ → «احذف القالب» adds the same two-step server-side (`?delete=<id>` → a bound action → `?deleted=1`) | `REQ-SUR-001` |
| 11 | Questions reorder by taps alone | the editor's `ui/reorderable-list` | unchanged (editor kept) | `REQ-SUR-002`, `REQ-UIX-106` |
| 12 | Accessible names the suites pin | heading «الاستبانات», «لا قوالب بعد», the editor's «اسم القالب» · «أضف سؤالًا» · «انقل لأسفل» · «حفظ القالب» · list «أسئلة الاستبانة» | all kept (editor untouched); the list's text assertions move (§5) | — |

### 4 · ★★ Every mutation, with its record (contract 3)

| Screen | Mutation | Path | Record | Today |
|---|---|---|---|---|
| `064` | attach | `survey_attach()` | `audit_log` `survey.attached`, subject `session` | ✓ `0132:214`, proved `tests/rls/survey-authoring.test.ts:225` |
| `064` | detach | `survey_detach()` | `survey.detached` | ✓ `0132:242`, same test |
| `064` | the CSV | `/api/admin/exports/survey/[sessionId]` → `exportSurveyCsv()` → `write_admin_export_audit()` | `export.created`, subject `session`, fresh admin only | ✓ `0058`; proved only in the lead's demo spec — my wave-22 spec asserts the row too |
| `064` | an admin's ratings read | — | **none — the page makes no per-rater read** (§1.1) | — |
| `065` | create | `survey_template_save(null, …)` | ★ `survey_template.created`, subject `survey_template` | ★★ **nothing** |
| `065` | save | `survey_template_save(id, …)` | ★ `survey_template.changed` | ★★ **nothing** |
| `065` | delete (editor and ⋯) | `survey_template_delete(id)` | ★ `survey_template.deleted` | ★★ **nothing** |

★ **The lead's trigger sits on `public.survey_templates` ALONE** — `after insert or update or delete, for each row`, the
`org_domains_audit()` shape (`0005:315`). Measured why one table is enough:

1. **The six authoring tables have a `select` policy and no write policy** (`0124:242-246`); the only writers are
   `survey_template_save()` and `survey_template_delete()`.
2. **Every save updates the template row** — `update … set title = v_title` runs whether the title changed or not
   (`0132:116`) — so a questions-only save still fires `changed`. **A trigger on `survey_template_questions` or
   `_options` would write N rows per save**, because a save deletes and re-inserts the whole set (`0132:119`): that is
   «written twice». Delete cascades the questions under the one template row: one `deleted`.
3. ★ **The `DELETE` arm must return early when the parent org is gone**, as every append-only guard does
   (`perform_org_deletion()`, `0069:960-970` — «each return early when the parent org is already gone»). Without it
   `delete_org` cascades into `survey_templates`, the trigger inserts an `audit_log` row for an org already deleted, and
   **the org's deletion fails on the foreign key**. ★ **The same holds for the venue, category and company triggers.**
4. `before`/`after`: `{title}`. **The question set is not on the row** — the update runs before the delete and
   re-insert. If the lead wants the count or the prompts in `after`, an `after update` **constraint trigger,
   `deferrable initially deferred`**, sees the final set at commit; otherwise the row says «changed» and the title.
   (Q5.)
5. Actor: `write_audit()`'s own `coalesce` from the claims; `actor_role` the member's `org_role` — so a moderator's save
   is recorded as `moderator`. A save that changed nothing still writes `changed` (`updated_at` moves, so `old is
   distinct from new` is always true).

**Proof** (DoD): new `tests/rls/survey-template-audit.test.ts` — as an admin **and** as a moderator through the RPCs
(never as the owner): one `created`, one `changed` per save, one `deleted`, `actor_id` the caller; a refused save
(`title_taken`, `invalid`) writes nothing; a cascade from `perform_org_deletion()` succeeds. It lands after the lead's
migration (a trigger is not mine to propose).

### 5 · Existing tests that change — ledger lines (each in the commit that moves it)

| File | Owner | Line | Moves |
|---|---|---|---|
| `tests/e2e/wave10-event-survey-results.spec.ts` | mine | `:183`, `:205` heading «نسبة الاستجابة» | selector → the stat «نسبة الرد» (an expectation if a stat is not a heading: named here first) |
| ″ | mine | `:186` link «تصدير CSV» in `#main` | **expectation**: the link is in the hub header and named «CSV» (Q6) |
| ″ | mine | `:151`, `:158` «أضف الاستبانة», `:150`, `:170-174`, `:184`, `:189-195` | unchanged if the article/progressbar structure holds — the target |
| `tests/e2e/wave10-event-templates.spec.ts` | mine | `:157-159` «3 أسئلة», «لم تُستخدم بعد» | **expectation**: table cells «3» and «0» |
| `tests/components/survey/results.test.tsx` | mine | all seven cases import `results.tsx` | the file is deleted with the screen; its seven cases re-pointed at the new component, one ledger line each (heading, stat label) |
| `tests/components/survey/{detach-control,template-editor}.test.tsx` | mine | — | **untouched** |
| `tests/e2e/wave10-demo-survey.spec.ts` | **the lead's** | `:262`, `:389-392` (heading, «3 / 3», «من 3 حاضرين مؤهلين»), `:402` «تصدير CSV» | the lead's ledger lines — the hint «من N…» goes if §3.1 #10 drops it |
| `tests/e2e/wave11-lead-a11y-sweep.spec.ts` | the lead's | `:210`, `:214` routes | unchanged routes |

New: `tests/components/survey/{survey-figures,templates-table}.test.tsx`, `tests/rls/survey-template-audit.test.ts`,
(a) `tests/rls/survey-rating-distribution.test.ts`, `tests/e2e/wave22-event-survey.spec.ts` (the two jobs of §0, the
CSV's and the template's audit rows read back, the presenter-admin 404).

### 6 · New disagreements — artboard and line; not picked

- **D1 · The artboards treat the rating as part of the survey.** `AdminSurveys.dc.html:65-66`: the default template's
  first two questions are «تقييم الجلسة» and «تقييم المُقدِّم», type «نجوم 1–5». `AdminSurveyResults.dc.html`: the
  star bars (12 + 6 + 1) sum to «أجاب 19». **`DEC-074` and `REQ-SUR-004` make them two instruments** — different
  audiences (per-rater ratings are admin-only and audited; survey results are staff and never per-respondent),
  different minimums (`rating_min_aggregate` vs `survey_min_responses`), decorrelated writes. A merged figure would
  either show a moderator the rating's per-star data under the survey's rule, or apply the wrong minimum.
- **D2 · The anonymity line is false for the survey.** `AdminSurveyResults.dc.html`: «مجهولة · يراها المشرفون
  والمُقدِّم بعد 3 ردود». **A presenter never reads survey results** (`REQ-SUR-005`, `survey_results():60`). It is true
  of the **rating's** comments (`REQ-RAT-004`, `-006`). And «3» is a literal of two different settings.
- **D3 · «افتراضي».** `AdminSurveys.dc.html:57-58` draws a default column and badge. **No column holds it**
  (`survey_templates`: id, org, title, timestamps), and nothing attaches a survey by default (`REQ-SUR-001`: «optional;
  most sessions have none»). Drawn, not built — `DEC-231` §6.1's shape.
- **D4 · The question types' names.** The artboard writes «نجوم 1–5» and «نص»; `REQ-SUR-002` names «مقياس 1–5»
  and «نص حر», which the editor and the CSV use.
- **D5 · The selected template's questions are drawn BELOW the list**, not beside it (`AdminSurveys.dc.html`: two
  stacked tables in one column), where the agent file and `REQ-UIX-106` say «beside». I build the artboard's order.
- **D6 · No free-text for the rating's comments.** The artboard draws one text card; the rating's unattributed
  `comments` (the view's) are a second free-text list staff can read. Whether they appear on this tab is D1's ruling.

### 7 · Questions for the lead

1. **Q1 — the star bars** (§1.1): (a) a new staff-only `session_rating_distribution()` (a function, so a promotion
   this wave), (b) per-rater rows through the audited admin read, or (c) the survey's scale questions only. With (c)
   the page needs no new SQL.
2. **Q2 — a session with no survey.** «Shows what it shows today» (the attach state). Do the rating's two averages
   (and bars) render above it, since they are the rating's and exist without a survey? Today they do not.
3. **Q3 — four sentences under `DEC-NEXT-25`**: «attached after the session ended» (`16` §9 case 4), «التصدير لمشرفي
   المؤسسة», the list's description, «آخر تعديل». I propose all four dropped; the withheld «why» stays (`REQ-SUR-006`).
4. **Q4 — the editor.** No artboard draws it. I keep `/app/admin/surveys/[templateId]` and `template-editor.tsx`
   untouched (its suites green) and reach it from ⋯ «عدّل» and «قالب جديد». The alternative — «عدّل» in place on `065`,
   the read-mode pattern — is a rebuild with nothing to rebuild from.
5. **Q5 — `changed`'s `after`**: the title only, or a deferred constraint trigger for the question count (§4.4).
6. **Q6 — the header link's name**: «CSV» (artboard) or «تصدير CSV» (today, pinned twice, once in your spec).
7. **Requests, as custodian:** the `survey:` line in `admin/sessions/[id]/layout.tsx`'s `tabActions`; and, after your
   migration, the RLS case in §4.

Nothing in `DEC-160` §3 moves: no member and no instant on a response, results only through `survey_results()`,
`record_survey_response` and the rate screen untouched.

### 8 · Sync 1's rulings (`DEC-232`, `9a956ae4`) — what the build follows

- **Q1 = (c), the owner's**: the star bars are **the survey's own 1 – 5 questions** — `survey_results()`'s
  distributions, no new SQL. `DEC-074` stands: الجلسة and المُقدِّم are the rating's (`session_rating_aggregates`,
  as today), and **each figure says which instrument it is** (the stat's label names it). D1 closed that way.
- **`064` writes no `ratings.read_admin`** (STATUS corrected). The `notFound()` defect (§3.1 #3) is fixed in PR C.
- **Q2**: on a session with no survey the tab shows **exactly what it shows today** — the attach state, no rating
  figures.
- **Q3**: the four explainer sentences are dropped; the withheld «why» stays (`REQ-SUR-006`).
- **Q4**: the editor is kept untouched, reached from the row's ⋯. **Q5**: `after` carries the title only.
- **Q6**: the header link's word is «CSV»; the lead moves the demo spec's line.
- **D2**: the anonymity line tells the truth (`REQ-SUR-005` — staff only, never the presenter), its threshold read.
  **D3**: «افتراضي» absent. **D4**: `REQ-SUR-002`'s type names. **D5**: the questions **beside** the list
  (`REQ-UIX-106`), not below it.
- `data-table` stacks below `md` as built (`DEC-232` §6.6). No gendered verb in a new string (§6.7).
- The trigger on `survey_templates` with the org-gone return is the lead's. ★ **I tell the lead when
  `SurveyHeaderAction` exists**, and the lead adds the `survey:` key to `[id]/layout.tsx` as custodian.
- Build in C's worktree only, once its path is posted.

### 9 · Build log (PR C, `../kareem-marefa-wave22c`)

| Commit | What |
|---|---|
| `c7acdbaf` | delete — `064`'s `page.tsx` and `components/survey/results.tsx` |
| `26cd0cd8` | create — `064` from its artboard; `getSurveyResultsOrNull()` and `offersSurveyExport()` (add-only); `SurveyHeaderAction`; ledger W22-E1 … E9 |
| `81839d93` | delete — `065`'s `page.tsx` |
| `8eeeecea` | create — `065` from its artboard; `surveys/actions.ts` (`deleteFromList`); `components/survey/templates-table.tsx`; ledger W22-E10 |
| `0a05fe08` | `tests/e2e/wave22-event-survey.spec.ts` — the two jobs, every record read back |

**§3.1 read against the new `064`:** 1 ✓ · 2 ✓ · 3 ✓ fixed (`getSurveyResultsOrNull`) · 4 `getSessionHeading` gone with
#12 · 5 ✓ (★ `noneBody` dropped too, told to the lead) · 6 ✓ unchanged file · 7 ✓ unchanged component · 8 ✓ · 9 ✓ the
«why» kept · 10 ✓ the rate a figure; «لا حضور مؤهلون» the responses figure's hint (the reachable case is withheld + 0
eligible — `ok` with 0 eligible cannot happen, `eligible = greatest(attend, n)`) · 11 ✓ · 12 dropped · 13 ✓ moved to the
header · 14 dropped · 15 the first `h2` is the figures' (`sr-only`), each question an `h3` · 16 ✓ · 17, 18 ✓ unchanged.

**§3.2 read against the new `065`:** 1 – 4 ✓ (the empty state has no description now) · 5 ✓ cells, `<bdi>`, Western ·
6 ✓ · 7, 8 dropped · 9 ✓ ⋯ «عدّل» · 10 ✓ editor's two-step kept, the list's added server-side · 11, 12 ✓.

**Waiting on the lead:** the `survey:` key in `[id]/layout.tsx`; the trigger on `survey_templates` — then
`tests/rls/survey-template-audit.test.ts` (not written before it: a failing RLS file runs in everyone's suite).

**After the lead opened the captures (three corrections):**
- **065 — the questions BELOW the templates, full width**, as `AdminSurveys.dc.html` draws them. `REQ-UIX-106` said
  «beside» and `DEC-232`'s D5 ruled by it; the lead corrected both to the board.
- **Both tables in the console's surface card at a desk** — `042`'s own treatment, `md:rounded-panel md:border
  md:border-edge md:bg-surface`, on `data-table`'s `className`; no new primitive. `064`'s question cards were already
  `ui/panel` (neutral = the same surface).
- **`064`'s «لا يمكن إزالة استبانة أجاب عنها أحد» — dropped as a standing line.** Measured: it was not the only place
  the refusal is said. A released result has no detach control at all, so the line stood alone at the foot explaining
  an absence (`DEC-NEXT-25`). The detach region now renders only while it can work (no survey answered yet: withheld);
  a press that races an answer still lands on `?error=has_responses`, the `role="alert"` above — the refusal stays,
  where it happens. `DetachControl` itself is unchanged and its suite untouched. Ledger W22-E11:
  `wave10-event-survey-results.spec.ts:198` — the sentence `toBeVisible()` → `toHaveCount(0)` (expectation changed).
