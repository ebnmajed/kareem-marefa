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
// a THIRD input the (phase, relation) pair alone can't encode — the caller
// resolves the tri-state through `checkInAllowed()`, never by reading the
// cell directly.
//
// ★ RLS and the RPCs remain authoritative (REQ-NFR-001). A cell here is a
// courtesy; the database refuses the write regardless.

import type { PhaseInput, SessionPhase, ViewerRelation } from "@/lib/session-status";
import { canGrantOn, sessionPhase } from "@/lib/session-status";

/** «قبل» · «أثناء» · «بعد» · مواد الجلسة الخاصة بمقدِّم أو مشرف قبل النشر. */
export type MaterialsWindow = "none" | "pre" | "during" | "after" | "own";

export interface AffordanceCell {
  rsvp: boolean;
  cancel: boolean;
  calendar: boolean;
  tasks: boolean;
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
    // §5.3 row 4 — «only if walk-ins are on» (DEC-065). `checkInAllowed()`
    // resolves the tri-state; the cell alone can't say yes or no.
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
 * Whether the check-in SCREEN or the check-in LINK may be offered.
 *
 * ★ Necessary but not sufficient to consult the cell alone: `checkIn` is a
 * GRANTING affordance (`session-status.ts`'s `GRANTING_AFFORDANCES.live`),
 * so a clock-derived `live` — `published` past its start, `start_session`
 * hasn't run yet — must still be refused even though the cell says
 * `"walkInsOnly"` or `true`. `canGrantOn()` is what enforces that; this
 * function is the one place the matrix cell and the direction guard combine,
 * so nobody has to remember to call both.
 */
export function checkInAllowed(session: PhaseInput, relation: ViewerRelation, allowWalkIns: boolean, now: Date = new Date()): boolean {
  const c = affordancesFor(sessionPhase(session, now), relation).checkIn;
  if (c === false) return false;
  if (c === "walkInsOnly" && !allowWalkIns) return false;
  return canGrantOn(session, "checkIn", now);
}

/**
 * Reference for `event`'s track (M10+) — not consumed by any component this
 * wave. Built and tested because the matrix is the WHOLE 49-cell table, not
 * just checkin's own three columns (`16` §5.4.1 row 5, DEC-090 corollary 2).
 */
export function rateAllowed(session: PhaseInput, relation: ViewerRelation, now: Date = new Date()): boolean {
  return affordancesFor(sessionPhase(session, now), relation).rate && canGrantOn(session, "rate", now);
}
