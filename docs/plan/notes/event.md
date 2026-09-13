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
attributed under my commit message rather than the right one.

## 7. What I have not built, and why

- **Photos** (`REQ-EVT-009`…`013`) — `STORY-EVT-005`/`006`, **M5**, not this wave.
- **Notification delivery** for mentions/replies — **M3** (`notify`), see §1.
- **The moderation queue UI** for reports — `console`, wave 3.
- **`app/sessions/[id]/page.tsx`** itself and its ordering — `sessions`'s file; I only fill the two
  slots it imports.
