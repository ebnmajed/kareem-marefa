import { describe, expect, it } from "vitest";
import { SESSION_PHASES, VIEWER_RELATIONS, type PhaseInput, type SessionPhase, type ViewerInput, type ViewerRelation } from "@/lib/session-status";
import { AFFORDANCE_MATRIX, type AffordanceCell, affordancesFor, checkInAllowed, checkInWindowAllowed, rateAllowed } from "@/components/checkin/session-matrix";

// `16` §5.3, REQ-UIX-015, DEC-090, DEC-101. `docs/plan/notes/checkin.md`
// "Wave 5" records the two departures from the plan's printed table: six
// phases, not seven (`SESSION_PHASES` has six members — DEC-105), so this is
// 6 × 7 = 42 cells, not 49; and nine affordance columns, not eight
// (`hostConsole` added, named by `session-status.ts`'s own
// `GRANTING_AFFORDANCES` but not printed in `16`'s table).
//
// EXPECTED below is transcribed independently from `16` §5.3 and the notes
// file's reasoning for the unprinted rows — NOT copied from
// `AFFORDANCE_MATRIX` — so a slip in the source table fails a test instead
// of passing one that checks the table against itself.

const NOW = new Date("2026-09-15T12:00:00Z");
const HOUR = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();

const NOTHING: AffordanceCell = { rsvp: false, cancel: false, calendar: false, tasks: false, checkIn: false, hostConsole: false, rate: false, attendanceOutcome: false, share: false, materials: "none" };
const c = (over: Partial<AffordanceCell>): AffordanceCell => ({ ...NOTHING, ...over });

const EXPECTED: Record<SessionPhase, Partial<Record<ViewerRelation, AffordanceCell>>> = {
  draft: { presenter: c({ materials: "own" }), staff: c({ materials: "own" }) },
  pending_schedule: { presenter: c({ materials: "own" }), staff: c({ materials: "own" }) },
  open: {
    none: c({ rsvp: true, share: true, materials: "pre" }),
    confirmed: c({ cancel: true, calendar: true, tasks: true, share: true, materials: "pre" }),
    waitlisted: c({ cancel: true, tasks: true, share: true, materials: "pre" }),
    presenter: c({ tasks: true, hostConsole: true, share: true, materials: "pre" }),
    staff: c({ tasks: true, hostConsole: true, share: true, materials: "pre" }),
  },
  live: {
    none: c({ checkIn: "walkInsOnly", share: true, materials: "during" }),
    confirmed: c({ calendar: true, tasks: true, checkIn: true, share: true, materials: "during" }),
    waitlisted: c({ checkIn: "walkInsOnly", share: true, materials: "during" }),
    presenter: c({ calendar: true, tasks: true, hostConsole: true, share: true, materials: "during" }),
    staff: c({ tasks: true, checkIn: "walkInsOnly", hostConsole: true, share: true, materials: "during" }),
  },
  ended: {
    none: c({ share: true, materials: "after" }),
    attended: c({ rate: true, attendanceOutcome: true, share: true, materials: "after" }),
    absent: c({ attendanceOutcome: true, share: true, materials: "after" }),
    presenter: c({ share: true, materials: "after" }),
    staff: c({ share: true, materials: "after" }),
  },
  cancelled: {},
};

describe("the affordance matrix — one assertion per cell (`16` §5.3, DEC-101)", () => {
  for (const phase of SESSION_PHASES) {
    for (const relation of VIEWER_RELATIONS) {
      const expected = EXPECTED[phase][relation] ?? NOTHING;
      it(`${phase} / ${relation}`, () => {
        expect(affordancesFor(phase, relation)).toEqual(expected);
      });
    }
  }

  it("is total — every (phase, relation) pair has a defined cell", () => {
    for (const phase of SESSION_PHASES) {
      for (const relation of VIEWER_RELATIONS) {
        expect(AFFORDANCE_MATRIX[phase][relation], `${phase}/${relation}`).toBeDefined();
      }
    }
  });
});

