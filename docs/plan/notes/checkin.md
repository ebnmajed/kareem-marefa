# checkin — working notes

Owner: `checkin` teammate, wave 1 (M2). Tracks: `REQ-RSV-001`…`011`, `REQ-CHK-001`…`014`, DEC-015.
Backlog: `STORY-RSV-001`…`004`, `STORY-CHK-001`…`006` (`STORY-RSV-005` is M4 — perks don't exist yet,
out of scope here).

## Scope decisions (flagging before building, not silently narrowing)

1. **No `graphile_worker.add_job()` calls in these RPCs yet.** Checked the local Supabase
   database directly (`select 1 from pg_namespace where nspname = 'graphile_worker'`) — the schema
   does not exist locally (the worker has never booted against this database; hosting is OQ-027,
   due at M3). The `03` §5.3/§5.4 RPC sketches call `add_job('calendar_upsert', …)` and
   `add_job('award_points', …)` — both belong to teams that don't exist yet (`notify` is M3,
   `scoring` is M4) and calling an undefined function would fail every RLS test that exercises
   `reserve_seat()`/`check_in()`. Every RPC below is fully correct and complete for the schema,
   RLS and business-logic requirements; the two forward-referenced job enqueues are left as
   `-- TODO` comments at the exact call site for `notify`/`scoring` to wire in when their schemas
   land. `promote_waitlist` and `rotate_codes` (mine) don't have this problem — see below.
2. **`REQ-RSV-011`'s acceptance criterion ("`rsvp` is absent from the scoring catalogue") has
   nothing to test yet.** `scoring_rules` is M4 schema, not created until then. Satisfied by
   omission: `reserve_seat()`/`cancel_rsvp()` never touch a points table. `POL-scoring_rules.catalogue`
   (03 §8.2) is the M4 scoring teammate's test, not mine.
3. **Cross-browser live counts (`REQ-RSV-010`) need Realtime, which is `event`'s territory**
   (`lib/realtime/**` is not in my glob). Counts are correct on every render (server-computed via
   `session_seat_counts()`), and a Server Action refreshes its own actor's view immediately, but a
   seat freed in *another* browser will not update without a manual refresh until `event` builds
   the private-channel broadcast infrastructure and RSVP counts are wired to it. Flagging for the
   lead/`event`, not blocking this story.
4. **RSVP panel error surfacing is coarse.** `SlotProps` is frozen to `{sessionId, memberId,
   locale}` (`src/components/sessions/slots.ts`) — no room for a `searchParams`-driven error
   banner inside the slot itself. Server Actions redirect with `?rsvpError=<code>` but the panel
   doesn't read it (it isn't wired to receive it). In practice the panel already hides invalid
   actions before they're possible (deadline passed → button hidden), so the residual race window
   is small; a real fix needs either a client-side error surface or extending the slot contract,
   both bigger changes than this story.
5. **Manual check-in marking authorization** is `is_staff()`-equivalent (admin or moderator) via
   `assert_active_member()` + a role check, matching `03`'s `P6 — staff-moderate` pattern —
   `assert_fresh_admin()` is admin-only and too strict for `REQ-CHK-008` ("admins and moderators").
6. **`check_in()` returns a `provision_member()`-style JSON envelope, not `public.check_ins`
   with `raise exception` for the expected failure modes.** Found this the hard way, writing the
   RLS tests: a single SQL statement that raises rolls back **everything it did**, including a
   write from earlier in the *same* function call. DEC-015 / `REQ-CHK-006` requires the
   `check_in_attempts` row to survive a rejection — but the `03` §5.4 sketch's literal
   `insert ...; if recent >= 10 then raise exception 'rate_limited'` undoes that very insert, in
   production exactly as much as in this suite's savepoint-per-statement harness (one RPC call is
   one statement is one transaction either way). Fixed by returning
   `{status, check_in?, conflict_session_id?}` for every outcome downstream of the attempt insert
   (rate limit, wrong window, wrong code, overlap) and reserving `raise exception` for `not_found`
   only (a caller error, before anything is logged). Worth flagging to the lead for `03` — the
   `check_in()` sketch there has the same latent bug if anyone implements it literally.
7. **`JOB-promote_waitlist` is a reconciliation safety net, not the atomicity mechanism.**
   `REQ-RSV-003`'s "no window where a seat is free but unassigned" is satisfied by promoting
   **inline, in the same SQL transaction**, inside `cancel_rsvp()` — not by a queued job (a queued
   job runs in a separate transaction later, which would reopen exactly the window the requirement
   forbids). The worker task exists for the *other* way a seat frees: an admin raising a session's
   capacity via a plain `UPDATE`, which has no RPC to hang a promotion off. It calls the same
   `service_role`-only `promote_next_waitlisted()` SQL function, is idempotent, and needs no
   `graphile_worker` schema assumptions beyond what any M3-hosted job needs.

## SQL — `supabase/proposed/checkin/`

