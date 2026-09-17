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

---

## Wave 7 plan

Read before writing this: `STATUS.md`'s wave-7 block, `CLAUDE.md`'s wave-7 ownership map (DEC-137),
DEC-045, DEC-065, DEC-090, DEC-092, DEC-103, DEC-107, DEC-113, DEC-115 … DEC-118, DEC-130, DEC-137
in full, REQ-CHK-001 … REQ-CHK-017, REQ-SES-004/005, REQ-PTS-011 … 013, REQ-CRT-004/011/013,
migrations `0010`, `0015`, `0021`, `0027`, `0028`, `0032`, `0041`, `0055`, `0065`, `0078`, `0079`,
`0081`, and the current `src/lib/dal/{rsvp,checkin}.ts`, `src/lib/session-status.ts`,
`src/components/checkin/session-matrix.ts`, `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`,
`src/app/[locale]/app/admin/sessions/[id]/{attendance,schedule}/**`, `src/app/[locale]/app/sessions/[id]/page.tsx`.

### 1 · The reversal (REQ-CHK-017)

**Soft-delete, not hard-delete — forced by the schema, not a style preference.** `0055` gives
`certificates.check_in_id uuid references check_ins(id) on delete restrict` **and** a check
constraint `kind <> 'attendance' or check_in_id is not null` — a `certificates` row can never be
repointed to null and a `check_ins` row it references can never be deleted while it exists. Hard
delete is therefore not an option regardless of ordering (revoke-then-delete still hits the FK).
`check_ins` gains three nullable columns — `removed_at timestamptz`, `removed_by uuid references
members(id)`, `removal_reason text` — the exact shape `comments.deleted_at` already established, and
"checked in" everywhere in the DAL becomes "a `check_ins` row exists **and** `removed_at is null`".