describe("★ the two ask-4 cells — an ended session shows the outcome, never a live cancel form", () => {
  it("ended/attended: no cancel, the read-only fact, rating opens", () => {
    const cell = affordancesFor("ended", "attended");
    expect(cell.cancel).toBe(false);
    expect(cell.attendanceOutcome).toBe(true);
    expect(cell.rate).toBe(true);
  });

  it("ended/absent: no cancel, the read-only fact, nothing to rate", () => {
    const cell = affordancesFor("ended", "absent");
    expect(cell.cancel).toBe(false);
    expect(cell.attendanceOutcome).toBe(true);
    expect(cell.rate).toBe(false);
  });
});

describe("★ cancel does not stop at the cutoff (`16` §5.3's starred note) — a matrix cell, not a clock", () => {
  it("open/confirmed keeps cancel available; the cutoff only changes the wording, in rsvp-panel.tsx, not here", () => {
    expect(affordancesFor("open", "confirmed").cancel).toBe(true);
  });

  it("leaving the waitlist is also always available while open — STORY-RSV-004", () => {
    expect(affordancesFor("open", "waitlisted").cancel).toBe(true);
  });

  it("cancel disappears entirely once live — bug (a)'s other half", () => {
    expect(affordancesFor("live", "confirmed").cancel).toBe(false);
  });
});

describe("checkInAllowed — the walk-in tri-state plus the direction guard", () => {
  const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };

  it("a confirmed seat may check in during a genuinely in_progress session", () => {
    expect(checkInAllowed(running, "confirmed", false, NOW)).toBe(true);
  });

  it("a bystander with no seat is refused with walk-ins off, allowed with them on", () => {
    expect(checkInAllowed(running, "none", false, NOW)).toBe(false);
    expect(checkInAllowed(running, "none", true, NOW)).toBe(true);
  });

  it("a presenter is refused regardless of walk-ins (REQ-CHK-011) — the cell itself has no true branch", () => {
    expect(checkInAllowed(running, "presenter", true, NOW)).toBe(false);
  });

  it("★ refuses check-in on a clock-derived live even with walk-ins on — the RPC would refuse too", () => {
    const early: PhaseInput = { state: "published", startsAt: at(-1), endsAt: at(1) };
    expect(checkInAllowed(early, "none", true, NOW)).toBe(false);
    expect(checkInAllowed(early, "confirmed", false, NOW)).toBe(false);
  });

  // "agrees with canGrantOn's own direction sweep" removed under DEC-141:
  // `GRANTING_AFFORDANCES.live` drops `"checkIn"` (session-status.ts,
  // requested in docs/plan/notes/checkin.md), which makes
  // `canGrantOn(session, "checkIn", now)` a TYPE ERROR, not just a
  // behaviour change — the mechanism this test checked no longer exists.
  // `checkInAllowed()` itself is unchanged (see its own comment for why:
  // its last line now inlines what `canGrantOn` used to compute, so this
  // function's behaviour — and every OTHER test in this block — still
  // holds). The replacement coverage, for the mechanism that actually
  // decides check-in eligibility now, is the `checkInWindowAllowed`
  // block below.
});

