// The 49-cell affordance matrix — `16` §5.3, REQ-UIX-015, DEC-090, DEC-101.
//
// ★★ THIS IS DATA. Every component that decides "may I offer this action"
// reads a cell here instead of re-deriving its own condition from `state`,
// `starts_at` or a raw RSVP row. `docs/plan/notes/checkin.md` §"Wave 5"
// records two departures from `16`'s printed table, worth restating here
// because a reader of just this file needs them too:
//
//   · SIX phases, not seven — `session-status.ts`'s `SessionPhase` union has
//     six members (`16`'s "7 × 7 = 49" predates DEC-105's collapse). This
//     table is 6 × 7 = 42 cells, every one tested in
//     `tests/unit/session-matrix.test.ts`.
//   · NINE affordance columns, not eight — `hostConsole` is added because
//     `session-status.ts`'s own `GRANTING_AFFORDANCES` already names it and
//     the host screen needs a real answer, not an inline condition.
//
// `checkIn` is `boolean | "walkInsOnly"` because DEC-065's walk-in switch is
// a THIRD input the (phase, relation) pair alone can't encode. ★ DEC-141:
// this column is now DISPLAY-ONLY — the actual gate is `checkInWindowAllowed()`
// / `checkInIneligibleReason()` below, self-contained and never routed
// through this matrix (see their own header for why).
//
// ★ RLS and the RPCs remain authoritative (REQ-NFR-001). A cell here is a
// courtesy; the database refuses the write regardless.

import type { DayWindow, PhaseInput, SessionPhase, SessionState, ViewerInput, ViewerRelation } from "@/lib/session-status";
import { canGrantOn, checkInDay, parseInstant, resolveDay, scheduledEnd, sessionPhase } from "@/lib/session-status";

/** «قبل» · «أثناء» · «بعد» · مواد الجلسة الخاصة بمقدِّم أو مشرف قبل النشر. */
export type MaterialsWindow = "none" | "pre" | "during" | "after" | "own";

export interface AffordanceCell {
  rsvp: boolean;
  cancel: boolean;
  calendar: boolean;
  tasks: boolean;
  /** ★ DEC-141: DISPLAY-ONLY since the grace-window fix. `checkInWindowAllowed()`
   *  below is the source of truth for whether check-in may actually be
   *  offered — it does not consult this cell, because the check-in window
   *  (`ends_at + 2h`) now outlives the phase this cell is keyed on. Kept for
   *  cells where phase-bucketing is still a reasonable summary (e.g. `open`'s
   *  rows, unaffected by the grace period) and for `16` §5.3's own printed
   *  column. */
  checkIn: boolean | "walkInsOnly";
  hostConsole: boolean;
  rate: boolean;
  /** The `ended` read-only fact — «حضرت» / «لم تُسجّل حضورك» — `attendance-outcome.tsx`. */
  attendanceOutcome: boolean;
  share: boolean;
  materials: MaterialsWindow;
}

const NOTHING: AffordanceCell = {
  rsvp: false,
  cancel: false,
  calendar: false,
  tasks: false,
  checkIn: false,
  hostConsole: false,
  rate: false,
  attendanceOutcome: false,
  share: false,
  materials: "none",
};

const cell = (over: Partial<AffordanceCell>): AffordanceCell => ({ ...NOTHING, ...over });

/**
 * `16` §5.3, cell by cell. Relations `attended`/`absent` are structurally
 * unreachable outside `ended` (`viewerRelation()`'s own contract only
 * returns them there), and `confirmed`/`waitlisted` are unreachable INSIDE
 * `ended` for the same reason (they resolve to `attended`/`absent` instead).
 * Those cells stay `NOTHING` — a total table, not a partial one, same
 * reasoning as `sessionPhase()`'s own unreachable rows (DEC-105).
 */