- `01_rsvp.sql` — `reserve_seat(p_session)`, `session_seat_counts(p_session)`,
  `promote_next_waitlisted(p_session)` (service_role only), `cancel_rsvp(p_session)`.
- `02_check_in.sql` — `_issue_check_in_code(p_session)` (private core, no grants),
  `ensure_check_in_code(p_session)` (authenticated, presenter/staff only — this **is** the
  host-view read path, since `check_in_codes` has no member-facing select-and-lazily-issue story),
  `rotate_check_in_code(p_session)` (service_role only, same core, no identity check — the
  worker isn't a presenter or staff member, it's trusted directly), `revoke_check_in_code(p_session)`,
  `check_in(p_session, p_code)`, `mark_checked_in_manually(p_session, p_member, p_reason)`.

Every write RPC opens with `public.assert_active_member()` (0005) so a deactivated member or a
stale token is refused before anything else runs — the same staleness pattern `03` §1.3 asks for
on every privileged write, not just admin ones.

### `03` §8.2 rows this covers

`POL-rsvps.insert.rpc`, `POL-rsvps.reserve.capacity`, `POL-rsvps.reserve.deadline`,
`POL-rsvps.select.member`, `POL-check_in_codes.select.member`, `POL-check_in_codes.select.presenter`,
`POL-check_ins.insert.rpc`, `POL-check_ins.rate_limit`, `POL-check_ins.window`,
`POL-check_ins.revoked`, `POL-check_ins.single_use`, `POL-check_ins.overlap`,
`POL-check_ins.presenter`, `POL-check_ins.select.member`, `POL-check_in_attempts.select.staff`.

## Rotation model (`REQ-CHK-002`)

`check_in_codes.valid_from`/`valid_until` are set at issuance: `valid_until = valid_from +
rotation + grace`. "Currency" (is this the code the host view shows) is decided separately by
`_issue_check_in_code`: it returns the existing latest non-revoked code if its `valid_from` is
within the last `rotation` seconds, otherwise mints a new one. That means the **previous** code's
own `valid_until` (which already includes the grace period) keeps it acceptable to `check_in()`
for exactly `check_in_grace_seconds` after the new one becomes current — "exactly one current code,
at most one other in grace" falls out of that arithmetic rather than needing a second table or a
window function.

## Test coverage plan

- `tests/rls/rsvp.test.ts` — capacity (sequential reservations against a small-capacity session —
  see caveat below), idempotent double-reserve, deadline rejection, direct-insert rejection,
  atomic promotion on cancellation (join order), late-cancellation flag before/after cutoff,
  leaving the waitlist is never late, select-scoping (member B / staff / presenter).
- `tests/rls/checkin.test.ts` — rotation/currency/grace, revoke-and-reissue, direct-insert
  rejection, rate limit (11th attempt, attempt row written first), window (before start / after
  end, without revealing code correctness), single-use no-op, overlap exclusion naming the
  conflicting session, presenter cannot check in to their own session, manual mark requires a
  reason and produces the same row shape, host-view code is invisible to a checked-in member.

**Concurrency caveat, inherited from the harness, not specific to this story:** `tests/rls/db.ts`
uses one pooled connection (`max: 1`) and one transaction per test. "N concurrent reservations"
can only be *sequential* calls inside that one transaction — which still proves the counting logic
is correct for any call order (each call sees its own transaction's prior writes), but does not
exercise two physically concurrent connections racing the same `for update` lock. Noting this so a
future review doesn't mistake it for a gap introduced here.

## Screens

- `src/app/[locale]/app/sessions/[id]/check-in/page.tsx` (SCR-013) — single code field, one tap
  from the event page (once `sessions` links to it), Arabic-first, big touch target.
- `src/app/[locale]/app/sessions/[id]/host/page.tsx` (SCR-016) — the live code at
  `var(--fs-display)` size with wide tracking (an alphanumeric code, not Arabic body text — the
  "never letter-space Arabic" rule doesn't apply here), check-in count, revoke control.
- `src/components/checkin/rsvp-panel.tsx` — the `RsvpPanel` slot.

### 390 px RTL review (done — screenshots taken against a live `next dev` + local Supabase, real signed-in sessions, real RPC calls, not a mock)

- **Check-in screen** (`.../check-in`): title, instructions and the code field render correctly
  right-aligned with no overflow at 390 px; good, but the code input's own visual weight is a bit
  thin for a field someone fills in standing up — worth a follow-up pass with `/typeset` or
  `/polish` once the event page links to it, not a blocker.
- **Host view** (`.../host`): the live code (`ensure_check_in_code()`'s real output) renders large,
  bold, wide-tracked and centered — legible at a glance, which was the point of REQ-CHK-001; the
  zero-check-ins Arabic plural form and the "not authorized" message for a non-presenter,
  non-staff member both rendered exactly as authored, confirming REQ-CHK-014 is enforced by policy
  end to end (a real HTTP request from a real signed-in plain member got the refusal, not a hidden
  button).