describe("checkInWindowAllowed — DEC-141, self-contained: never through sessionPhase()/viewerRelation()", () => {
  const confirmed: ViewerInput = { isStaff: false, isPresenter: false, rsvpStatus: "confirmed", checkedIn: false };
  const noSeat: ViewerInput = { isStaff: false, isPresenter: false, rsvpStatus: null, checkedIn: false };
  const staff: ViewerInput = { isStaff: true, isPresenter: false, rsvpStatus: null, checkedIn: false };
  const presenter: ViewerInput = { isStaff: false, isPresenter: true, rsvpStatus: "confirmed", checkedIn: false };

  it("a confirmed seat may check in while genuinely in_progress, switch open", () => {
    const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
    expect(checkInWindowAllowed(running, confirmed, false, true, NOW)).toBe(true);
  });

  it("refuses before the floor — a code that would not yet exist", () => {
    const early: PhaseInput = { state: "published", startsAt: at(1), endsAt: at(3) };
    expect(checkInWindowAllowed(early, confirmed, false, true, NOW)).toBe(false);
  });

  it("REQ-CHK-011: a presenter is refused regardless of window, switch or walk-ins", () => {
    const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
    expect(checkInWindowAllowed(running, presenter, true, true, NOW)).toBe(false);
  });

  it("a bystander with no seat needs the walk-in door open", () => {
    const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
    expect(checkInWindowAllowed(running, noSeat, false, true, NOW)).toBe(false);
    expect(checkInWindowAllowed(running, noSeat, true, true, NOW)).toBe(true);
    expect(checkInWindowAllowed(running, staff, true, true, NOW)).toBe(true);
  });

  it("REQ-CHK-015: refuses while the switch is closed, even mid-window", () => {
    const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
    expect(checkInWindowAllowed(running, confirmed, false, false, NOW)).toBe(false);
  });

  it("DEC-141 ruling 1: refuses on a cancelled session whose scheduled start has passed", () => {
    const cancelled: PhaseInput = { state: "cancelled", startsAt: at(-1), endsAt: at(1) };
    expect(checkInWindowAllowed(cancelled, confirmed, false, true, NOW)).toBe(false);
  });

  it("draft/approved sessions have no window to be in at all", () => {
    const draft: PhaseInput = { state: "draft", startsAt: null, endsAt: null };
    const approved: PhaseInput = { state: "approved", startsAt: null, endsAt: null };
    expect(checkInWindowAllowed(draft, confirmed, false, true, NOW)).toBe(false);
    expect(checkInWindowAllowed(approved, confirmed, false, true, NOW)).toBe(false);
  });

  // ★ The grace-window fix itself, DEC-141's condition (c) — the thing the
  // lead asked to see pinned. `ends_at` was 30 minutes ago: `sessionPhase()`
  // ALREADY calls this session "ended" (its own clock clause has no
  // knowledge of the 2h ceiling), and `viewerRelation()` would reclassify a
  // confirmed, not-yet-checked-in member as "absent" — the bug this function
  // exists to route around entirely.
  it("★ still offers check-in during the 2h grace window, even though the screen already calls the session ended", () => {
    const graceWindow: PhaseInput = { state: "in_progress", startsAt: at(-1.5), endsAt: at(-0.5) };
    expect(checkInWindowAllowed(graceWindow, confirmed, false, true, NOW)).toBe(true);
  });

  it("refuses once the 2h ceiling itself has passed", () => {
    const pastCeiling: PhaseInput = { state: "completed", startsAt: at(-3.5), endsAt: at(-2.17) }; // ends 2h10m ago
    expect(checkInWindowAllowed(pastCeiling, confirmed, false, true, NOW)).toBe(false);
  });

  it("the ceiling is computed from the SCHEDULED end, not extended by a late actual finish (REQ-CHK-016)", () => {
    // The row is still in_progress (the clock job hasn't caught up), but the
    // scheduled end was well over 2h ago — the ceiling doesn't care that the
    // room is apparently still running.
    const overrun: PhaseInput = { state: "in_progress", startsAt: at(-4), endsAt: at(-2.5) };
    expect(checkInWindowAllowed(overrun, confirmed, false, true, NOW)).toBe(false);
  });
});

describe("rateAllowed — reference for `event`'s track, not consumed this wave", () => {
  it("allows rating once the row itself says the session is over", () => {
    const done: PhaseInput = { state: "completed", startsAt: at(-5), endsAt: at(-3) };
    expect(rateAllowed(done, "attended", NOW)).toBe(true);
    expect(rateAllowed(done, "absent", NOW)).toBe(false);
  });

  it("refuses on a clock-derived ended — §5.4.1 row 5", () => {
    const stale: PhaseInput = { state: "in_progress", startsAt: at(-5), endsAt: at(-3) };
    expect(rateAllowed(stale, "attended", NOW)).toBe(false);
  });
});