export const AFFORDANCE_MATRIX: Record<SessionPhase, Record<ViewerRelation, AffordanceCell>> = {
  // `sessions_read` makes a draft invisible to anyone but its own staff and
  // presenters — the `none`/`confirmed`/… rows below are unreachable in
  // practice, kept `NOTHING` for totality rather than omitted.
  draft: {
    none: NOTHING,
    confirmed: NOTHING,
    waitlisted: NOTHING,
    attended: NOTHING,
    absent: NOTHING,
    presenter: cell({ materials: "own" }),
    staff: cell({ materials: "own" }),
  },
  pending_schedule: {
    none: NOTHING,
    confirmed: NOTHING,
    waitlisted: NOTHING,
    attended: NOTHING,
    absent: NOTHING,
    presenter: cell({ materials: "own" }),
    staff: cell({ materials: "own" }),
  },
  open: {
    // §5.3 row 1. ★★ calendar/tasks withheld — no seat yet (DEC-090's asks 1–3).
    none: cell({ rsvp: true, share: true, materials: "pre" }),
    // §5.3 row 2. ★ cancel does NOT stop at the cutoff — `rsvp-panel.tsx`'s
    // own `cutoffPassed` branch decides the late-cancel wording; this cell
    // says only whether the affordance exists at all, which it does either
    // side of the cutoff, right up to `open` itself ending.
    confirmed: cell({ cancel: true, calendar: true, tasks: true, share: true, materials: "pre" }),
    // §5.3 row 3. ★★ calendar withheld — a waitlist place is not a seat.
    waitlisted: cell({ cancel: true, tasks: true, share: true, materials: "pre" }),
    attended: NOTHING,
    absent: NOTHING,
    // Not printed in `16`'s table. Commitment-before-convenience doesn't
    // apply to a presenter — they didn't reserve, they were assigned — but
    // they still need the pre-flight host console and their own prep tasks.
    presenter: cell({ tasks: true, hostConsole: true, share: true, materials: "pre" }),
    staff: cell({ tasks: true, hostConsole: true, share: true, materials: "pre" }),
  },
  live: {
    // §5.3 row 4 — «only if walk-ins are on» (DEC-065). This column is
    // display-only since DEC-141; `checkInWindowAllowed()` resolves it for real.
    none: cell({ checkIn: "walkInsOnly", share: true, materials: "during" }),
    // §5.3 row 5. Cancel is GONE once live — you can't back out of a seat
    // once the session has started. This is bug (a)'s other half.
    confirmed: cell({ calendar: true, tasks: true, checkIn: true, share: true, materials: "during" }),
    // Not printed. A waitlist place that was never promoted before the
    // session started stays exactly what it was — no seat, no prep
    // materials commitment, and (like `none`) checked in only through the
    // walk-in door if it's open.
    waitlisted: cell({ checkIn: "walkInsOnly", share: true, materials: "during" }),
    attended: NOTHING,
    absent: NOTHING,
    // §5.3 row 6, verbatim: check-in is «— (REQ-CHK-011)» — a presenter can
    // never check in to their own session.
    presenter: cell({ calendar: true, tasks: true, hostConsole: true, share: true, materials: "during" }),
    staff: cell({ tasks: true, checkIn: "walkInsOnly", hostConsole: true, share: true, materials: "during" }),
  },
  ended: {
    none: cell({ share: true, materials: "after" }),
    confirmed: NOTHING,
    waitlisted: NOTHING,
    // §5.3 row 7. ★ ask 4's first starred cell: no cancel, a read-only fact
    // instead (`attendance-outcome.tsx`), and rating opens in its window.
    attended: cell({ rate: true, attendanceOutcome: true, share: true, materials: "after" }),
    // §5.3 row 8. ★ ask 4's second starred cell: no cancel, the read-only
    // fact says so, and there is nothing to rate.
    absent: cell({ attendanceOutcome: true, share: true, materials: "after" }),
    // No operational host console once ended (REQ-CHK-004: no code exists
    // outside the live window) — `host/page.tsx` shows the "ended" state
    // instead. Manual attendance correction after the fact is SCR-044's
    // (`console`'s), not this screen's.
    presenter: cell({ share: true, materials: "after" }),
    staff: cell({ share: true, materials: "after" }),
  },
  // §5.3 row 9, verbatim: «any» relation, nothing at all.
  cancelled: {
    none: NOTHING,
    confirmed: NOTHING,
    waitlisted: NOTHING,
    attended: NOTHING,
    absent: NOTHING,
    presenter: NOTHING,
    staff: NOTHING,
  },
};

