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

## Wave 5 (M9) — the affordance matrix and the five live bugs

Read `.claude/agents/checkin.md` (rewritten for M9), `16` §5 in full, DEC-090, DEC-092, DEC-101,
DEC-103, DEC-105. Two lead commits landed first: `src/components/ui/index.ts` (types only) and
`src/lib/session-status.ts` (`sessionPhase`, `seatState`, `viewerRelation`, `closingSoon`,
`canGrantOn`, `sessionPhaseSource`, `GRANTING_AFFORDANCES`, `storedPhase`,
`neverGrantsMoreThanStored`) with 34 passing unit tests. Neither is mine to edit.

### Scope decisions, flagged before building

1. **`16` §5.3 says "7 phases × 7 relations = 49 cells"; the shipped `SESSION_PHASES` has SIX
   values** (`draft, pending_schedule, open, live, ended, cancelled` — DEC-105 collapsed the
   original nine-value draft into six, not seven). The matrix below is genuinely **6 × 7 = 42
   cells**. I built and tested all 42; the "49" in the plan text is stale prose from before
   `session-status.ts` was implemented, not a design decision I'm empowered to relitigate. Flagging
   for the lead's record, not blocking.
2. **The matrix carries NINE affordance columns, not the printed table's eight**: `16` §5.3's
   printed columns (RSVP, Cancel, Calendar, Tasks, Check in, Rate, Share, Materials) omit
   `hostConsole`, which `GRANTING_AFFORDANCES` in `session-status.ts` names explicitly. I added it
   as a ninth column since it's a real, tested affordance the host screen needs and the lead's own
   file already names it.
3. **`checkIn`'s matrix value is `boolean | "walkInsOnly"`, not a plain boolean** — DEC-065's
   per-session switch is a THIRD input (`allowWalkIns`) the phase/relation pair alone can't encode.
   `checkInAllowed()` resolves the tri-state against the actual switch and additionally requires
   `canGrantOn(session, "checkIn")` — the phase/relation cell alone is necessary but not sufficient;
   the direction guard still applies on top of it.
