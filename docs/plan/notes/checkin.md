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