export function affordancesFor(phase: SessionPhase, relation: ViewerRelation): AffordanceCell {
  return AFFORDANCE_MATRIX[phase][relation];
}

/**
 * Reference for `event`'s track (M10+) — not consumed by any component this
 * wave. Built and tested because the matrix is the WHOLE 49-cell table, not
 * just checkin's own three columns (`16` §5.4.1 row 5, DEC-090 corollary 2).
 */
export function rateAllowed(session: PhaseInput, relation: ViewerRelation, now: Date = new Date()): boolean {
  return affordancesFor(sessionPhase(session, now), relation).rate && canGrantOn(session, "rate", now);
}

// ── ★ DEC-141 — the grace-window fix ────────────────────────────────────────
//
// A phase-bucketed check (ask `sessionPhase()` which phase we're in, read a
// matrix cell for it) is correct only as long as the check-in window matches
// the phase boundary it was built from — but `REQ-CHK-016`'s ceiling
// (`ends_at + 2h`) OUTLIVES `sessionPhase()`'s own clock clause, which still
// calls a session "ended" the instant `ends_at` passes (it has no reason to
// know about the grace period; it was never about check-in specifically).
// Two consequences, found while designing `DEC-141`'s window ruling, not
// assumed:
//
//   1. A phase-bucketed check would refuse a check-in the RPC accepts,
//      during the grace window — `viewerRelation()` never even returns
//      `"confirmed"`/`"waitlisted"` once phase is `"ended"` (its own
//      contract), so the phase-bucketed `AFFORDANCE_MATRIX` row has nowhere
//      to grant it from.
//   2. The mirror bug: a confirmed, not-yet-checked-in member reads as
//      `"absent"` once phase is `"ended"`, so `attendance-outcome.tsx` would
//      say «لم تُسجّل حضورك» before the ceiling has even passed — declaring an
//      outcome that isn't final yet.
//
// `checkInIneligibleReason()` and `checkInWindowAllowed()` below fix both by
// NEVER going through `sessionPhase()`, `viewerRelation()` or the matrix at
// all — they mirror `check_in()` and `ensure_check_in_code()`'s own gate
// directly: the three-state family, the floor, the ceiling, the switch, the
// walk-in door. The old phase-bucketed `checkInAllowed()` is gone — its last
// caller (`dal/checkin.ts`'s `getCheckInScreenData()`) moved over once
// `checkInOpen` was threaded through the DTO that needed it.

/** DEC-141 ruling 1 — only these three states carry attendance meaning; a
 *  clock-only window would otherwise accept a code on a cancelled session
 *  whose scheduled start has passed. */
export const CHECK_IN_ATTENDANCE_STATES: readonly SessionState[] = ["published", "in_progress", "completed"] as const;

const TWO_HOURS_MS = 2 * 60 * 60_000;

/**
 * The day a check-in on this session is about, right now — `resolve_session_day()`'s
 * three rules through contract 9's `resolveDay()`: the day taking attendance;
 * else the latest day already begun; else the first. Null exactly when the
 * caller passed no days, which is what a pre-wave-9 caller and a session with
 * no schedule both look like.
 *
 * ★ This is what the three screens name — «اليوم الثاني» — and what
 * `checkInIneligibleReason()` judges, so the screen's label and its refusal can
 * never be about different days. The cap lives in `session-status.ts` alone
 * (`checkInCeiling()`, the twin of `public.check_in_ceiling()`); nothing here
 * recomputes it.
 */
export function checkInDayFor(session: PhaseInput, now: Date = new Date()): DayWindow | null {
  return resolveDay(session.days, now);
}

/** Every reason the check-in screen or link can be refused — mirrors
 *  `check_in()`'s own envelope statuses one-for-one, plus the two states
 *  (`not_published`, `cancelled`) that mean there's no code to fail on yet. */