4. **`hostConsole` does NOT go through `canGrantOn`, deliberately, unlike `checkIn`.** I first
   assumed it should (session-status.ts's `GRANTING_AFFORDANCES.live` lists both), then worked
   through the actual failure mode and found it doesn't need it: `sessionPhase()` already returns
   `ended` (never a clock-derived `live`) for `state = 'in_progress'` whose end has passed
   (DEC-105's own worked example), so the matrix cell for `ended` already refuses `hostConsole`
   before `canGrantOn` would ever need to. The other direction — `published` past its start, clock
   says `live`, `start_session` hasn't run — is harmless for the host page specifically: the
   underlying `ensure_check_in_code()` RPC still checks real `state`, still refuses `not_open`, and
   the existing null-code fallback already renders the "not started" message. Unlike `checkIn`,
   showing the host console page early never produces a confusing RPC refusal a member has to
   puzzle out — it produces an accurate "not started yet" paragraph. So the page-level gate is the
   plain matrix cell (`phase ∈ {open, live}`, `relation ∈ {presenter, staff}`), and the CODE
   DISPLAY specifically stays gated by the RPC's own error, unchanged from wave 1. Writing this down
   because it's exactly the kind of reasoning `neverGrantsMoreThanStored` is meant to force, and I
   want the next reader to see why I didn't reach for `canGrantOn` reflexively.
5. **No SQL changes this wave.** All five bugs are presentation-layer — `reserve_seat()`,
   `cancel_rsvp()`, `check_in()`, `ensure_check_in_code()` are already correct and unchanged; the
   RLS suite (`tests/rls/{rsvp,checkin,priority-rsvp}.test.ts`) needs no new cases and none of the
   fixes below touch it. The bugs were always "the screen shows an affordance the RPC would refuse"
   or "the screen shows nothing informative before the member wastes a keystroke" — never "the RPC
   is wrong."
6. **`AttendanceOutcome` reads `getRsvpPanelData()` a second time**, the same DAL call `RsvpPanel`
   makes. Two round trips for the same page render, not one — DEC-092's own complaint about the
   calendar/tasks slots. I'm doing it anyway this wave because `SlotProps` doesn't carry
   `viewerRelation` yet (DEC-092 amends `slots.ts`, which is the lead's file, not mine, and hasn't
   landed) — once it does, both components should take `viewerRelation` as a prop instead of
   re-deriving it, collapsing back to one read. Flagging as a follow-up, not fixing now by reaching
   into a file I don't own.
7. **`RsvpPanel` no longer renders anything for `live` or `ended`** — not even the old "confirmed,
   here's your cancel button" for `live`. `16` §5.3's `live/confirmed` row lists no cancel (you
   can't back out of a seat once the session has started), and `ended` moves entirely to
   `AttendanceOutcome`. This is a narrower panel than before, by design — DEC-090's whole point.

### The matrix — `src/components/checkin/session-matrix.ts`

`AFFORDANCE_MATRIX: Record<SessionPhase, Record<ViewerRelation, AffordanceCell>>`, a literal table,
plus `affordancesFor(phase, relation)`, `checkInAllowed(session, relation, allowWalkIns, now)` and
`rateAllowed(session, relation, now)` (the latter for `event`'s track to pick up in a later wave —
not consumed anywhere this wave, built and tested because the lead asked for the whole matrix, not
just checkin's three columns). `tests/unit/session-matrix.test.ts` has one `it()` per of the 42
cells plus the two ask-4 starred cells called out by name and the walk-in tri-state.

### The five bugs — what actually changed

- **(a) + (b), `rsvp-panel.tsx`** — rewritten to read `data.phase`/`data.relation` (both now
  computed in `getRsvpPanelData()`, not the component — the `getPhotosPageData()` pattern the lead
  pointed at) and consult `affordancesFor()`. Returns null outside `open`. Fixes both: no cancel
  form on a `completed`/`archived`/`in_progress`/`cancelled` session (a), no reserve button once
  `live` (b) — `sessionPhase()`'s clock clause already does the "past the start" detection: nothing
  new to compute here, just a component that finally asks.
- **new `attendance-outcome.tsx`** — the `ended` read-only fact, «حضرت» / «لم تُسجّل حضورك»
  (`rsvp.attended` / `rsvp.didNotAttend`, new keys). No heading, no section, self-gates to
  `phase === "ended" && relation ∈ {attended, absent}`. **Not wired into the event page yet** — that
  needs `page.tsx`, the lead's file this wave (DEC-103). Suggested spot: in `<aside>`, right where
  `<RsvpPanel>` sits, rendered alongside it (`<RsvpPanel .../><AttendanceOutcome .../>` — each
  self-gates on a disjoint phase so exactly one of them ever prints anything).
- **(c), `check-in/page.tsx`** — new `getCheckInScreenData()` in `dal/checkin.ts` reads the session,
  computes phase/relation/`canAttemptCheckIn` (via `checkInAllowed()`). The page now shows the
  session's title (bdi'd) under the h1 always, and when `!canAttemptCheckIn` shows the reason in
  place of the form — reusing the EXISTING `error.*` keys (`not_started`, `session_ended`,
  `presenter_cannot_check_in`, `reservation_required`) for the reason banner too, since they already
  say the right thing proactively, not just as a post-submit refusal. Two new keys only:
  `error.not_published`, `error.cancelled`, for the two cases with no existing equivalent.
- **(d), `host/page.tsx` + `getHostView()`** — `HostViewData.phase` widens from the old three-value
  `"live" | "not_started" | "ended"` to the real `SessionPhase` (six values), computed by
  `sessionPhase()` from the session row instead of guessed from the RPC's error string. New copy
  for `draft`/`pending_schedule` (`host.notPublished`) and `cancelled` (`host.cancelled`). The
  walk-in toggle and manual-marking sections now gate on `affordancesFor(phase, "staff").hostConsole`
  (true only for `open`/`live`) instead of rendering unconditionally for any staff viewer of any
  phase.
- **(e), the predicate for the lead** — `canOfferCheckInLink(session: PhaseInput, relation:
  ViewerRelation, allowWalkIns: boolean, now?)` exported from `dal/checkin.ts` (thin wrapper over
  the matrix's `checkInAllowed()`). **The lead needs two DTO fields `getSessionForEvent()` doesn't
  have yet**: `viewerRelation` (already promised by DEC-092) and **`allowWalkIns: boolean`**
  (`sessions.allow_walk_ins`, not currently read by that function at all) — flagging the second one
  explicitly since DEC-092 only mentions the first.

### Tests

- `tests/unit/session-matrix.test.ts` — new, 42 cells + the walk-in tri-state + the two ask-4
  cells + a `neverGrantsMoreThanStored`-style direction check reused via `canGrantOn` for `checkIn`
  and `rate` inside the matrix's own helpers.
- `tests/components/checkin/rsvp-panel.test.tsx` — rewritten against the new DTO shape (`phase`,
  `relation` instead of raw `state`/`isPresenter`/`deadlinePassed`), plus new cases for `live` and
  `ended` rendering nothing.
- `tests/components/checkin/attendance-outcome.test.tsx` — new.
- No `tests/rls/*` changes — no SQL moved (scope decision 5 above).
- `tests/e2e/checkin.spec.ts` — unchanged assertions still hold (checked against the rewrite before
  running): the host-view h1 text, the live-session check-in flow with `allow_walk_ins = true`, the
  not-authorized message, all independent of the phase-messaging changes. Re-ran after the rewrite.

### ★ A streaming flake in `checkin.spec.ts`, and the general trap behind it

Found running the suite for real against the M9 build, not in review. Worth writing down where the
next reader hits it, because it is a repo-wide trap, not a `checkin`-specific one.

**What failed.** `checkin.spec.ts`'s "the RsvpPanel slot renders inside the real event page and
reserves a seat, at 390px" case — unmodified by me, passing before this wave — started failing with

```
Error: strict mode violation: getByText(/يتبقى \d+ مقعد/) resolved to 2 elements:
    1) <p class="mt-2 text-body text-fg-muted">يتبقى 30 مقعدًا</p> aka getByRole('region', { name: 'الحضور' }).getByRole('paragraph')
    2) <p class="mt-2 text-body text-fg-muted">يتبقى 30 مقعدًا</p> aka getByText('يتبقى 30 مقعدًا').nth(1)
```

**How often.** Reproducible, not a one-off — roughly 2 failures in 3 runs, `--workers=1` included, so
not a cross-worker artifact either.

**What I checked before concluding it wasn't a real duplicate render.** `rsvp-panel.tsx` has exactly
one JSX branch that renders `t("seatsLeft", …)`, so a genuine second copy would mean the component
runs twice, which nothing in the page calls for. To settle it rather than guess: a throwaway spec
signed in the same way, navigated to a comparable session, waited a full second past navigation, and
dumped `page.content()` — the FULLY SETTLED, post-hydration HTML — searching for the exact
`class="mt-2 text-body text-fg-muted">يتبقى 30` string. **One match, every time.** The DOM the browser
actually settles on never has two. And Playwright's own strict-mode error already named the fix
without being asked: `aka getByRole('region', { name: 'الحضور' })` is stated as resolving to a SINGLE
element even while the page-wide text search is ambiguous — if there were two regions, Playwright
could not have produced that unqualified alias for element 1.

**The rule.** This page is dynamic (`requireSession()` touches `cookies()` in the DAL — `04`
§ architecture, `CLAUDE.md`'s "Cache Components is OFF" note), so Next 16 streams it. Somewhere in
that streaming/hydration window — not before, not after — a text node matching `/يتبقى \d+ مقعد/`
transiently exists twice in the live accessibility tree, even though neither the initial HTML nor the
settled DOM ever does. `page.getByText(...)` searching the WHOLE PAGE is exactly the locator shape
that can catch that window; `page.getByRole("region", { name: "…" }).getByText(...)` — scoped to the
landmark the content actually belongs to — cannot, because (per the debugging above) the region
itself is never duplicated, only, transiently, a stray copy of matching text somewhere else in the
document. **Any spec asserting page-wide text on a dynamic route can hit this**, not just
`checkin`'s. The general fix is to scope every text/role assertion to the nearest semantic landmark
(`region`, `article`, a labelled `section`) instead of searching `page` directly — which is also just
better Playwright practice regardless of the streaming mechanics underneath, per Playwright's own
strict-mode guidance. Fixed in `checkin.spec.ts` by hoisting `const panel =
page.getByRole("region", { name: "الحضور" })` once and scoping every assertion and the reserve-button
click to it — 4/4 clean reruns afterward, 2/3 failing before. **Not fixed**: the streaming mechanics
themselves, which are Next's, not this app's, and not something a test change should try to fix.
