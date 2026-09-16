import { describe, expect, it } from "vitest";
import { SESSION_PHASES, VIEWER_RELATIONS, type SeatState } from "@/lib/session-status";
import { affordancesFor } from "@/components/checkin/session-matrix";
import { primaryActionFor, type PrimaryActionInput } from "@/components/sessions/event-actions";

// The event page's one primary action — `16` §3 principle 2, §5.4.2,
// REQ-SES-013, REQ-UIX-015.
//
// `primaryActionFor` composes predicates tested elsewhere; what is proven here
// is that the composition never hands out an action whose own predicate said
// no, over every one of the 42 phase × relation cells and every combination of
// the other inputs — and that the journey reads in the order a member lives it.

const SEATS: (SeatState | null)[] = ["available", "full", "closed", "unlimited", null];

function* everyInput(): Generator<PrimaryActionInput> {
  for (const phase of SESSION_PHASES) {
    for (const relation of VIEWER_RELATIONS) {
      const can = affordancesFor(phase, relation);
      for (const canReserve of [true, false]) {
        for (const seat of SEATS) {
          for (const canCheckIn of [true, false]) {
            for (const canRate of [true, false]) {
              yield { phase, relation, can, canReserve, seat, canCheckIn, canRate };
            }
          }
        }
      }
    }
  }
}

const cell = (over: Partial<PrimaryActionInput> & Pick<PrimaryActionInput, "phase" | "relation">): PrimaryActionInput => ({
  can: affordancesFor(over.phase, over.relation),
  canReserve: false,
  seat: "available",
  canCheckIn: false,
  canRate: false,
  ...over,
});

describe("primaryActionFor", () => {
  it("★ never returns an action its own predicate refused — all 42 cells, every input", () => {
    let checked = 0;
    for (const input of everyInput()) {
      const action = primaryActionFor(input);
      checked += 1;
      switch (action) {
        case "reserve":
          expect(input.can.rsvp && input.canReserve && input.seat !== "closed").toBe(true);
          break;
        case "checkIn":
          expect(input.canCheckIn).toBe(true);
          break;
        case "calendar":
          expect(input.can.calendar && input.phase === "open" && input.relation === "confirmed").toBe(true);
          break;
        case "hostView":
          expect(input.can.hostConsole).toBe(true);
          break;
        case "rate":
          expect(input.canRate).toBe(true);
          break;
        case null:
          break;
      }
    }
    expect(checked).toBe(42 * 2 * SEATS.length * 2 * 2);
  });

  it("★ a cancelled session offers nothing, whatever else is true", () => {
    for (const input of everyInput()) {
      if (input.phase === "cancelled") expect(primaryActionFor(input)).toBeNull();
    }
  });

  it("before reserving: «احجز مقعدك»", () => {
    expect(primaryActionFor(cell({ phase: "open", relation: "none", canReserve: true }))).toBe("reserve");
  });

  it("after the deadline: nothing — the panel says why", () => {
    expect(primaryActionFor(cell({ phase: "open", relation: "none", canReserve: true, seat: "closed" }))).toBeNull();
  });

  it("★ after reserving: the calendar takes the reserve button's place (§5.4.2)", () => {
    expect(primaryActionFor(cell({ phase: "open", relation: "confirmed" }))).toBe("calendar");
  });

  it("★ a waitlist place is not a seat: no calendar, no primary", () => {
    expect(primaryActionFor(cell({ phase: "open", relation: "waitlisted" }))).toBeNull();
  });

  it("while it runs: check in, for a seat or an open walk-in door", () => {
    expect(primaryActionFor(cell({ phase: "live", relation: "confirmed", canCheckIn: true }))).toBe("checkIn");
    expect(primaryActionFor(cell({ phase: "live", relation: "none", canCheckIn: true }))).toBe("checkIn");
  });

  it("★ a clock-derived live with the check-in refused does NOT fall back to the calendar", () => {
    // `live` · `confirmed` has `calendar: true` in the matrix, but diarising a
    // session that has already started is not the thing to put in front of
    // the member.
    expect(primaryActionFor(cell({ phase: "live", relation: "confirmed", canCheckIn: false }))).toBeNull();
  });

  it("the presenter and staff run the room, before it and while it runs", () => {
    expect(primaryActionFor(cell({ phase: "open", relation: "presenter" }))).toBe("hostView");
    expect(primaryActionFor(cell({ phase: "live", relation: "staff" }))).toBe("hostView");
    expect(primaryActionFor(cell({ phase: "ended", relation: "presenter" }))).toBeNull();
  });

  it("once it is over: rate, only when allowed and in the window", () => {
    expect(primaryActionFor(cell({ phase: "ended", relation: "attended", canRate: true }))).toBe("rate");
    expect(primaryActionFor(cell({ phase: "ended", relation: "attended", canRate: false }))).toBeNull();
    expect(primaryActionFor(cell({ phase: "ended", relation: "absent" }))).toBeNull();
  });

  it("★ an ended session never offers a register control (ask 4)", () => {
    for (const input of everyInput()) {
      if (input.phase === "ended") expect(primaryActionFor(input)).not.toBe("reserve");
    }
  });
});