export type CheckInIneligibleReason = "not_published" | "cancelled" | "not_started" | "session_ended" | "presenter_cannot_check_in" | "reservation_required" | "check_in_closed";

/**
 * Self-contained — the courtesy twin of `check_in()`/`ensure_check_in_code()`
 * (`supabase/migrations/0084_check_in_window.sql`). RLS remains authoritative
 * (`REQ-NFR-001`); this decides only what the screen offers, and WHY not when
 * it doesn't — `null` means eligible.
 *
 * `viewer` carries the RAW facts (`isPresenter`, `rsvpStatus`, `isStaff`),
 * never a pre-derived `ViewerRelation` — that's the whole fix (see the header
 * above). `viewer.checkedIn` is accepted (reusing `session-status.ts`'s
 * `ViewerInput` shape as-is) but not consulted: whether to keep OFFERING the
 * check-in link to someone already checked in is `check_in()`'s own
 * `already_checked_in` no-op to answer, not this predicate's.
 */
export function checkInIneligibleReason(session: PhaseInput, viewer: ViewerInput, allowWalkIns: boolean, checkInOpen: boolean, now: Date = new Date()): CheckInIneligibleReason | null {
  if (viewer.isPresenter) return "presenter_cannot_check_in"; // REQ-CHK-011, absolute — no walk-in exception either.
  if (session.state === "cancelled") return "cancelled";
  if (!CHECK_IN_ATTENDANCE_STATES.includes(session.state)) {
    // draft / submitted / in_review / changes_requested / approved (no code
    // has ever existed) read the same as "archived" (the code existed once,
    // long past its ceiling) — both say the same true thing to a member:
    // there is nothing to check in to right now.
    return session.state === "archived" ? "session_ended" : "not_published";
  }

  // ── the window: the DAY's, when the caller passed days ──────────────────
  //
  // ★ Not a branch on `n`. `checkInDayFor()` returns null only when the caller
  // passed no days at all — every caller that existed before wave 9 — and that
  // caller is asking about a session whose own window IS its one day's. With
  // days, one day and three take the identical path.
  const day = checkInDayFor(session, now);
  if (day) {
    // `checkInDay()` applies the capped ceiling itself (DEC-151), so a day it
    // returns is one this instant is inside — floor and ceiling both cleared,
    // with no second copy of the cap anywhere.
    if (!checkInDay(session.days, now)) {
      // No day is taking attendance. `day` is then `resolve_session_day()`'s
      // own fallback — the latest day begun, else the first — exactly what
      // `check_in()` gates on, so the two answer alike: before it, the floor;
      // otherwise its ceiling has passed.
      const dayStart = parseInstant(day.startsAt);
      return dayStart && now.getTime() < dayStart.getTime() ? "not_started" : "session_ended";
    }
    // The day's own switch (DEC-116 per day). A caller that did not read it
    // falls back to `sessions.check_in_open`, which is the `bool_or` shadow of
    // the days and is exactly the day's value at one day (DEC-150 contract 2).
    if (!(day.checkInOpen ?? checkInOpen)) return "check_in_closed";
  } else {
    const start = parseInstant(session.startsAt);
    const end = scheduledEnd(session, start);
    if (!start || !end) return "not_published"; // defensive; unreachable for these three states (0010's check constraint).
    if (now.getTime() < start.getTime()) return "not_started"; // the floor.
    if (now.getTime() >= end.getTime() + TWO_HOURS_MS) return "session_ended"; // the ceiling, REQ-CHK-016.
    if (!checkInOpen) return "check_in_closed"; // the switch, REQ-CHK-015.
  }

  if (viewer.rsvpStatus === "confirmed") return null; // always eligible, once the window's open.
  if (allowWalkIns) return null; // waitlisted / no seat / staff — only through the walk-in door.
  return "reservation_required";
}

/** `checkInIneligibleReason() === null`, for a caller that only needs the boolean. */
export function checkInWindowAllowed(session: PhaseInput, viewer: ViewerInput, allowWalkIns: boolean, checkInOpen: boolean, now: Date = new Date()): boolean {
  return checkInIneligibleReason(session, viewer, allowWalkIns, checkInOpen, now) === null;
}
