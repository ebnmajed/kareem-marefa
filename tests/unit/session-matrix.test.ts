import { describe, expect, it } from "vitest";
import { SESSION_PHASES, VIEWER_RELATIONS, canGrantOn, type PhaseInput, type SessionPhase, type ViewerRelation } from "@/lib/session-status";
import { AFFORDANCE_MATRIX, type AffordanceCell, affordancesFor, checkInAllowed, rateAllowed } from "@/components/checkin/session-matrix";

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

  it("agrees with canGrantOn's own direction sweep for every state x schedule combination", () => {
    const relations: ViewerRelation[] = ["none", "confirmed", "waitlisted", "presenter", "staff"];
    const states: PhaseInput["state"][] = ["published", "in_progress", "completed", "cancelled"];
    const schedules = [
      { startsAt: at(-1), endsAt: at(1) },
      { startsAt: at(-5), endsAt: at(-3) },
      { startsAt: at(3), endsAt: at(5) },
    ];
    for (const state of states) {
      for (const schedule of schedules) {
        const session: PhaseInput = { state, ...schedule };
        for (const relation of relations) {
          const viaMatrix = checkInAllowed(session, relation, true);
          const gateAllows = canGrantOn(session, "checkIn", NOW);
          if (!gateAllows) expect(viaMatrix, `${state}/${relation}`).toBe(false);
        }
      }
    }
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