**The unique constraint and the exclusion constraint both become partial**, `where removed_at is
null`: `create unique index check_ins_session_member_active_uq on check_ins(session_id, member_id)
where removed_at is null` (replacing the inline `unique (session_id, member_id)`), and `exclude using
gist (member_id with =, session_window with &&) where (removed_at is null)` (replacing `0010`'s
unqualified one). Two things fall out for free: (a) **re-adding after a removal needs no new RPC at
all** — `check_in()` and `mark_checked_in_manually()` already `insert`; once the old row's slot is
freed by the partial index, a fresh code entry or a fresh manual mark just works, with its own new
`check_ins.id`, its own fresh points award, financially independent of the reversed original; (b) a
removed check-in stops counting against `REQ-CHK-013`'s overlap exclusion, so the member can be
checked into a session that overlaps the one they were retracted from. One nuance to flag, not fix:
re-adding **does not** re-trigger `fan_out_certificates()` (an edge trigger on the transition into
`completed`, which a long-since-completed session won't cross again) — a re-added member who already
had a certificate revoked stays without one until the (designer-owned) certificate library's manual
issuance path covers it. Noting it as a finding, not building around it.

**`remove_check_in(p_session uuid, p_member uuid, p_reason text)`** — admin-only
(`assert_fresh_admin()`, matching `adjust_points_manually()`'s pattern in `0032`, not `is_staff()`:
REQ-CHK-017 is explicit — "not a moderator, not a presenter"), mandatory reason (empty → `23514`,
same convention as `revoke_certificate`/`adjust_points_manually`). Body, in order:
1. Lock the active row: `select * from check_ins where session_id=... and member_id=... and
   removed_at is null for update`; not found → `P0002` (covers "never checked in" and "already
   removed" with one message — a second removal attempt is a caller error, not a silent no-op, per
   REQ-CHK-017's "a deliberate act on one member").
2. `update ... set removed_at=now(), removed_by=admin.id, removal_reason=btrim(p_reason)`.
3. **Points reversal** — the exact pattern `_reverse_comment_points()` (`0032`) already established:
   for every `points_ledger` row with `source='check_in' and source_id = check_ins.id` that has no
   existing `reversal` row pointing at it, insert `amount=-original.amount, source='reversal',
   source_id=original.id, session_id=original.session_id, reason='أُلغي تسجيل الحضور',
   rule_key=original.rule_key, idempotency_key='reversal:'||original.id||':v1'`, `on conflict
   (idempotency_key) do nothing`.
4. **Certificate revocation** — for every `certificates` row with `check_in_id = check_ins.id and
   state <> 'revoked'`, call the existing `public.revoke_certificate(cert.id, 'أُلغي تسجيل الحضور: '
   || p_reason)` verbatim (same actor context, already admin — no duplicated logic, REQ-CRT-011's
   whole audited path reused as-is).
5. **No-show symmetry** — when a `confirmed` `rsvps` row exists for `(session, member)`, call
   `public.award_points('no_show', member, 'no_show', rsvp.id, session)` — the exact `(rule, source,
   source_id, member)` shape `worker/src/tasks/evaluate_no_shows.ts` itself computes, so this can
   never double-award even if that job is later replayed for the same session (its own idempotency
   key coincides with this one). A walk-in with no `rsvps` row has no no-show rule to apply — REQ-CHK-017
   doesn't ask for one either.
6. `write_audit('check_in.removed', 'check_in', check_ins.id, old=to_jsonb(the locked row), new=null,
   p_reason, null, admin.id)`.

**The late-job race (item c).** Two functions re-derive from `check_ins` at the moment they run, and
both need the same one-line addition — `and removed_at is null` — at the exact point they already
re-derive, never trusting the job payload (the same principle `0065`'s own header states: "AN
ATTENDANCE CERTIFICATE RE-DERIVES ITS CHECK-IN... the job's payload is not trusted for it"):
- **`award_points()` (`0028`, scoring's)** — add, right after the disabled/unknown-rule check: `if
  p_source = 'check_in' and exists (select 1 from check_ins where id = p_source_id and removed_at is
  not null) then return; end if;`. A delayed `check_in` award job for an already-removed check-in
  silently skips, exactly like a capped or cooled-down rule already does — no new failure mode.
- **`issue_certificate()` (`0065`, designer's)** — add `and c.removed_at is null` to the `p_kind =
  'attendance'` re-derivation query. A delayed `issue_certificates` job for a removed check-in raises
  `no_check_in`, the same refusal it already raises for a member who never checked in at all.

`worker/src/tasks/evaluate_no_shows.ts` needs **no** change — considered and rejected: it runs exactly
once, at the trigger on the session's edge into `completed`, which necessarily precedes any possible
removal (you cannot remove a check-in for a session that has not yet completed), so there is no
ordering hazard; and its own `not exists (select 1 from check_ins where ...)` query already treats a
soft-removed-but-present row as "exists," so a hypothetical replay would not re-flag or double-award
a member my RPC already handled in step 5.

**What else attendance granted — three questions for the lead, my recommendation for each:**
1. **Rating right (now `sessions`') and photo upload right (`content`'s).** Recommend both gates
   re-derive live — "checked in **and** `removed_at is null`" — so a removed member loses the *future*
   right, exactly like the certificate/points hooks above; an **already-submitted** rating or photo is
   never touched (`REQ-RAT-004` makes ratings anonymous and aggregated — there is no member-scoped row
   to walk back; a photo is a separate moderation object with its own takedown path, `REQ-EVT-012`).
   This is a request in the contracts below, not something I build.
2. **Streaks, badges, levels (`0041`, `evaluate_streaks`/`evaluate_badges`/`evaluate_levels_perks`).**
   Recommend **not reversed**. These are evaluate-once, append-only by the codebase's own existing
   design — `member_badges`' unique constraint stops a re-award, and there is no un-award path
   anywhere in the product for *any* reversal, including the comment-removal reversal `0032` already
   ships. Retroactively stripping a badge needs re-running the evaluator against a hypothetically
   altered history, which nothing else here does either; treating check-in removal specially would be
   the one inconsistent case.
3. **Company points (`DEC-067`, `evaluate_company_points()`).** Recommend **not reversed**, same
   principle: evaluated once at completion, off the same job as `evaluate_no_shows`, and the
   leaderboard's own frozen-snapshot model (`05` §6) already treats a completed period's numbers as
   settled rather than continuously recomputed.

**Finding, not a question — fixed inline.** `mark_checked_in_manually()` (`0015`) never enqueues
`award_points` at all — unlike `check_in()` (enqueues inline) and unlike ratings/comments/proposals
(award via an `AFTER INSERT`/`UPDATE` trigger), a manual mark today produces a `check_ins` row and
certificate eligibility but **zero points**, which is a live gap against REQ-CHK-008's "grants exactly
the same rights as a code check-in." Since I'm already re-creating this function for the window change
below, I'm adding the identical `enqueue_job('award_points', ..., 'pts:check_in:'||ci.id)` call
`check_in()` already makes. This is a fix inside a file I own, not scope creep against DEC-137.

### 2 · The check-in window

**REQ-CHK-004, verbatim (unedited since Launch):** "A code is accepted only while the session is
`in_progress`. It expires when the session ends — including when an admin completes it early
(`REQ-SES-005`)."

**REQ-SES-005's note, verbatim:** "Completing early closes the check-in window immediately
(`REQ-CHK-004`)."

**`0078`'s actual gate** (`ensure_check_in_code`, at issuance): `if s.state <> 'in_progress' then
raise exception 'not_open' ...`. **`0079`'s actual gate** (`check_in`, at acceptance): `if s.state <>
'in_progress' then` branch into `not_started`/`session_ended`/`not_open`. Both are **state-based**,
both ends.

**DEC-116's tail (point 3), verbatim:** "★ The window has a floor as well as a ceiling, and the floor
is `REQ-CHK-004`'s, unchanged. A code is only valid while the session is running, so 'open by default'
cannot mean a member checks into a talk three weeks early — there is no code to enter. `DEC-113`'s
ceiling extends the tail to **`ends_at` + 2 hours** so the room can finish taking attendance after the
session ends. The switch closes the window early; it never opens it wider."

**The conflict.** Four texts don't agree on what gates the floor: (a) the shipped SQL is
state-based — `in_progress` or nothing; (b) `DEC-113`(3) is unconditional — "the phase no longer
gates check-in... the ceiling, not the phase, is what closes it," and `DEC-113`'s own "Supersedes"
line names `REQ-CHK-004`'s window rule as the gate on check-in **and** `canOfferCheckInLink()`'s
`live`-phase condition, both explicitly retired; (c) `DEC-116`(3) and `REQ-CHK-016`'s own ★
acceptance bullet restate `REQ-CHK-004` as "unchanged," which read literally reinstates the
state-based floor `DEC-113` just retired; (d) `REQ-SES-005`'s note is phrased as a *state-transition*
trigger ("completing... closes"), sitting awkwardly against a purely clock-derived window.

**My reading, precise, one of each part:**
- **Floor:** `now >= starts_at` (the session's **scheduled** start) — clock-derived, not
  `state`-derived. "The phase no longer gates check-in" (b) is unconditional in `DEC-113`'s own text,
  and `REQ-CHK-016`'s second acceptance bullet — "computed from the session's **scheduled** end, not
  from when it actually finished" — only makes sense if the whole window is schedule-derived, not
  state-derived; a state-based ceiling would automatically track *actual* completion, which that
  bullet explicitly rules out. I read `DEC-116`(3)'s "the floor is `REQ-CHK-004`'s, unchanged" as
  restating the *existence* of a floor (there is still a lower bound; "open by default" does not mean
  three weeks early), not the *mechanism* `0078`/`0079` happen to implement it with today — which is
  exactly the mechanism `DEC-113` names as superseded. This also unifies check-in with the screen's
  own long-standing principle (`session-status.ts`'s `sessionPhase()`: "the clock beats a stale row" —
  a `published` session whose start has passed reads `live` even while `JOB-start_session` lags),
  extending it from the *screen* to the *RPC* for check-in specifically — which is the whole
  substance of `DEC-113`'s own "this removes `checkIn` from the direction-guard problem" paragraph.
- **Switch:** `sessions.check_in_open boolean not null default true` (`DEC-116`.1). Opened and closed
  by the session's accepted presenters, any moderator, any admin (`DEC-116`.2), audited each time.
- **Ceiling:** `now < ends_at + interval '2 hours'` (`DEC-113`, `REQ-CHK-016`) — absolute, computed
  from the **scheduled** end, enforced in the RPC (both for accepting a check-in and for *opening* the
  switch — the ceiling refuses a re-open past it, not only new check-ins past it).
- **Early completion (`REQ-SES-005`'s note):** not a floor/ceiling mechanism at all under a clock-only
  model (a session completed early is still inside `[starts_at, ends_at+2h)` by the clock). Instead,
  `complete_session()` gets a one-line side effect: when it completes a session **before** its
  scheduled `ends_at` (the manual-override case `REQ-SES-005` describes), it also sets
  `check_in_open := false` — satisfying "closes the check-in window immediately" as a *default*,
  reversible by the room via the ordinary reopen action (`REQ-CHK-015`: "close and reopen it, at any
  time") for as long as `now < ends_at + 2h`. This needs a small cross-track SQL hook — see §4.

**Concretely, `check_in()`'s gate becomes**, in order: `starts_at is null or ends_at is null` →
`not_started` (defensive; unreachable for `published`+ per `0010`'s check constraint, same reasoning
`session-status.ts` already documents for its own unreachable rows) · `now < starts_at` →
`not_started` · `now >= ends_at + 2h` → `session_ended` · `not check_in_open` → **new status**
`check_in_closed` · else proceed to the walk-in check and the code lookup exactly as today.
`ensure_check_in_code()` mirrors the same floor+ceiling (its `state <> 'in_progress'` check is
dropped entirely) and additionally returns `check_in_open` so the host view can show a valid, rotating
code *and* "closed" at once. New i18n: `error.check_in_closed` (member-facing), `host.checkInOpen.*`
(staff-facing).

### 3 · Walk-ins as a publishing setting

- **`schedule_session()` (`0021`)** gains `p_allow_walk_ins boolean default false`, written into the
  same `update sessions set ...` as the date and venue — admin-only already (`assert_fresh_admin()`),
  satisfying `DEC-118`'s "the same audited RPC that writes the time and the place."
- **`set_session_walk_ins()` (`0079`) is dropped** — `drop function if exists
  public.set_session_walk_ins(uuid, boolean)`. `DEC-117`: the host view loses the toggle entirely.
  `DEC-118`: "not changeable from anywhere else." A revoked-but-present function would be dead code
  against a requirement that explicitly says no other door exists.
- **Host view (`host/page.tsx`, mine):** the whole `host.walkIns.*` `<section>` (the toggle form) is
  deleted, along with `setWalkInsAction` (`actions.ts`) and `setWalkIns()` (`dal/checkin.ts`).
  **Recommend keeping one read-only line** ("walk-ins: مسموح بها/غير مسموح بها") — the room still
  benefits from knowing the policy while running it, it's just no longer editable there.
- **Schedule form (feature-only, per `DEC-137`):** one checkbox in `schedule-form.tsx`, styled exactly
  like the existing `venueKind`/`custom` checkbox already in that file (no new primitive, no
  redesign — the instruction is explicit). Wired through `state.ts`'s form state and `actions.ts`'s
  server action. **Ordering dependency:** `actions.ts` calls whatever `dal/sessions.ts` export
  `sessions` extends with the new parameter (contract 1 below) — my half of this wiring can't
  typecheck until that lands, so I sequence it after `sessions` threads the signature, not before.

### 4 · SQL files — `supabase/proposed/checkin/`

| File | Adds / changes | `03` §8.2 rows | RLS test names |
|---|---|---|---|
| `01_check_in_window.sql` | `sessions.check_in_open` column; `set_check_in_open(p_session, p_open)` (presenter/moderator/admin, ceiling-enforced); re-creates `ensure_check_in_code()` and `check_in()` on the floor/ceiling/switch model | `RPC-check_in.floor`, `RPC-check_in.ceiling`, `RPC-check_in.switch_closed`, `RPC-set_check_in_open.role_set`, `RPC-set_check_in_open.ceiling`, `RPC-ensure_check_in_code.floor_ceiling` (replaces `0078`'s `.only_live` row) | `tests/rls/checkin.test.ts` |
| `02_walk_ins_publishing.sql` | `schedule_session()` re-created with `p_allow_walk_ins`; drops `set_session_walk_ins()` | `RPC-schedule_session.walk_ins` | `tests/rls/checkin.test.ts` (the RPC is `sessions`'-owned; I write the case here since it's my requirement, flagged to the lead in case it belongs in `sessions`' file instead) |
| `03_manual_mark.sql` | re-creates `mark_checked_in_manually()` on the same floor/ceiling (no `check_in_open` gate — see §6's recommendation) plus the missing `award_points` enqueue | `RPC-mark_checked_in_manually.window`, `RPC-mark_checked_in_manually.award_points` | `tests/rls/checkin.test.ts` |
| `04_attendance_removal.sql` | `check_ins.removed_at/removed_by/removal_reason`; unique + exclusion constraints become partial (`where removed_at is null`); `remove_check_in()` | `RPC-remove_check_in.admin_only`, `RPC-remove_check_in.reversal`, `RPC-remove_check_in.certificate_revoked`, `RPC-remove_check_in.no_show_symmetry`, `RPC-remove_check_in.idempotent`, `RPC-remove_check_in.readd`, `POL-check_ins.removed_excluded_from_overlap` | `tests/rls/checkin.test.ts` |
| `05_late_job_hooks.sql` | ★ cross-track: `award_points()` (scoring's) and `issue_certificate()` (designer's), one line each — see §1 | `RPC-award_points.skips_removed_check_in`, `RPC-issue_certificate.no_check_in_when_removed` | `tests/rls/checkin.test.ts` |
| `06_early_completion_hook.sql` | ★ cross-track: `complete_session()` (`sessions`'-owned) force-closes `check_in_open` on early completion — see §2 | `RPC-complete_session.closes_check_in_early` | `tests/rls/checkin.test.ts` |

Files `05` and `06` are the ones `DEC-137` doesn't pre-name by function — it says "hooks into
`scoring` and `designer` are SQL only," which covers `05`, but `complete_session()` is `sessions`'
RPC and isn't mentioned. Flagging `06` explicitly for sign-off before I write it, not assuming the
same permission extends silently.

### 5 · Three day-one contracts, drafted for consumption

1. **`checkin` → `sessions` — `schedule_session()`'s new parameter.** `p_allow_walk_ins boolean
   default false`, written by the same call `sessions`' `dal/sessions.ts` already makes at
   `src/lib/dal/sessions.ts:370`. `sessions` adds `allowWalkIns` to whichever options object that
   function accepts and to the row it reads back for the schedule form's `initial` prop.
2. **`checkin` → `sessions` — the switch as a DTO field and a predicate.** `EventSession`
   (`getSessionForEvent()`, `src/lib/dal/sessions.ts:464-573`) gains `checkInOpen: boolean`, read the
   same way `allowWalkIns` already sits there today. `canOfferCheckInLink()`
   (`src/lib/dal/checkin.ts:170`) gains a parameter: `canOfferCheckInLink(session, relation,
   allowWalkIns, checkInOpen, now?)` — a breaking signature change. `sessions`' call site
   (`src/app/[locale]/app/sessions/[id]/page.tsx:87`, currently `canOfferCheckInLink(session,
   relation, session.allowWalkIns)`) becomes `canOfferCheckInLink(session, relation,
   session.allowWalkIns, session.checkInOpen)`.
3. **`checkin` → `content` — the reversal entry's shape for `me/points`.** `source: 'reversal'`,
   `reason` is a **fixed, already-Arabic system string** («أُلغي تسجيل الحضور»), not a translation
   key — render it literally in `<bdi>`, exactly the pattern the comment-removal reversal
   (`0032`'s «حُذف المحتوى») already establishes. The admin's own free-text reason for the removal is
   **not** on this row — it lives on `check_ins.removal_reason` and the audit log. Recommend
   `content` treats this exactly like any other `points_ledger` entry (amount, reason, date); no
   special-casing needed beyond the reason string being fixed rather than parameterised. Flagging one
   open call for the lead: should the member's own reason (why *they* were removed) be surfaced
   anywhere on `me/points`, the way `REQ-CRT-013` surfaces a certificate's revocation reason to its
   own holder? My default is no — REQ-CHK-017 only asks that the reversal read "as an entry," not that
   it explain itself — but it's a short, cheap addition if the lead wants parity with certificates.

### 6 · The three routes

**C1 · `/app/sessions/[id]/check-in`.** Already past the `--wave7` floor (`Panel` is content's M9
primitive, already imported). Changes: `getCheckInScreenData()`'s session select gains
`check_in_open`; `ineligibleReasonFor()` gains a branch — window open, relation eligible, but
`!checkInOpen` → `"check_in_closed"`; `CheckInIneligibleReason`/`CheckInError` unions gain the new
value; `checkin.json` gains `error.check_in_closed`. No new primitive. Captures: the ready form, and
the new `check_in_closed` panel — the one state this wave actually adds — both at 390 px.

**C2 · `/app/sessions/[id]/host`.** Not yet past the floor — today's buttons/`<select>` are raw HTML.
Bringing it onto M9 (importing, not owning): `ui/button` (lead's) for revoke / the new open-close
switch / manual-mark submit; `ui/select` (`sessions`' primitive) for the manual-mark member picker;
`ui/panel` (`content`'s) for the status messages currently hand-styled `<p>` boxes. Removes the whole
walk-ins section (§3). Adds the `check_in_open` switch: current state in words, one button to
close/reopen, an audited action, a "closed" state can still show the live code (§2 — issuance and
acceptance aren't the same gate). `getHostView()` gains `checkInOpen: boolean`; new `dal/checkin.ts`
export `setCheckInOpen(locale, sessionId, open)`. `checkin.json` gains `host.checkInOpen.{title,
on, off, open, close, saved}`; drops `host.walkIns.*`. Captures: code + open, code + closed
(new), no-code states unchanged from wave 5's five.

**C3 · `/app/admin/sessions/[id]/attendance`.** Transfers wholesale — same path, ownership changes,
no file move. Bringing onto M9: `ui/data-table` (`console`'s primitive — the row-list pattern console
already used for the other admin lists) replacing the raw `<table>`; `ui/button` for actions;
`ui/panel` for the summary card; `ui/select` for the manual-mark picker; `ui/dialog` (lead's) for the
removal confirm — a mandatory reason field inside a confirm, the same shape `console`'s wave-6
reject-confirm already used. New feature: a per-row "إزالة" (admin-only) opening the dialog, calling
`removeCheckIn()` → `remove_check_in()`. Also relaxes the manual-mark gate — see the recommendation in
the closing list below. **All of `admin.attendance.*`'s current strings move into `checkin.json`**
under a new `attendance` namespace (admin.json isn't in my edit list this wave — `console` owns it —
so this is the only file I *can* write these into; I'll ask `console` to delete the old
`admin.attendance.*` keys once I've moved them, per the "old keys deleted by the file's owner on
request" rule). New: `attendance.remove.*` (dialog copy). `getAttendanceReport()`'s `AttendanceRow`
gains `removedAt: string | null` and `removedReason: string | null`; `removeCheckIn()` added to
`dal/checkin.ts`. Captures: an active row with "إزالة" available, a removed row (struck through /
badge with its reason), the removal confirm dialog, and the manual-mark form in its relaxed-window
state.

### Open decisions for the lead, with my recommendation for each

1. **The window reading itself** (§2): floor = `now >= starts_at` (clock, not `state`); switch =
   `check_in_open`, default true; ceiling = `now < ends_at + 2h`; early completion force-closes the
   switch via a `complete_session()` hook. **Recommend: adopt as written** — it's the only reading
   that makes `DEC-113`'s "phase no longer gates" and `REQ-CHK-016`'s "computed from the scheduled
   end" both literally true at once.
2. **The `complete_session()` SQL hook** (§2, §4 file `06`) touches a `sessions`-owned RPC; `DEC-137`
   only pre-names `scoring`/`designer` hooks as SQL-only. **Recommend: yes**, one line, same pattern
   as the pre-approved hooks, flagged for review before promotion rather than assumed.
3. **Soft-delete over hard-delete for the removal** (§1). **Recommend: yes** — not really a choice;
   `certificates.check_in_id`'s `on delete restrict` **and** its `not null` check constraint together
   make hard delete impossible without also rewriting `revoke_certificate()`'s contract, and
   soft-delete reuses `comments.deleted_at`'s exact existing precedent.
4. **What else a removal reverses** (§1, three sub-questions): rating/photo rights — re-derive live,
   don't touch anything already submitted; streaks/badges/levels — don't reverse, matches how no other
   reversal in the product touches them; company points — don't reverse, same "evaluated once, frozen"
   principle as the no-show job it shares. **Recommend: as stated**, all three "don't reverse except
   the future right."
5. **No-show symmetry** (§1 step 5): `remove_check_in()` proactively awards `no_show` with the exact
   key `evaluate_no_shows.ts` would compute, so the ledger backs the "لم تُسجّل حضورك" the member sees
   rather than leaving it as a UI-only fact. **Recommend: yes.**
6. **Manual-mark's own time gate**: SCR-044's admin add/remove — recommend **no ceiling, any time
   after the session starts** (`DEC-116`'s "at any time" reading, since this is a post-hoc
   reconciliation screen, not a live door), replacing today's hard `state='in_progress'` gate. The
   **host view's** own manual-mark section stays scoped to the floor→ceiling window (an in-room
   operational tool) but is **not** additionally gated by `check_in_open` — a staff override of the
   door shouldn't be blocked by the door itself.
7. **The reversal ledger row's `reason` text**: a fixed system phrase («أُلغي تسجيل الحضور»), not the
   admin's free-text reason (which stays on `check_ins.removal_reason` + the audit log only).
   **Recommend: yes**, and a small open call on whether the member should ever see the admin's actual
   reason (parity with `REQ-CRT-013`'s certificate-revocation reason) — my default is no unless the
   lead wants that parity.
8. **`mark_checked_in_manually()` never enqueues `award_points` today** — a pre-existing gap against
   REQ-CHK-008, unrelated to any wave-7 requirement. **Fixing it inline** as part of re-creating that
   function for the window change (§1, §4 file `03`); flagging so it isn't read as scope creep.

---

## DEC-141 — the lead's rulings, applied

All eight decisions above are **approved as recommended**, with two mandatory corrections and one
addition, all folded into the design below before any SQL is written.

**Ruling 1, applied — the window gains a state condition.** A clock-only floor/ceiling would accept a
code on a `cancelled` session whose scheduled start has passed. `check_in()`, `ensure_check_in_code()`
and `set_check_in_open()` all gain, ahead of the floor/ceiling check: `s.state not in ('published',
'in_progress', 'completed')` → refuse (the member-facing status is `not_started` for `check_in()`;
`ensure_check_in_code()` raises `not_open` as today). This is the same three-state family
`session-status.ts`'s own `sessionPhase()` documents as the only states that can carry both
`starts_at` and `ends_at` non-null from `published` onward (`0010`'s check constraint) — `archived`
is deliberately excluded from the CODE family (an archived session's code-entry door is closed), but
see the manual-mark carve-out below, which is a different door.

**Correction B, applied — `schedule_session()`'s walk-in parameter.** `p_allow_walk_ins boolean
default null`, meaning "leave unchanged": `update ... set allow_walk_ins =
coalesce(p_allow_walk_ins, allow_walk_ins), ...`. A `default false` would silently turn walk-ins off
on every reschedule that doesn't pass the field — this is why. The **old 13-parameter signature is
dropped explicitly** (`drop function if exists public.schedule_session(uuid, timestamptz, int,
timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode,
public.session_language)`) before the 14-parameter one is created, so no overload survives — `create
or replace` alone would add a second function, not replace the first, because Postgres identifies a
function by name **and** argument list. RLS case: `RPC-schedule_session.walk_ins_unchanged` —
reschedule (date only) without passing the parameter, assert `allow_walk_ins` is whatever it was
before.

**`canOfferCheckInLink()` — optional parameter, approved, but see the finding below for why the fix
needs to go further than just adding one.**

**Manual marks, applied precisely.** `mark_checked_in_manually()` branches on the ACTOR's role, not
on which screen called it (the host view and SCR-044 both call the same RPC):
- **admin:** floor only (`now >= starts_at`, `state <> 'cancelled'`) — no ceiling. ★ My own addition,
  flagged rather than assumed: I'm including `archived` in the admin's allowed state set (`state in
  ('published','in_progress','completed','archived')`) since SCR-044 is explicitly a reconciliation
  screen an admin may visit long after archiving, and `REQ-CHK-017`'s "at any time" doesn't carve
  `archived` out the way the code family's ruling did. Not gated by `check_in_open`.
- **moderator:** the same three-state family as the code RPCs (`published, in_progress, completed`)
  plus floor **and** ceiling (`now < ends_at + 2h`) — REQ-CHK-008's original scope, narrower than the
  admin's new "at any time." Not gated by `check_in_open` either (§6's reasoning: a staff override of
  the door shouldn't be blocked by the door).
- `remove_check_in()` itself needs **no separate state gate**: it only acts on an *existing* active
  `check_ins` row, and such a row could only have been created while the floor/ceiling/state
  conditions above already held at *check-in* time — there is nothing further to defend against.

### Reader inventory (Correction A)

Every reader of `check_ins`, at its latest definition, classified **exclude removed rows** (a
removed check-in must stop counting) or **must see them** (history, audit, export — showing nothing
would be less honest than showing what happened and that it was corrected), with the owner who acts
on it. "No change" means the reference isn't a functional query (a comment, or static rule
configuration jsonb that never touches the table itself).

**SQL — 12 migrations, at their latest definition:**

| Reader | File : line | Classification | Action | Owner |
|---|---|---|---|---|
| `check_ins` table, `check_ins_window()` trigger, the unique + exclusion constraints | `0010_m2_schema.sql:221-255` | — | constraints become partial (`where removed_at is null`); the trigger is unaffected (fires only on insert) | mine, file `04` |
| `POL-check_ins.select.member` comment | `0016_realtime_authorization.sql:71` | no change | a comment, not a query | — |
| `check_in()`, `mark_checked_in_manually()` | `0015_check_in_rpcs.sql` (superseded by `0079`, then by mine) | — | re-created, §1/§2 | mine, files `01`/`03` |
| badge rule seed data naming the `check_ins_count` metric | `0027_m4_schema.sql:545,551`, `0081_company_points.sql:509,515` | no change | static jsonb config, not a query against the table | — |
| `award_points()` | `0028_award_points.sql` (latest: itself) | exclude removed (for `source='check_in'` only) | the late-job hook, §1 | mine, file `05` |
| `send_rating_prompt()` | `0035_reminder_sends.sql:121-145` | **exclude removed** | a member whose check-in was removed should not be prompted to rate a session they're now on record as not having attended | ★ `notify`'s file — cross-track hook, flagging for sign-off, not pre-named by `DEC-137` |
| `evaluate_streaks()`, `evaluate_badges()`'s `check_ins_count` metric | `0041_recognition_evaluators.sql:28-61,70-121` | **exclude removed, forward-looking only** | this is *not* "reversing" an award (`DEC-141` ruling 4 says don't) — it's correctly computing a count that **hasn't crystallized into an award yet**. A removed check-in should not help a member cross a *future* threshold. An already-inserted `streak_awards`/`member_badges` row is untouched either way (no un-award path exists) | ★ `scoring`'s file — cross-track hook, flagging |
| `fan_out_certificates()` | `0065_certificates.sql:32-66` | **exclude removed** (defensive) | fires on the edge into `completed`; a removal this same instant is a vanishingly unlikely race, but the principle ("re-derive, don't trust a stale read") says filter it anyway | mine to propose, same file as the already-approved `issue_certificate()` hook, file `05` |
| `issue_certificate()` | `0065_certificates.sql:89-172` | exclude removed | covered in §1 already | mine, file `05` |
| member's own data export | `0073_retention_and_privacy.sql:240-246` | **must see them, WITH the removal fields** | `REQ-PRF-006`'s own data export should be honest and complete — a member's historical record should not silently lose a check-in they remember having. Add `removed_at`/`removal_reason` to the exported `check_ins` array | ★ `platform`'s file — cross-track hook, flagging |
| `evaluate_company_points()` | `0081_company_points.sql:374-420` | **no change** | same timing argument as `evaluate_no_shows` below — runs once, at completion, strictly before any possible removal; `DEC-141` ruling 4 says company points aren't reversed anyway | — (confirmed, not touched) |

**TS — 11 files, per the lead's routing:**

| Reader | File : line | Classification | Action |
|---|---|---|---|
| `getHostView()`'s live count | `dal/checkin.ts` (mine) | exclude removed | `.is("removed_at", null)` on the count query — REQ-CHK-001's live count is *current* attendance |
| `getCheckInScreenData()`'s own-check-in read | `dal/checkin.ts` (mine) | exclude removed | so a removed member is correctly offered the form again (the partial index already allows the re-insert) |
| `listUncheckedConfirmedRsvps()`, `listUncheckedForAdminManualMark()` | `dal/checkin.ts` (mine) | exclude removed | a removed member should reappear as a manual-mark candidate |
| `getAttendanceReport()` | `dal/checkin.ts` (mine) | **must see them** | read every row (removed and active); `checkedIn` reflects *active* status (`removed_at is null`) for the boolean, but the row itself stays, gains `removedAt`/`removedReason` — this is SCR-044's own audit view, REQ-CHK-012 |
| `getRsvpPanelData()`'s own-check-in read | `dal/rsvp.ts` (mine) | exclude removed | same reasoning as the check-in screen's own read |
| `session-status.ts` | lead's | — | not a literal query — `viewerRelation()`'s `checkedIn: boolean` input is supplied by callers already filtering `removed_at`; see the finding below for the deeper issue this file has |
| `ratings.ts`'s eligibility read (`not_checked_in`) | `sessions`' file, `dal/ratings.ts:75,88` | exclude removed | `DEC-141` ruling 4: the future rating right re-derives live | request to `sessions` |
| `search.ts`'s "ended" attended-filter | `sessions`' file, `dal/search.ts:160` | exclude removed | a removed check-in should drop the session from "attended" search results | request to `sessions` |
| `sessions.ts`'s `getSessionForEvent()` own-check-in read | `sessions`' file, `dal/sessions.ts:519` | exclude removed | same reasoning, plus feeds the phase/grace-window finding below | request to `sessions`, **see finding** |
| `admin-dashboard.ts`'s org-wide count | `console`'s file, `dal/admin-dashboard.ts:134` | exclude removed | the dashboard stat is current attendance, not gross history | request to `console` |
| `admin-exports.ts`'s CSV | `console`'s file, `dal/admin-exports.ts:157-165` | **must see them** | `REQ-ADM-017`'s export should carry `removed_at`/`removal_reason` columns, not silently drop the row | request to `console` |
| `evaluate_no_shows.ts` | lead's (worker task) | no change | already reasoned through in §1: runs once, at completion, strictly before any possible removal; its `not exists(...)` query already treats a soft-removed-but-present row as "exists" | confirmed, not touched |
| `issue_certificates.ts` (the worker task wrapper) | lead's (worker task) | no change | the SQL it calls (`issue_certificate()`) is where the filter belongs (file `05`); the TS wrapper trusts the RPC | confirmed, not touched |
| `award_presenter_points.ts`'s attendee-bonus fan-out | lead's (worker task), `worker/src/tasks/award_presenter_points.ts:41` | **flagging, not deciding** | `select id from check_ins where session_id=$1` with no `removed_at` filter — a removed check-in would still earn its attendee a `attendee_bonus` presenter-side point if this job runs after the removal. Whether this counts as "points" (ruling 4 doesn't cover it — it's a *presenter's* award keyed off *someone else's* check-in, not the attendee's own no-show/streak/company case) is the lead's call, not mine to assume | flagging for the lead |

### Found while applying `DEC-141`: the phase/grace-window mismatch — needs a decision before file `01`

**The problem.** `checkInAllowed()` (`session-matrix.ts`, mine) currently derives eligibility from
`affordancesFor(sessionPhase(session, now), relation).checkIn` — a **phase-bucketed** lookup. But the
new ceiling (`ends_at + 2h`, `DEC-113`/`REQ-CHK-016`) extends the check-in window **two hours past**
the point at which `sessionPhase()` already reports `"ended"` (its own clock clause ends exactly at
`ends_at`, with no knowledge of the grace period — it has no reason to, `DEC-105`'s totality table
was never about check-in specifically). Worse: `viewerRelation()`, called with `phase = "ended"`,
**reclassifies** a member holding a confirmed seat as `"absent"` (or `"attended"`, or `"none"`) —
`"confirmed"`/`"waitlisted"` are *structurally unreachable* once phase is `"ended"` (`viewerRelation`'s
own contract, `session-status.ts:249-255`). The `ended` row of `AFFORDANCE_MATRIX` carries no
`checkIn: true` cell for any relation. **Net effect: during the 2-hour grace window, a member who is
genuinely eligible to check in — held a confirmed seat, hasn't checked in yet — would be computed as
`relation = "absent"`, and every phase-bucketed lookup this codebase has for check-in would refuse
them, even though the RPC (`REQ-CHK-016`) explicitly accepts them.** This is the mirror image of the
bug `DEC-090`/`16 §5.4.1` row 4 fixed in wave 5 (never show an affordance the RPC refuses) — here the
screen would **hide** an affordance the RPC **allows**.

**Why `relation` can't be reused for this one affordance.** `DEC-092`'s whole point was carrying a
*derived enum*, not raw rows, onto the event page slot contract — cheap, but only correct as long as
every consumer's window matches the phase boundary it was derived from. Check-in's window no longer
does.

**My proposed fix, minimal, reusing reads that already happen.** `checkInAllowed()` stops consulting
the phase-bucketed matrix cell for `checkIn` entirely and becomes self-contained: floor/ceiling/state
computed directly from `PhaseInput` (independent of `sessionPhase()`), plus the *raw* viewer facts
(`isPresenter`, `rsvpStatus`, `isStaff` — not the derived `relation`) for who's eligible once the
window is open. Concretely:
- `getCheckInScreenData()` and `getRsvpPanelData()` (mine) already read these raw facts before
  deriving `relation` — no new query, just pass the raw shape instead of (or alongside) the enum.
- `getSessionForEvent()` (`sessions`', per the reader inventory above) **already reads** `mineRes`
  (`rsvps.status`) and `checkInRes` (`check_ins.id`) at `sessions.ts:518-519` to derive `relation` in
  the first place — **zero new round trips** to also expose them raw. **This supersedes my earlier
  draft of contract 2** (just adding `checkInOpen`): `EventSession` should additionally carry
  `rsvpStatus: RsvpStatus | null` and `checkedIn: boolean` (mirroring `RsvpPanelData.myRsvp.status`'s
  existing shape), and `canOfferCheckInLink()`'s signature becomes `(session, viewer: {isPresenter,
  isStaff, rsvpStatus, checkedIn}, allowWalkIns, checkInOpen, now?)` rather than taking `relation`.
- `session-status.ts`'s `GRANTING_AFFORDANCES.live` drops `"checkIn"` (down to `["hostConsole"]`,
  exactly as `DEC-113`'s own text says — "loses `checkIn`") — this was already an open request, not a
  new one, but it's now load-bearing for the fix above rather than a cleanup.
- `AFFORDANCE_MATRIX`'s `checkIn` column (mine) becomes **display-only** going forward — still useful
  for "is a check-in link worth mentioning in this cell at all" style rendering elsewhere, but no
  longer the source of truth for whether the RPC would accept one. I'll say so in the column's own
  comment rather than deleting it, since `16 §5.3`'s printed table still names the column and other
  cells (e.g. `open`'s rows) are unaffected by the grace-window problem — it's specifically the
  `ended`-row consequence that's wrong.

**Asking before I write file `01`**, since this changes an already-approved contract: is the proposed
fix (raw facts on `EventSession`, `GRANTING_AFFORDANCES.live` losing `checkIn`, `checkInAllowed()`
redesigned to stop consulting the phase-bucketed cell) the right shape, or does the lead want a
narrower patch?

---

## `DEC-141` applied — request for `session-status.ts` (condition b), and one correction

**The exact diff requested, to land in the same sync as `session-matrix.ts`'s change:**

1. `GRANTING_AFFORDANCES.live` drops `"checkIn"`:
   ```diff
   export const GRANTING_AFFORDANCES = {
   -  live: ["checkIn", "hostConsole"],
   +  live: ["hostConsole"],
     ended: ["rate", "survey", "certificate", "attendanceOutcome"],
   } as const satisfies Partial<Record<SessionPhase, readonly string[]>>;
   ```
2. `tests/unit/session-status.test.ts` — delete the two tests that now type-error (`"checkIn"` stops
   being assignable to `GrantingAffordance` once it's out of `GRANTING_AFFORDANCES`): "refuses
   check-in on a clock-derived live — the RPC would refuse too" (lines 165-171) and "allows check-in
   once the row says in_progress" (lines 173-176). The equivalent coverage now lives in
   `tests/unit/session-matrix.test.ts`, against `checkInWindowAllowed()` directly (added this sync —
   see below). "every granting affordance is refused whenever the source is the clock" (line 178)
   needs no edit — it derives its list from `GRANTING_AFFORDANCES` itself, so it automatically stops
   covering `checkIn`.
3. **New ask, found while writing the predicate**: `session-status.ts`'s own `parse()`/`endOf()`
   (private, lines 167-178) compute exactly the floor/ceiling arithmetic `checkInWindowAllowed()`
   needs and I don't want to fork. Requesting both **exported** (any name — I'll match whatever the
   lead picks) so `session-matrix.ts` imports them instead of carrying its own copy. **Until this
   lands**, `session-matrix.ts` carries a small, clearly-commented duplicate (`parseDate`/`windowEnd`)
   so I'm not blocked on it — delete-on-arrival once exported.

**`session-matrix.ts`'s own half, landed this commit:** `checkInWindowAllowed(session, viewer,
allowWalkIns, checkInOpen, now?)` — self-contained, added beside the untouched `checkInAllowed()`
(condition a: never break `dal/checkin.ts`'s current build). `AffordanceCell.checkIn`'s doc comment
now says it's display-only. Pinning test for condition (c)'s "second face," at the pure-predicate
level: `ended` phase (the screen's own signal, already stale by design), a confirmed seat, not yet
checked in, `now` still inside `ends_at + 2h` → `checkInWindowAllowed(...)` is `true`. The companion
half — `attendance-outcome.tsx` actually withholding «لم تُسجّل حضورك» in this window — needs
`checkInOpen` threaded through `getRsvpPanelData()`'s DTO, which needs the column to exist; deferred
to the routes phase per the lead's condition 5, noted here so it isn't lost.

**Correction to my own report, found writing file `04`: `has_checked_in()` is not the only SQL object
carrying the rating right.** Photos route through `has_checked_in()` (`0037`'s `photos_storage_write`
policy and storage policy, `0050`'s upload RPC) — one function, one fix. **Ratings do not** —
`ratings_write_self` (`0010:580-589`) checks `check_in_id in (select id from check_ins c where
c.session_id = ratings.session_id and c.member_id = auth_member_id())` **directly**, its own
independent reference to the table, never through `has_checked_in()`. Both need the `removed_at is
null` filter; both are in file `04` below, since `04` is the file that makes the column exist and
every direct reader of it correct on arrival, not a later hook.

---

## Contracts 1–3 — final, against the landed SQL (promoted 7b2ac81, `supabase/migrations/0084…0089`)

Supersedes §5's draft, which predated Correction B and the grace-window fix. Both `sessions` and
`content` can build against this directly.

**1 · `checkin` → `sessions` — `schedule_session()`'s new parameter. ALREADY WIRED, confirmed, not a
request.** `sessions` independently landed `p_allow_walk_ins boolean default null` (null = unchanged,
Correction B) at `src/lib/dal/sessions.ts:369-397` — `scheduleSession()`'s own `allowWalkIns:
z.boolean().nullable().default(null)` input and `p_allow_walk_ins: input.allowWalkIns` on the RPC call
match the landed `0085_walk_ins_at_publication` signature exactly. Nothing further needed here.

**2 · `checkin` → `sessions` — the switch as raw facts, not a derived relation.** Supersedes §5 item 2's
draft (`canOfferCheckInLink()` gaining a parameter) — that was written before the grace-window fix
(`checkInWindowAllowed()`, `docs/plan/notes/checkin.md` "Found while applying `DEC-141`") replaced it.
The landed shape:

- `dal/checkin.ts` exports **`canOfferCheckInFor(session, viewer, allowWalkIns, checkInOpen, now?)`**
  (already committed, beside the untouched `canOfferCheckInLink()` per condition (a)) — `viewer` is
  `{isPresenter, isStaff, rsvpStatus, checkedIn}` (`ViewerInput` from `@/lib/session-status`), never a
  derived `ViewerRelation`. This is the fix itself: the ceiling (`ends_at + 2h`) outlives the phase a
  derived relation is bucketed by, so a derived relation cannot answer this question correctly during
  the grace window.
- `EventSession` (`src/lib/dal/sessions.ts:526-571`) needs **three** new fields, not one — `checkInOpen:
  boolean` (new: `sessions.check_in_open`, not yet in the `select` at line 591 — needs adding to that
  column list) and `rsvpStatus`/`checkedIn` raw. The second pair costs `sessions` **nothing new to
  fetch**: `getSessionForEvent()` already computes both as locals right before deriving `relation`
  (`mineRes.data?.status` and `Boolean(checkInRes.data)`, lines 645-646) — DEC-092's "the two reads it
  buys" read at lines 611-622 already exist; this just also returns them.
- The event page's call site (`src/app/[locale]/app/sessions/[id]/page.tsx:29,87`, currently `import {
  canOfferCheckInLink} ...` / `canOfferCheckInLink(session, relation, session.allowWalkIns)`) switches
  to `canOfferCheckInFor(session, {isPresenter: session.viewerIsPresenter, isStaff:
  session.viewerIsStaff, rsvpStatus: session.rsvpStatus, checkedIn: session.checkedIn},
  session.allowWalkIns, session.checkInOpen)`. **Once that lands, `checkin` deletes
  `canOfferCheckInLink()` in its own commit** — condition (a)'s deal, not before.

**3 · `checkin` → `content` — the reversal entry's shape for `me/points`.** Unchanged from §5 item 3,
confirmed against the landed `remove_check_in()` (`0087_attendance_removal`): `points_ledger.source =
'reversal'`, `reason` is the **fixed, already-Arabic literal** «أُلغي تسجيل الحضور» (not a translation
key — render literally, in `<bdi>`, same pattern as `0032`'s «حُذف المحتوى»). The admin's own free-text
reason is **not** on this row (`check_ins.removal_reason` and the audit log only) — `REQ-CHK-017` asks
only that the reversal read "as an entry," and the lead already approved the fixed phrase. `content`
needs no special-casing beyond treating `source: 'reversal'` like any other `points_ledger` row.

## `checkInAllowed()` retired — commit `34d4c08`

Confirmed by `sessions` (contract 2 wired at `a55cf37`) that nothing in their files calls
`checkInAllowed()` or `canOfferCheckInLink()` any more — the deferred half of condition (a)'s deal
("delete only once confirmed unused") is now done:

- `session-matrix.ts`: `checkInAllowed()` deleted outright. `checkInIneligibleReason()` added
  (the reason-returning sibling `checkInWindowAllowed()` now derives from — `=== null`), covering
  the full `CHECK_IN_ATTENDANCE_STATES` gate, the floor, the `ends_at + 2h` ceiling, the
  `check_in_open` switch, and the walk-in door, in that order — the same order `0084`'s `check_in()`
  itself checks them in. `sessionPhaseSource` import dropped (dead once `checkInAllowed()` was gone).
- `dal/checkin.ts`: `canOfferCheckInLink()` deleted. `getCheckInScreenData()` rebuilt onto
  `checkInIneligibleReason()` on raw viewer facts (`isStaff`, `isPresenter`, `rsvpStatus`,
  `checkedIn`) plus the newly-selected `check_in_open` column — `phase`/`relation` stay on the DTO
  (other things on the screen may still want them) but no longer decide eligibility. The local
  `ineligibleReasonFor()` and its duplicate `CheckInIneligibleReason` type are gone, replaced by a
  `export type { CheckInIneligibleReason }` re-export from `session-matrix.ts`. `CheckInError` gains
  `"check_in_closed"` for `check_in()`'s new envelope status; both `KNOWN_ERRORS` sets
  (`check-in/page.tsx`, `check-in/actions.ts`) and `checkin.json`'s `error.*` (both languages) follow.
- `canOfferCheckInFor()` (already wired by `sessions`) is untouched — it already called
  `checkInWindowAllowed()` directly.
- `session-matrix.test.ts`: the retired `checkInAllowed` describe block is gone; a new
  `checkInIneligibleReason` block asserts the specific reason per case (`presenter_cannot_check_in`,
  `cancelled`, `not_published`, `session_ended` both faces — archived and past-ceiling —,
  `not_started`, the grace-window `null`, `check_in_closed`, `reservation_required`).
- Gate: `tsc` clean, `lint` 0 errors, `npm test` 1407/1407, `npm run test:rls` 791/791 (4 pre-existing
  todo).

`checkInAllowed()` and `canOfferCheckInLink()` no longer exist anywhere in the tree except as prose in
two comments (`sessions-event-check-in.test.ts`'s header, and one now-historical line of
`session-matrix.ts`'s own DEC-141 section) — neither is a live reference.

Next, per the lead's ordering: the switch TOGGLE UI on the host view (calling `set_check_in_open()`),
and C3 — `/app/admin/sessions/[id]/attendance` with the removal control (`REQ-CHK-017`).

## The walk-in checkbox hazard — closed twice, cleaned up once

`sessions` found it, closed at `3c140bf` with an interim `allowWalkInsKnown` marker; the lead's
`343991d` landed `page.tsx`'s own `allowWalkIns: session.allowWalkIns` read-back before that marker
was even needed for long, so `9acc4bf` removed it — `initial.allowWalkIns` is required now, the
`?? false` fallback is gone, `saveSchedule()` is back to a bare `formData.has("allowWalkIns")`. A new
`tests/components/checkin/schedule-form.test.tsx` renders the real form against `ar/admin.json` +
`ar/checkin.json` and asserts the checkbox's checked state actually reflects `initial.allowWalkIns`
both ways — the half of this fix a DAL-only test can't reach.

## The check-in switch UI — `b03f057`, and the admin-attendance e2e fix — `b5a84fc`

`set_check_in_open()` (0084) had role/ceiling/audit fully proven at the RLS layer since promotion;
nothing on any screen called it. Built: `HostViewData.checkInOpen`, `setCheckInOpen()` (DAL),
`setCheckInOpenAction()` (host/actions.ts, same bound-button shape as `revokeCodeAction` — no client
state, the RPC re-derives authority itself), and a section on host/page.tsx gated on
`view.consoleActive` (not `staffConsoleActive` — the RPC authorizes the session's own presenter too,
same broader set REQ-CHK-014 already scopes the console to). `checkin.json` gains
`host.checkInSwitch.*`, ar first.

Along the way, running `tests/e2e/admin-attendance.spec.ts` against real local Supabase for the first
time since console's wave-7 `DataTable` rebuild of `/app/admin/sessions` (`e0f0f2c`) surfaced two
latent breaks, both fixed test-file-only: `DataTable`'s dual table/card DOM strict-mode-fails a bare
`getByText` (the `admin-sessions.spec.ts` scoping idiom fixes it), and a click on a link named
"تقرير الحضور" timed out — that string is only the empty-state's fallback action; the row's own title
is the link's real accessible name now. Neither is `checkin`'s to fix in production code; both are
`checkin`'s spec to keep correct once assigned it this wave.

Next: C3 itself — `/app/admin/sessions/[id]/attendance` with the admin-only removal control
(`REQ-CHK-017`), on top of the already-promoted `remove_check_in()` (0087). Reversal design is
already recorded above (the four RLS-proven targets plus the fifth, the presenter's own
`attendee_bonus`); what's left is the UI: the control itself, its confirmation, and the report's own
redesign to show a removed row with its reason (flagged as C3's own scope back when the `removed_at`
stopgap first landed, `dal/checkin.ts`'s `getAttendanceReport()` comment).

## C3 committed — `bfe8e2a`

Built onto the lead's restated constraints (admin-only, mandatory reason, `ui/dialog` naming member
AND session, copy saying nothing is deleted and points reverse through a separate ledger entry,
removed rows stay visible with reason/remover, re-adding falls through to the ordinary manual mark —
confirmed, needs nothing new). `getAttendanceReport()` drops the `removed_at is null` stopgap filter
entirely and picks a member's active row when one exists, else their most-recently-removed one.
`removeCheckIn()` wraps `remove_check_in()` with `not_a_member`/`stale_claims`/`not_an_admin` kept as
three separate names (`admin-members.ts`'s own convention, not collapsed). `RemoveCheckInForm`
mirrors `ManualMarkForm`'s shape but keeps both fields CONTROLLED (not `defaultValue` + remount) so
the dialog's own text can read the current selection — the confirm button inside the dialog calls
`formRef.current?.requestSubmit()` as a plain button, never `DialogClose` wrapping the submit
(`takedown-button.tsx`'s own documented real-build timeout for that exact shape).

★ A real bug this round, caught only because the lead corrected my verification plan: my first
`getAttendanceReport()` rewrite dropped `member_id` from the `check_ins` select entirely — every row
collapsed into one bogus map entry keyed `undefined`. The `memorySupabase()` unit test stub never
caught it (it ignores a select's column list on purpose, so the fixture row always had every field
regardless); only a real e2e run against real PostgREST surfaced it, and even that was nearly wasted —
the local build Playwright was serving was frozen at 18:36, before this session's C3 work existed at
all, so the pass/fail from that first run said nothing real. **Local e2e cannot validate same-session
UI work here** — the `.next` `webServer` never rebuilds; verification for anything built and committed
in one sitting has to be tsc + lint + a component test (jsdom), and e2e specs are written to be
exercised at the LEAD's next sync build, not by me, locally, the same day. `tests/components/checkin/
remove-check-in-form.test.tsx` is what actually proved the dialog/action wiring this round.

★ DEC-137 applied to a whole route for the first time (`schedule-form.tsx`'s walk-in field was one
field in someone else's screen; this route is entirely mine): `checkin.attendance` replaces
`admin.attendance` as this page's and `manual-mark-form.tsx`'s namespace, both languages. The old block
in `admin.json` is dead, not deleted — that's `console`'s call on request, one writer per file.

★ `noValidate` swept onto every one of `checkin`'s forms that renders an app-side error beside a
native `required` field, per `content`'s real-build finding (`7f4809f`): `remove-check-in-form.tsx`,
`manual-mark-form.tsx`, `schedule-form.tsx` (the lead's own one-off request — touched only this one
attribute, nothing else, respecting the feature-only boundary on that file), `check-in/page.tsx`,
`host/page.tsx`'s manual-mark form. The other two forms on `host/page.tsx` (revoke, the switch) have
no `required` field and no app-side field error, so the rule doesn't reach them — left alone,
per the rule's own carve-out ("relies only on native required with no app-side error" is M13's).

The 5 named captures (`wave7-checkin-attendance-{populated,remove-dialog,removed}.png`,
`wave7-checkin-host-{open,closed}.png`, phone project, 390×844) are wired into the two specs,
guarded to fire only on the phone project — they'll come out of the lead's next sync build, not this
session's stale one.

Gate: `tsc` clean, `lint` 0 errors, `npm test` 1435/1435.

## C1–C6 closed — the record across syncs 5, 6 and the final gates

The stale-build lesson (above) held for the rest of the wave: nothing was run against local e2e
after it was learned, only `tsc`/`lint`/component tests, `node scripts/ui-lint.mjs`, and
`npx playwright test … --list` to sanity-check a spec's own structure without executing it. Every
finding below came back from the lead's own sync builds, never from a run of mine.

- **`399c35f`** — sync 5's `ui-lint` gate: `Field` wrapping `Select`/`Textarea` in
  `remove-check-in-form.tsx`; `ui/checkbox`'s own `Checkbox` (NOT wrapped in `Field` — its header is
  explicit that would double the label) for the schedule form's walk-in field. The primitive's
  documented contract won over the lead's own wording, confirmed right afterward.
- **`4fd7b6e`** — the member's name legitimately appearing twice once C3 added it as a `<select>`
  option too; scoped to `getByRole("cell", …)`.
- **`043c03f`** — both specs' captures onto `E2E_SHOTS_DIR` (`wave7-content-me.spec.ts`'s own helper
  shape); the one stale PNG this session's own local run had produced, deleted.
- **`d79a8a9`** — C6's capture never existed anywhere: a new, minimal spec
  (`checkin-schedule-walk-ins.spec.ts`) asserting the checkbox renders CHECKED for a session with
  `allow_walk_ins` already true — the actual regression guard for the whole `343991d` arc, not merely
  a screenshot.
- **`a2baf05`** — `checkin.spec.ts`'s code-entry hydration race (`sessions`' own `1e626cc` for the
  identical shape), applied at all three fill-then-submit sites in the file, not only the one cited.
- **`4d1fbea`** — sync 6: `memberLabel`/`removeMemberLabel` were never really distinct once
  Playwright's substring matching is accounted for — fixed for real this time (a genuine a11y
  improvement, not only a test workaround), plus the same hydration-duplication class on
  `"رمز الحضور"`, plus C1's two captures (`check_in_open` toggled straight through the database —
  the host-UI round trip is the switch test's own, right above it).

Final gates at `70bfb21`: every case in both specs passed on both projects, C1 and C3 closed
alongside C2/C4/C5/C6 (already closed by sync 6). **All six rows (C1–C6) are closed.** Nothing
queued; standing by for the PR.

---

## Wave 9 plan — the day carries check-in (`DEC-150`, contract 4)

Planning only. Nothing below is built until the lead approves. Written against `DEC-150`'s
description of `0100`, which is **not landed yet** — every ambiguity is a numbered question at the
end, not an assumption.

The whole track in one line: **eight definer functions stop keying on the session and key on a
day, without a single caller on `main` noticing.**

---

### 1 · CONTRACT 4 — published

#### 1.1 The signatures, verbatim

Each keeps `p_session` and gains a **trailing `p_day uuid default null`**. The old signature is
dropped **in the same file** so PostgREST never sees two overloads (`0085`'s lesson).

```sql
public.check_in                 (p_session uuid, p_code text, p_day uuid default null)                      returns jsonb
public.ensure_check_in_code     (p_session uuid, p_day uuid default null)                                   returns public.check_in_codes
public._issue_check_in_code     (p_session uuid, p_day uuid default null)                                   returns public.check_in_codes
public.rotate_check_in_code     (p_session uuid, p_day uuid default null)                                   returns public.check_in_codes
public.revoke_check_in_code     (p_session uuid, p_day uuid default null)                                   returns public.check_in_codes
public.mark_checked_in_manually (p_session uuid, p_member uuid, p_reason text, p_day uuid default null)      returns public.check_ins
public.remove_check_in          (p_session uuid, p_member uuid, p_reason text, p_day uuid default null)      returns public.check_ins
public.set_check_in_open        (p_session uuid, p_open boolean, p_day uuid default null)                    returns public.sessions
```

**Every return type is unchanged**, `set_check_in_open()`'s included. That one is not cosmetic:
`tests/rls/checkin-window.test.ts:152` reads `check_in_open` off the returned row
(`select * from public.set_check_in_open($1, false)`), so the function must keep returning a
`public.sessions` row whose `check_in_open` is true of the session. §3 is how that stays true.

**`has_checked_in(p_session)` is not re-created.** Its text is already «an active check-in on this
session, any row, `removed_at is null`» — which *is* «any day» the moment rows carry one. `03` §2's
four rights keep the definition they have. One less function to get wrong.

#### 1.2 The order inside the file, which is load-bearing

`rotate_check_in_code()` is `language sql`, so it records a **hard catalogue dependency** on
`_issue_check_in_code(uuid)`. Dropping the old private core while the old wrapper still exists fails
outright. The file therefore runs:

1. `create function public._issue_check_in_code(uuid, uuid)` — the new core.
2. `create function` the four code wrappers + the three attendance RPCs, new signatures, all calling
   the 2-argument core.
3. `drop function public.rotate_check_in_code(uuid);` — releases the sql-body dependency.
4. `drop function` the other six old signatures.
5. `drop function public._issue_check_in_code(uuid);` **last**.
6. `revoke execute … from public, anon` then `grant execute … to authenticated` (and
   `to service_role` for `rotate_check_in_code`) **on every new signature**.

Step 6 is not optional and is the easiest thing in this file to forget: a newly created function
defaults to `execute` for `public`, so a missing revoke hands `anon` the check-in RPC. Invariant 6 in
its function form.

#### 1.3 How a null `p_day` resolves

One rule, one implementation, for every function:

```sql
v_day := coalesce(
  p_day,                                                       -- 1. the caller said which day
  <the code's day>,                                            -- 2. check_in() only — see below
  public.resolve_session_day(p_session, now())                 -- 3. 0100's own rule, called not copied
);
```

**Step 2 exists only in `check_in()`**, and it is the requirement's own words — «the code belongs to
a day, so the member never says which»:

```sql
select c.session_day_id from public.check_in_codes c
 where c.session_id = p_session and c.code = v_code
   and c.revoked_at is null and now() between c.valid_from and c.valid_until
```

A wrong code matches nothing and falls through to step 3, so a refusal still reveals nothing about
the code — `check_in()`'s ordering rule (`0084`) survives intact: the day is *chosen* early, the code
is still *validated* last, after the window, the switch and the walk-in door.

**Step 3 is `0100`'s rule and must be `0100`'s function** (question 1). Restated so the plan is
readable on its own: the day whose window, extended to its check-in ceiling, contains `now()` — the
**later-started** if two do; else the **latest day already begun**; else null.

**A null result maps to `not_started`.** If no day has begun, the session has not begun. Past the
last day's ceiling, step 3 returns the last day, whose ceiling has passed, so the gate says
`session_ended` — the same two answers `main` gives, reached the same way.

**An explicit `p_day` that is not a day of `p_session`** (wrong session, wrong org, deleted) is
`not_found` / `P0002`, raised at the same point the bad-session check already raises it — before any
write, so nothing rolls back and `DEC-043` is untouched.

#### 1.4 The test that pins the resolution to `0100`'s trigger

`tests/rls/checkin-days.test.ts` (new file — rule 4). Both paths are exercised **at the same
`now()`** and must land on the same `session_day_id`:

| Case | The legacy path | My path | Must agree on |
|---|---|---|---|
| two days on one date, 9–12 and 13–16, clock at 13:30 | a direct `insert into check_ins` with no `session_day_id` → `0100`'s `before insert` trigger fills it | `check_in(p_session, <live code>, null)` and `ensure_check_in_code(p_session, null)` | day 2 (the later-started) |
| the same, clock at 12:30, cap ruled **on** | the trigger | both RPCs | day 1 |
| the same, clock at 12:30, cap ruled **off** | the trigger | both RPCs | day 1 (both windows contain 12:30 only if day 2 has started — it has not) |
| a week after the last day | the trigger | `remove_check_in(…, null)` | the last day (latest begun) |
| before day 1 | the trigger raises / returns null | `check_in()` → `not_started` | nothing resolves |

If the lead puts the resolver in `0100` as one function, this test is proving *agreement of one
function with itself* — which is the point: it fails loudly the day someone adds a second copy.

#### 1.5 The `n = 1` statement, function by function

At one day, `resolve_session_day()` returns that day for every `now()` at or after its start, and the
day's window **is** the session's stored window (contract 1). So every gate compares the same two
instants it compares today. What that guarantees, exhaustively:

| Function | Envelope statuses / error codes | Audit action, entity | Job key |
|---|---|---|---|
| `check_in()` | `ok` · `already_checked_in` · `presenter_cannot_check_in` · `rate_limited` · `not_started` · `session_ended` · `check_in_closed` · `reservation_required` · `invalid_code` · `overlap` (+ `conflict_session_id`); raises `not_found` `P0002` | none | `award_points`, `pts:check_in:<check_in.id>` |
| `ensure_check_in_code()` | raises `not_found` `P0002` · `not_authorized` `42501` · `not_open` `P0001` | none | none |
| `_issue_check_in_code()` | raises `not_found` `P0002` | none | none |
| `rotate_check_in_code()` | inherits the core's | none | none |
| `revoke_check_in_code()` | raises `not_found` `P0002` · `not_authorized` `42501` · `no_active_code` `P0002` | `check_in_code.revoked`, `check_in_code` | none |
| `mark_checked_in_manually()` | raises `reason_required` `23514` · `not_authorized` `42501` · `not_found` `P0002` · `not_open` `23514` · `member_not_found` `P0002` · `presenter_cannot_check_in` `23514` · `overlapping_session:%` `23P01`; returns the existing row on a repeat | `check_in.manual`, `check_in` | `award_points`, `pts:check_in:<check_in.id>` |
| `remove_check_in()` | raises `reason_required` `23514` · `not_found` `P0002` · `assert_fresh_admin()`'s `not_a_member` / `stale_claims` / `not_an_admin` | `check_in.removed`, `check_in` | ledger `reversal:<ledger id>:v1`, reason «أُلغي تسجيل الحضور»; `revoke_certificate(cert, 'أُلغي تسجيل الحضور')`; `award_points('no_show', member, 'no_show', rsvp.id, session)` |
| `set_check_in_open()` | raises `not_found` `P0002` · `not_authorized` `42501` · `not_open` `P0001` · `ceiling_passed` `P0001` | `session.check_in_open_changed`, `session`, subject = **the session id** | none |

Two are worth saying out loud because they are the tempting things to change and must not be:

- **`set_check_in_open()`'s audit row stays on the session.** `subject_type = 'session'`,
  `subject_id = <session id>`, action `session.check_in_open_changed`. The day goes in the `after`
  jsonb as an extra key (`{"check_in_open": false, "session_day_id": "…"}`), which
  `checkin-window.test.ts:196` tolerates — it reads `after.check_in_open` by name. Re-pointing the
  subject at `session_day` would move every audit-screen filter and every `03` §8.2 row for no gain.
- **`check_in()`'s rate-limit count stays per `(session_id, member_id)`**, not per day. Ten attempts
  in ten minutes is a ten-minute window; nobody is legitimately attempting two days inside it, and
  making it per day would hand a member a fresh budget per day of the workshop. The attempt row is
  *stamped* with `session_day_id` (nullable in `0100`) for forensics. `DEC-015`'s ordering — the
  attempt row written **before** the limit is checked, every path after it returning rather than
  raising — is untouched.

#### 1.6 Is a day's ceiling capped by the next day's start? — **my recommendation: yes**

The case: a 9–12 day and a 13–16 day on one date. Day 1's uncapped ceiling is 14:00; at 13:30 both
days' windows are live.

**Recommend `least(d.ends_at + interval '2 hours', <next day by position>.starts_at)`**, as one
function `public.check_in_ceiling(p_day uuid) returns timestamptz`, used by every gate in §1.5 and by
`resolve_session_day()` itself. Three reasons:

1. **It closes a divergence between the two ways of naming a day.** The resolver already picks day 2
   at 13:30 ("the later-started"). Uncapped, day 1's window is reachable *only* by passing `p_day`
   explicitly — so the same clock produces two different answers depending on which door you came
   through. That is the shape of bug that survives review and surfaces in a room.
2. **Attendance is evidence.** Accepting a day-1 check-in at 13:30, while day 2 is running in the
   same room, records a person as present at a meeting that ended ninety minutes ago.
3. **It also closes the only window in which a live code can disagree with the clock.**
   `ensure_check_in_code()` refuses to mint past the ceiling, so with the cap no day-1 code can still
   be inside `valid_until` once day 2 has begun. Uncapped, a code minted at 13:55 outlives day 2's
   start. With the cap, step 2 and step 3 of §1.3 can never name different days.

**The cost, stated:** a room that finished at 12:00 and is still catching stragglers at 13:05 loses
the grace it would have had — but only because another meeting of the same workshop has started.
The repair path is untouched: the **admin's manual mark has no ceiling at all** (`REQ-CHK-017`,
floor-only), which is exactly the release valve `DEC-116` designed for this.

**At `n = 1` the expression is provably inert** — there is no next day, `least(x, null)` is `x` — so
this cannot move a one-day session by construction, not by care. Lead rules at sync 1; if the ruling
is «no cap», `check_in_ceiling()` becomes `d.ends_at + interval '2 hours'` and nothing else in this
plan changes.

---

### 2 · Function by function — the live text, its migration, and what changes

#### `check_in()` — live text `0087_attendance_removal.sql`

Third re-creation (`0015` → `0028` → `0079` → `0084` → `0087`). Line by line:

| Today | Wave 9 |
|---|---|
| `select * into s from public.sessions where id = p_session` | unchanged — the session is still read, for `org_id`, `state`, `allow_walk_ins` |
| — | **new**: resolve `v_day` (§1.3), then `select * into d from public.session_days where id = v_day and session_id = p_session`; a non-null `p_day` that misses raises `not_found` |
| `is_presenter_of(p_session)` → `presenter_cannot_check_in` | unchanged — a presenter is a presenter of the session, not of a day |
| `select … from check_ins where session_id = p_session and member_id = m.id and removed_at is null` | `where session_day_id = v_day and member_id = m.id and removed_at is null` — **«already checked in» is per day** |
| the attempt count over `(session_id, member_id)`, 10 minutes | unchanged (§1.5) |
| the attempt insert | **gains `session_day_id => v_day`** (nullable column, so a null day is still insertable) |
| `if v_recent >= 10 → rate_limited` | unchanged |
| `s.state not in ('published','in_progress','completed') … → not_started` | the **state family stays on the session** — it is a lifecycle fact, not a meeting fact |
| `s.starts_at is null or s.ends_at is null` | `v_day is null or d.starts_at is null or d.ends_at is null` → `not_started` |
| `now() < s.starts_at → not_started` | `now() < d.starts_at` |
| `now() >= s.ends_at + interval '2 hours' → session_ended` | `now() >= public.check_in_ceiling(d.id)` |
| `if not s.check_in_open → check_in_closed` | `if not d.check_in_open` — **the day's switch** |
| the walk-in door, reading `s.allow_walk_ins` and `rsvps` | unchanged — one registration covers every day (`DEC-120`), so the door is a session fact |
| the code lookup `where session_id = p_session and code = v_code …` | **gains `and c.session_day_id = v_day`** — a code minted for another day is not a code for this one |
| `insert into check_ins (… session_window) values (…, tstzrange(s.starts_at, s.ends_at, '[)'))` | `session_day_id => v_day`; `session_window` is left to `0100`'s own trigger, which derives it from the day (question 2) |
| the `exclusion_violation` handler's conflict lookup on the session's range | the **day's** range |
| `update check_in_attempts set succeeded = true where id = (…)` | the subselect gains `and session_day_id = v_day` |
| the `enqueue_job('award_points', …, 'pts:check_in:' \|\| ci.id)` | **verbatim until contract 5 lands** (§5) |

★ **`check_ins.session_window` being the day's is load-bearing, not cosmetic.** The exclusion
constraint is `(member_id =, session_window &&)`. If the window stayed the session's, a member's three
check-ins across a three-day workshop would carry three *identical* ranges and the second one would
be refused `23P01` — the feature would not work at all. `0100` deriving it from the day is what makes
attending every day possible, and `REQ-CHK-013` «not in two rooms at once» then compares day windows,
which is what `DEC-119` asks for.

#### `ensure_check_in_code()` — live text `0084_check_in_window.sql`

`not_found` / `not_authorized` unchanged (authority is the **session's**: presenter of it, or staff —
there is no per-day role). The state family stays on the session. The floor/ceiling become `d.starts_at`
and `check_in_ceiling(d.id)`, and a null resolution raises `not_open` (today's answer for «outside the
window»). Ends `return public._issue_check_in_code(p_session, v_day)`. The switch still does **not**
gate issuance — the room may see what reopening would accept (`0084`'s own reasoning, unchanged).

#### `_issue_check_in_code()` — live text `0015_check_in_rpcs.sql`, never re-created since

- `select * into s from public.sessions where id = p_session for update` — **keep the session lock**.
  Two days of one session rotating concurrently is not a real scenario, and a session-level lock is
  the one that also serialises against a day write.
- `org_settings` read: unchanged (rotation and grace are org settings, not per day).
- «the most recently issued non-revoked code» gains `and session_day_id = v_day`.
- the insert gains `session_day_id => v_day`.
- the `unique (session_id, code)` collision retry is **unchanged** — uniqueness stays per session, so
  two days of one workshop can never share a code. Narrowing it to the day would make yesterday's
  code re-mintable today, which is a worse property than the retry loop costs.
- a null `v_day` raises `not_found` `P0002` (the same code path a missing session takes).

#### `rotate_check_in_code()` — live text `0015`

Body becomes `select public._issue_check_in_code(p_session, p_day)`. Still `language sql`, still
`service_role` only, still no identity check. §6 is the caller.

#### `revoke_check_in_code()` — live text `0015`

Role set unchanged (presenter of the session, or admin/moderator). The «current code» lookup gains
`and session_day_id = v_day`; `no_active_code` is now «no active code **for this day**», which at one
day is the same sentence. The audit row is unchanged, subject `check_in_code`, `cur.id`. The
replacement it issues is for the same day.

#### `mark_checked_in_manually()` — live text `0087`

Second re-creation (`0015` → `0086` → `0087`). Changes:

- `p_day` is **passed explicitly by SCR-044** — an admin corrects Tuesday's list on Thursday, so the
  screen always sends it. Null resolves by §1.3, which at one day is the one day.
- the per-role window (`0086`'s ruling) becomes the **day's**: admin → `now() >= d.starts_at`, no
  ceiling, `archived` still allowed, `cancelled` still refused; moderator → the session's state
  family plus `d.starts_at` … `check_in_ceiling(d.id)`.
- `member_not_found`, `presenter_cannot_check_in` unchanged (both session facts).
- the «already marked» read and the insert key on `session_day_id`.
- the `overlapping_session:%` conflict lookup uses the day's range.
- the audit row and the `award_points` enqueue are verbatim until contract 5.

★ Consequence worth naming: an admin marking a **future** day is refused `not_open`, because that
day's floor has not passed. That is today's behaviour applied to the meeting rather than the session,
and it is the right answer — you cannot record attendance at a meeting that has not happened.

#### `remove_check_in()` — live text `0087`

`assert_fresh_admin()`, the mandatory reason, the `for update`, the soft-delete columns and the audit
row are all unchanged. The target lookup becomes
`where session_day_id = v_day and member_id = p_member and org_id = admin.org_id and removed_at is null`.
`not_found` still covers «never checked in» **and** «already removed», now per day.

The three consequences (ledger reversal, certificate revocation, no-show symmetry) stay verbatim
until contract 5, then leave the function entirely (§5).

I considered a special rule for this one — «if `p_day` is null and the member has exactly one active
check-in, remove that» — and **rejected it**: it is identical at `n = 1`, so it buys nothing, and a
per-function resolution rule is the thing contract 4 exists to prevent.

#### `set_check_in_open()` — live text `0084`

- the role check, the state family and the audit row are unchanged.
- the ceiling guard becomes `if p_open and now() >= public.check_in_ceiling(v_day)`.
- the write moves to `update public.session_days set check_in_open = p_open where id = v_day`, still
  guarded by `is distinct from` so a no-op writes no audit row (`checkin-window.test.ts` asserts
  exactly two rows for a close-then-open).
- ★ **the returned row must be re-read.** `target` was `select … for update`-ed before the write; the
  session's shadow (§3) is updated by a trigger *after* it. Returning the stale variable would hand
  `checkin-window.test.ts:152` the old value. `select * into target from public.sessions where id = p_session`
  again, after the day write, is the whole fix and is easy to miss.

---

### 3 · The column I need, and how `sessions.check_in_open` keeps its meaning

#### The request to the lead

```sql
alter table public.session_days
  add column check_in_open boolean not null default true;
```

- type `boolean`, `not null`, **default `true`** — `DEC-116`: nobody opens check-in, it is already
  available.
- **backfill**: `0100` creates every day from its session, so the backfill is
  `check_in_open => sessions.check_in_open` at creation, not a second pass. A session whose switch is
  closed today keeps it closed on its one day. (Question 4 — it has to happen inside `0100`'s own
  backfill or the two disagree for one migration's width.)
- I write no `alter table`, here or anywhere.

#### The shadow, and why it is not a second switch

`sessions.check_in_open` becomes **a derived stored shadow of the day set**, exactly as
`sessions.starts_at`/`ends_at`/`venue_id` are under contract 1:

> `sessions.check_in_open = bool_or(d.check_in_open)` over the session's days — «attendance is still
> being taken **somewhere** in this session».

`bool_or`, not `bool_and`: a presenter closing day 1's door at 21:00 on Wednesday has not closed the
workshop, and a session-level reader must not be told they have. At `n = 1` `bool_or` of one value is
that value, so the shadow **is** the switch, with no special case.

Two triggers of mine keep the pair in step (behaviour is mine, the table is the lead's):

1. **`session_days` → `sessions`** (`after insert or update of check_in_open or delete on session_days`):
   recompute the shadow, `update … where check_in_open is distinct from <new value>`. The
   `is distinct from` is what stops the recursion with trigger 2 and what keeps `sessions_notify`
   firing exactly when it fires today.
2. **`sessions` → `session_days`** (`after update of check_in_open on sessions`,
   `when (old.check_in_open is distinct from new.check_in_open)`): carry the value onto **every** day,
   again `where check_in_open is distinct from`. This is the shim that makes the shadow true for
   writers that do not know days exist — `transition_session()` (§4), and every fixture or spec that
   does `update sessions set check_in_open = …` directly.

Carrying onto **all** days rather than «only while `n ≤ 1`» is deliberate and differs from the
foundation's window shim. The only real `n > 1` writer is `transition_session()`'s early-complete and
cancel, where «close every day» is exactly what completing or cancelling a workshop means. A
session-level write is a blunt instrument by construction, and it should be.

**No deferred commit check.** The window and venue get one because a drift there is a wrong *fact*
about a session; a drift in the shadow is cosmetic and self-heals on the next day write. If the lead
wants symmetry, it is three lines and I will add it.

#### What still reads the session-level flag, and why each is fine

| Reader | Owner | At `n = 1` | At `n > 1` |
|---|---|---|---|
| `main`'s deployed `dal/checkin.ts` and `dal/sessions.ts`, between push and merge | — | exact | **unreachable**: only the new app can create a second day, so every session in that window has one |
| `src/lib/dal/sessions.ts:666`, `components/browse/timeline-session.ts:56` → `canOfferCheckInFor()` | `sessions` | exact | the shadow is the fallback; the day's value arrives on `PhaseInput.days` (§8) |
| `tests/rls/checkin-window.test.ts`, `checkin-early-completion.test.ts` | mine | exact | no multi-day case in either |
| `getHostView()` / `getCheckInScreenData()` | mine | exact | re-pointed at the resolved day (§7) |

---

### 4 · The early-completion close (`0089`) — **a trigger of mine, and `sessions` changes nothing**

`transition_session()` (`0089`) and `clock_complete_sessions()` (`0022`) are `sessions`' functions.
Two tracks never re-create one function, so the answer is trigger 2 of §3, and it means:

- **`transition_session()` is not touched.** Its existing expression already writes
  `sessions.check_in_open = false` on early completion (`v_to = 'completed' and now() < ends_at`) and
  on cancel. Trigger 2 carries that onto every day. `sessions.ends_at` is the **last** day's end
  under contract 1, so «early» means «before the workshop was due to finish» — the right reading.
  `RPC-transition_session.check_in_open_early` / `_cancel` / `_reopenable` all keep their meaning, and
  `tests/rls/checkin-early-completion.test.ts` needs no edit.
- **`clock_complete_sessions()` is not touched.** It truncates `check_in_codes.valid_until` for
  sessions it moves to `completed`. Under contract 1 that happens after the **last** day's end, when
  every earlier day's codes are long dead, so truncating them all is a no-op. `0089`'s header already
  records that the truncation does nothing under the clock-only window; that is still true.

If the lead prefers an explicit seam, the alternative is a function of mine
(`public.close_check_in_for_session(p_session uuid)`) that `sessions` calls — one more call site in
someone else's function, for no behaviour the trigger does not already give. I recommend the trigger.

---

### 5 · Contract 5's call sites — before and after

**Before** (`scoring` not yet promoted) my proposed files carry `main`'s text verbatim:

| Function | What it does today, kept |
|---|---|
| `check_in()` | `perform public.enqueue_job('award_points', jsonb_build_object('rule','check_in','member_id',m.id,'source','check_in','source_id',ci.id,'session_id',s.id), 'pts:check_in:' \|\| ci.id)` |
| `mark_checked_in_manually()` | the identical enqueue (`0086`'s fix) |
| `remove_check_in()` | the `points_ledger` loop over `source in ('check_in','attendee_bonus')` writing `reversal:<ledger id>:v1`; the `revoke_certificate()` loop; the `no_show` award |

**After** the lead says `attendance_recorded()` / `attendance_removed()` are promoted, those blocks
are deleted and replaced by one line each:

```sql
perform public.attendance_recorded(ci.id);      -- check_in(), mark_checked_in_manually()
perform public.attendance_removed(target.id);   -- remove_check_in()
```

After the switch, **no check-in function names `points_ledger`, `award_points`, `enqueue_job`,
`certificates` or `revoke_certificate` at all.** That is the test I will write for it, and it is the
same shape as contract 10's guard.

★ **One boundary I need ruled, because `scoring` writes the function and I only call it** (question
6): does `attendance_removed(p_check_in)` subsume all three consequences, or only the ledger? My
reading is **all three** — the reversal, the `no_show` symmetry **and** `revoke_certificate()` —
because at `n > 1` whether a certificate should be revoked is «is
`session_attendance_complete()` still true», which is contract 6's predicate and nobody else's to
evaluate. Removing day 2 of a three-day workshop must revoke; removing a day from a session with
`require_all_days = false` may not. That judgement cannot live in my function.

★ **Ordering hazard, stated:** between `0100` landing and contract 5 switching, a multi-day
session's `check_in()` would enqueue an attendance award **at the first day's check-in**, against
`REQ-SES-017`. That is why contract 5's order is `scoring` first. **I will not ship a day-aware
`check_in()` to the demonstrable before `attendance_recorded()` exists**, and if the sequence slips,
the honest interim is that multi-day sessions are not yet awardable — not a guess of mine in SQL
`scoring` owns.

`0088`'s six removed-check-in hooks (`award_points`, `fan_out_certificates`, `issue_certificate`,
`send_rating_prompt`, `evaluate_streaks`, `evaluate_badges`, `build_data_export_payload`) are
**other tracks' functions**. They filter `removed_at is null` and none of them keys on a day. Their
day-awareness is contract 6's, and `tests/rls/checkin-late-job-hooks.test.ts` is evidence I do not
edit.

---

### 6 · `rotate_codes` — not through the nights of a three-day workshop

`worker/src/tasks/rotate_codes.ts` today:

```sql
select id from public.sessions where state = 'in_progress'
```

A three-day workshop is `in_progress` from day 1's start to day 3's end (contract 1's stored shadow),
so this mints a fresh code every rotation through two nights. The task becomes day-shaped:

```sql
select d.id as day_id, d.session_id
  from public.session_days d
  join public.sessions s on s.id = d.session_id
 where s.state = 'in_progress'
   and now() >= d.starts_at
   and now() <  public.check_in_ceiling(d.id)
```

then `select public.rotate_check_in_code($1, $2)` per row. The log line keeps its shape and counts
days.

★ **A named behaviour difference at `n = 1`, flagged not hidden.** Today a session left `in_progress`
past its end — a lagging or stopped clock job — keeps minting codes forever, because
`_issue_check_in_code()` has no window gate of its own (only `ensure_check_in_code()` does). With the
window filter it stops at the ceiling. That is a **fix**, it serves `REQ-CHK-016`'s «absolutely», and
it is the only difference I can find in this file at one day. I have checked the suites: nothing
asserts it. `tests/rls/checkin.test.ts:150` and `tests/rls/award-points.test.ts:161,196` call
`rotate_check_in_code()` the **RPC** directly on live sessions and are unaffected; there is no test of
the task's query. Recorded here so the lead can rule it back if they disagree.

`worker/src/tasks/promote_waitlist.ts` needs **no change**: `rsvps` and `capacity` stay on the
session (`DEC-120`), one registration covers every day.

---

### 7 · The three screens, at three days and at one

**The one pattern, used on all three:** the DTO carries `dayLabel: string | null` and, where a list is
involved, `days: […]`. **`dayLabel` is null when the session has one day**, and every piece of
day-shaped copy keys off `dayLabel` being non-null — never off a count, never off an `isMultiDay`
flag. That is contract 7's «renders flat at `n ≤ 1`» applied to my screens, and it makes «at one day
it renders as it does today» a property of the data rather than of a branch someone has to remember.
The label itself is `sessions`' formatter (contract 7) — «اليوم الثاني · الخميس» — read through
`getTranslations("sessions")`, never re-implemented.

#### SCR-016, the host view

- `getHostView()` resolves the day with `checkInDay(days, now)` (contract 9) and returns
  `dayLabel`, plus `code`, `validFrom`, `validUntil`, `checkInOpen` and `checkInCount` **for that
  day**.
- **No day switcher.** The host needs the code for the room they are standing in; the floor forbids
  opening tomorrow's door and the ceiling forbids reopening yesterday's. Between two days, the screen
  names the **next** day and shows no code — the same «not started» panel it shows today, with the
  day named.
- `listUncheckedConfirmedRsvps()` becomes «confirmed, with no active check-in **for this day**».
- At one day: `dayLabel` is null, nothing renders, the DOM is today's.
- Captures: `wave9-checkin-host-day2-open.png`, `…-day2-closed.png`, and
  `wave9-checkin-host-one-day.png` beside `wave7-checkin-host-open.png`.

#### SCR-014, the check-in screen

- `getCheckInScreenData()` returns `dayLabel` for the resolved day and computes
  `ineligibleReason` against that day.
- The member is never asked which day — §1.3 step 2 means the code answers it. The screen **says**
  which day it is about to record, which is the honest half of not asking.
- The refusal after a day's ceiling while day 3 is still ahead keeps the envelope status
  `session_ended` (contract 4) and renders a **different string** when `dayLabel` is non-null:
  «انتهى وقت تسجيل الحضور لليوم الثاني» rather than «انتهت الجلسة». Two keys
  (`checkin.error.session_ended`, `checkin.error.session_ended_day`), selected on `dayLabel`, both in
  `ar/` first. Same for `not_started` and `check_in_closed`.
- At one day: `dayLabel` null, today's three strings, today's DOM.
- Captures: `wave9-checkin-check-in-day2.png`, `wave9-checkin-check-in-day2-ended.png`,
  `wave9-checkin-check-in-one-day.png`.

#### SCR-044, the admin attendance screen — attendance **across** days

This is the screen `REQ-SES-017` reads, and the only one whose shape really changes.

- `AttendanceReport` gains `days: { id, label, startsAt }[]` (always, length 1 at one day) and
  `AttendanceRow.days: { dayId, checkedIn, arrivedAt, method, removed, removedAt, removalReason,
  removedByName }[]` — one entry per day, in `position` order. `checkInByMember` becomes keyed
  `(member, day)`; the active-row-wins / most-recently-removed-wins rule is unchanged, applied per
  cell.
- **At one day the component renders the single entry inline**, with no day header and no extra
  column — today's table, today's `admin-attendance.spec.ts` selectors.
- At more than one day: a per-day column, so «who attended which» is readable in one look at 390 px.
  A three-column table at 390 px is the layout risk; the phone shape is one card per member with a
  row of day chips, the desktop shape a table. No new primitive — `ui/card`, `ui/badge`, `ui/panel`.
- The manual mark form and the removal form each carry a `dayId` (hidden at one day, chosen at more).
  `remove_check_in()` is per day, so the confirm names the day.
- The five summary counts keep today's definitions widened to «an active check-in on **any** day»,
  which is identical at one day. I propose **one extra stat, «أكمل كل الأيام»,
  rendered only when `days.length > 1`**, reading contract 6's `session_attendance_complete()` — a
  read of `scoring`'s function, not a re-derivation (question 7).
- Captures: `wave9-checkin-attendance-3days.png`, `…-manual-mark-day.png`,
  `…-remove-confirm-day.png`, `wave9-checkin-attendance-one-day.png`.

---

### 8 · The matrix and `session-status.ts`

`checkInIneligibleReason()` and `checkInWindowAllowed()` (`src/components/checkin/session-matrix.ts`,
mine) key on **the day**, through contract 9's `checkInDay(days, now)`:

- `session.state` (the family, cancelled, archived) and `viewer.isPresenter` stay session-level.
- the floor, the ceiling and the switch come from the resolved day; the ceiling applies the §1.6 cap
  from the **next** day in the same array, so the cap lives in exactly two places — one SQL function
  and one TS function — and nowhere else.
- when `session.days` is absent or empty the functions fall back to `session.startsAt` / `endsAt` and
  the `checkInOpen` parameter, so **every existing caller compiles and behaves unchanged**.
- **`canOfferCheckInFor(session, viewer, allowWalkIns, checkInOpen, now)` keeps its exact five-argument
  shape** (`src/lib/dal/checkin.ts`). `sessions` adds `days` to the `PhaseInput` it already builds and
  changes no call site. That is contract 4's «the event page's link is unchanged in shape», delivered
  literally.
- **The 42-cell matrix does not change.** `AFFORDANCE_MATRIX` is keyed on phase × relation, and
  contract 9 adds no phase — between two days a session is `open`. `tests/unit/session-matrix.test.ts`
  keeps every assertion.

**Request to the lead (contract 9's type):** `DayWindow` needs to carry `id` and **`checkInOpen`**
alongside `startsAt` / `endsAt`. The matrix must answer «is *this* day's door open» from the same
array it resolved the day out of; passing the switches beside the windows as a second structure is
the version that goes stale. Question 5.

---

### 9 · `REQ-TSK-002` — confirmed

Nothing on this track reads a task table. Grepped, not remembered:

```
src/lib/dal/{checkin,rsvp}.ts · src/components/checkin/** ·
src/app/[locale]/app/sessions/[id]/{check-in,host}/** ·
src/app/[locale]/app/admin/sessions/[id]/attendance/** ·
worker/src/tasks/{rotate_codes,promote_waitlist}.ts
→ zero occurrences of session_tasks, task_completions, task_form_responses
```

The one thing that reads like a counterexample and is not: `AffordanceCell.tasks` in
`session-matrix.ts` is a **boolean affordance flag** in a 42-cell table — «may this viewer be offered
the tasks section» — it names no table and reads no row. It will still be there after this wave, and
contract 10's guard (which tests for the three table names) passes over it. Nothing I add changes
that: the day resolution reads `session_days`, `check_in_codes`, `check_ins`, `check_in_attempts`,
`sessions` and `rsvps`, and no other table.

---

### 10 · The untouched-suite ledger — what covers what, and what I change

**Rule 4 answer: I plan to change none of these.** Every one is evidence for the one-day
demonstrable, and each existing case must pass with its assertions untouched.

| Existing file | Owner | Covers |
|---|---|---|
| `tests/rls/checkin.test.ts` | mine | `_issue` / `ensure` / `rotate` / `revoke`; `check_in()`'s rate limit, single use, overlap, presenter; the three table policies |
| `tests/rls/checkin-window.test.ts` | mine | `RPC-check_in.floor/.ceiling/.switch_closed/.attendance_states`; `ensure_check_in_code.floor_ceiling`; `set_check_in_open.role_set/.ceiling/.audited` |
| `tests/rls/checkin-manual-mark.test.ts` | mine | `mark_checked_in_manually.window`, `.award_points` |
| `tests/rls/checkin-removal.test.ts` | mine | the eight `remove_check_in` rows + `has_checked_in.excludes_removed` + `ratings.write_self_excludes_removed` |
| `tests/rls/checkin-early-completion.test.ts` | mine | `transition_session`'s three `check_in_open` rows (§4 — untouched by construction) |
| `tests/rls/checkin-walk-ins-publishing.test.ts` | mine | `schedule_session()`'s `p_allow_walk_ins` |
| `tests/rls/{rsvp,priority-rsvp}.test.ts` | mine | reservations, the waitlist |
| `tests/rls/checkin-late-job-hooks.test.ts` | mine | `0088`'s six cross-track removed-check-in hooks |
| `tests/rls/award-points.test.ts` | `scoring` | calls `rotate_check_in_code()` + `check_in()` — **a two-argument `check_in($1,$2)` call still resolves** against the defaulted third |
| `tests/rls/{m2-schema,isolation,tenancy}.test.ts` | lead | the tables, the sweep |
| `tests/unit/session-matrix.test.ts` | mine | the 42 cells + the grace-window predicates |
| `tests/unit/{checkin,sessions,admin}-removed-check-in.test.ts` | mine / `sessions` / lead | removed rows across the readers |
| `tests/components/checkin/{attendance-outcome,remove-check-in-form,rsvp-panel}.test.tsx` | mine | the three components |
| `tests/e2e/{checkin,checkin-gating,admin-attendance}.spec.ts` | mine | the three screens end to end, wave 7's captures |

**New files only**, per rule 4: `tests/rls/checkin-days.test.ts`, `tests/unit/checkin-days.test.ts`,
`tests/components/checkin/attendance-days.test.tsx`, `tests/e2e/wave9-checkin-days.spec.ts`,
`tests/e2e/wave9-checkin-one-day.spec.ts` (the side-by-side capture).

★ **Two ownership overlaps `DEC-150` creates, for the lead to cut** (question 8): the schedule form
moved to `sessions` this wave, but `tests/components/checkin/schedule-form.test.tsx` and
`tests/e2e/checkin-schedule-walk-ins.spec.ts` both sit in paths my edit list still claims and both
test *that form*. I will not touch either; if `sessions`' rebuild breaks them, the failing assertion
goes in my note and the lead routes it. I would rather they move to `sessions` with the screen.

---

### 11 · Requests to other owners

| To | What | Why |
|---|---|---|
| lead | `session_days.check_in_open boolean not null default true`, backfilled from `sessions.check_in_open` inside `0100` | §3 — I write no `alter table` |
| lead | `public.resolve_session_day(p_session uuid, p_at timestamptz default now()) returns uuid` defined **in `0100`** and called by its own `before insert` trigger | §1.3 — one rule, one implementation, or the trigger and the RPCs drift silently |
| lead | `DayWindow` in `src/lib/session-status.ts` carries `id` and `checkInOpen` | §8 |
| lead | confirm `checkInDay(days, now)`'s tie-break is **later-started**, matching `0100` | §1.3 |
| `sessions` | `PhaseInput.days` populated on the event page and the browse card, including each day's `check_in_open`, so `canOfferCheckInFor()` keeps its five-argument shape | §8 |
| `sessions` | the day-label formatter of contract 7, read by all three of my screens | §7 |
| `scoring` | `attendance_recorded(p_check_in)` / `attendance_removed(p_check_in)` with `main`'s exact behaviour, promoted before I switch | §5 |
| `scoring` | `session_attendance_complete(p_session, p_member)` readable from SCR-044 | §7 |

**No `ui/` primitive request.** SCR-044's day view is `ui/card`, `ui/badge` and `ui/panel` — all
`content`'s, all already carrying what I need. I do **not** need `ui/tabs` or `ui/menu`: the host view
has no switcher (§7) and the attendance screen shows every day at once rather than one at a time. If
the 390 px review says otherwise I will write the request rather than reach for the file.

---

### 12 · Questions for the lead, numbered

1. **`resolve_session_day()` in `0100`, called by me?** Or does `0100`'s trigger keep inline SQL and I
   mirror it? I want one function; mirroring is a drift waiting to happen, and §1.4's test can only
   prove agreement, not enforce it.
2. **Who owns `check_ins.session_window`'s derivation after `0100`?** If `0100` re-creates
   `check_ins_window()` to read the day (and fills `session_day_id` in the same `before insert`
   trigger), my inserts should set `session_day_id` and leave the window alone. Confirm the trigger's
   name is unchanged so I do not propose a second one.
3. **Is a day's ceiling capped by the next day's start?** My recommendation is **yes**, as
   `least(ends_at + 2 h, next.starts_at)` in one SQL function and one TS function (§1.6). Inert at
   `n = 1`. Your ruling also settles whether the cap goes inside `resolve_session_day()`.
4. **Does `session_days.check_in_open` get its value inside `0100`'s day creation**, rather than as a
   separate backfill? Otherwise a closed session's one day is born open for the width of a migration.
5. **`DayWindow` carries `checkInOpen`?** (§8.) If contract 9 wants `DayWindow` to be purely a window,
   tell me the shape you prefer and I will read the switches from whatever `sessions` publishes.
6. **What does `attendance_removed()` subsume?** My reading: the ledger reversal, the `no_show`
   symmetry **and** `revoke_certificate()`, because only contract 6's predicate can say whether a
   certificate should survive losing one day (§5). `scoring` needs the same answer.
7. **SCR-044's summary counts at `n > 1`:** five counts widened to «any day» plus one extra
   «أكمل كل الأيام» stat, or should `attendanceRate` itself become completeness? I recommend the
   former — it keeps the one-day DOM byte-identical.
8. **`tests/components/checkin/schedule-form.test.tsx` and `tests/e2e/checkin-schedule-walk-ins.spec.ts`**
   test a form that is `sessions`' this wave but live in paths my list claims. Move them, or leave
   them with me as evidence I do not touch? (§10.)
9. **`rotate_codes`' named difference at `n = 1`** — a stale `in_progress` session past its ceiling
   stops minting codes (§6). I read that as a fix serving `REQ-CHK-016`; confirm, or tell me to keep
   minting.
10. **Sequencing.** Contract 5 says `scoring` publishes first. If `attendance_recorded()` is not
    promoted by the time the day-aware `check_in()` is ready, do I hold the switch and ship the
    verbatim enqueue (multi-day awards at first check-in, against `REQ-SES-017`), or hold the whole
    file? I recommend holding the switch **and** not putting a multi-day session through the
    demonstrable until the two functions exist.

---

## C1 built — the day's check-in, against `0100` + `0101` (sync 1 applied)

`supabase/proposed/checkin/01_check_in_open_shadow.sql` and `02_check_in_day.sql`, proven by
`tests/rls/checkin-days.test.ts` — **20 cases, green**; the full RLS suite **920 passed** with every
pre-existing check-in file untouched and green.

### ★ A live security finding, fixed in `02` and reported to the lead

**`public._issue_check_in_code(uuid)` has no `revoke`, so it is `execute` to `PUBLIC` — on
production, today.** `0015`'s own comment says «No grants: only called from the two public wrappers»;
a function's *default* is the grant it forgot. Measured on the local database, which is `main`'s
schema plus `0100`/`0101`:

```
proname               | acl
_issue_check_in_code  | NULL = default: EXECUTE to PUBLIC
ensure_check_in_code  | {postgres=X/postgres,authenticated=X/postgres}
resolve_session_day   | {postgres=X/postgres}
check_in_ceiling      | {postgres=X/postgres,service_role=X/postgres}

has_function_privilege('authenticated', 'public._issue_check_in_code(uuid)', 'execute') → true
has_function_privilege('anon',          'public._issue_check_in_code(uuid)', 'execute') → true
```

It is `security definer`, `public` is an exposed PostgREST schema (`supabase/config.toml` `[api]`),
and it takes a bare session id — so `POST /rest/v1/rpc/_issue_check_in_code` mints and **returns the
live six-character code** for any session id the caller knows, bypassing `ensure_check_in_code()`'s
`REQ-CHK-014` check («a member never reads the live code», `03` §5.4a). Session ids are not secret:
`/s/[id]` is the public card. With `allow_walk_ins` on, that is attendance — and attendance is points
and a certificate.

`02` revokes it from `public`, `anon`, `authenticated` **and** `service_role` in the same file that
re-creates it, and `RPC-_issue_check_in_code.not_callable` asserts `42501` for a member, a moderator,
an admin and the worker. Every legitimate caller is a definer function running as the owner.
**Reported to the lead rather than only fixed here**: it is live on production now, and the owner's
push-before-merge window is the lead's to sequence.

### One design point the tests forced — the code names its day, *while that day is running*

My plan said `check_in()` resolves a null day from the code, full stop. The first run of
`RPC-check_in.day_from_code` said otherwise, and the case is real rather than contrived:

> A code minted a minute before day N's capped ceiling stays inside `valid_until` for a rotation
> window **after day N+1 has begun**. Unconstrained, a member standing in day N+1's room who types
> that leftover code is told **`session_ended`** — wrong, because the session has not ended, and a
> disclosure `REQ-CHK-004` forbids, because only a *real* code could produce that answer.

So step 2 carries a second condition — the code's day must be the day taking attendance
(`now() >= d.starts_at and now() < check_in_ceiling(d.id)`) — and the honest answer becomes
`invalid_code`: the code is not valid now. Under `DEC-151`'s cap at most one day holds an instant,
so the shortcut provably agrees with the resolver; it is kept because the requirement says the code
names the day, and because it is what keeps `check_in()` correct if the cap is ever lifted. Two
cases pin it: a leftover live code of a past day, and a code of a day not yet begun.

### Applied from sync 1 (`DEC-151`), point by point

| Ruling | Where it landed |
|---|---|
| the shadow defect — reopening one day must not open every day | `01`, and `POL-check_in_open.reopening_one_day_opens_only_that_day` asserts `[false, true, false]` |
| the mark is `kareem.check_in_shadow`, set and **reset one statement later**, never `pg_trigger_depth()` | `session_days_check_in_open_shadow()` |
| `check_in_ceiling()` is the lead's, called never copied | every gate in `02`, and `rotate_codes` next |
| `resolve_session_day()` returns the **first** day when nothing has begun | the gates still answer `not_started` from `now() < d.starts_at`; asserted |
| the attempt limit is **per day** | `session_day_id is not distinct from v_day` on both the count and the `succeeded` update; `RPC-check_in.rate_limit_per_day` shows 11 rows on day 1 and 1 on day 2 |
| contract 5's three hooks are not switched yet | every points, certificate and no-show line in `02` is `main`'s verbatim, each marked; `checkin/03` switches all three at once |
| `check_ins.session_window` is `0100`'s to derive | the inserts pass `session_day_id` and **never** `session_window` |

### For the lead, at promotion

1. **`tests/unit/admin-audit-labels.test.ts` needs `kareem.check_in_shadow`** in its `NOT_ACTIONS`
   set, beside `kareem.days_writer` — a custom Postgres setting must contain a dot, so the literal
   scan reads it as an audit action. That file is the lead's.
2. **The one-day proof can only be run at promotion.** The five existing check-in files call the RPCs
   through the *migrations*, and `applyProposed()` lives inside one rolled-back transaction, so they
   cannot exercise these two beforehand. The strongest approximation is in my file — «a one-day
   session, end to end, on the day-aware functions» walks issue → check in → repeat → rate limit →
   manual mark → removal and asserts the reversal key shape.
3. **Two things in the shared tree that are not mine**, so they are not silently repaired: 27 `tsc`
   errors, all in `tests/components/{materials,photos,tasks}/**` where a `sessionDayId` became
   required on three DTOs; and `tests/rls/materials-days.test.ts` fails on
   `session_days_no_overlap` from its own test data. Both are `content`'s, mid-change.
