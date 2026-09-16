import type { AffordanceCell } from "@/components/checkin/session-matrix";
import type { SeatState, SessionPhase, ViewerRelation } from "@/lib/session-status";

// The event page's ONE primary action — `16` §3 principle 2, §5.4.2, §6.1
// note 2, REQ-SES-013, REQ-UIX-015.
//
// ★ THIS DECIDES NOTHING ABOUT PERMISSION. Every input is a predicate that
// already exists and is already tested elsewhere — the matrix cell
// (`affordancesFor`), the RSVP panel's own `canReserve` and seat, the
// check-in link's `canOfferCheckInLink`, the rating's `rateAllowed` plus its
// window — and this function only picks which of the already-permitted
// actions is the one drawn as primary. The action card draws it on desktop and
// the bottom action bar draws it on the phone; they read the same answer, so
// the two can never disagree about what the member is being asked to do.
//
// The order is the member's journey: reserve before the session, diarise once
// the seat is theirs (§5.4.2 — the calendar takes the reserve button's place
// because it was never offered before there was a seat), check in while it
// runs, run the room if it is theirs, rate once it is over.

export type PrimaryAction = "reserve" | "calendar" | "checkIn" | "hostView" | "rate";

export interface PrimaryActionInput {
  phase: SessionPhase;
  relation: ViewerRelation;
  /** `affordancesFor(phase, relation)`. */
  can: AffordanceCell;
  /** `getRsvpPanelData().canReserve` — false when the panel has no data. */
  canReserve: boolean;
  /** `getRsvpPanelData().seat`. A closed seat state means the deadline has passed. */
  seat: SeatState | null;
  /** `canOfferCheckInLink()` — the matrix cell, the walk-in switch and the direction guard. */
  canCheckIn: boolean;
  /** `rateAllowed()` AND the org's rating window is still open. */
  canRate: boolean;
}

export function primaryActionFor(input: PrimaryActionInput): PrimaryAction | null {
  const { phase, relation, can } = input;
  if (phase === "cancelled") return null;
  // Both the matrix cell and the panel's own flag: the panel's is derived from
  // the cell today, and the test over every input is what keeps an ended
  // session from ever drawing a register button if that ever stops being true.
  if (can.rsvp && input.canReserve && input.seat !== "closed") return "reserve";
  if (input.canCheckIn) return "checkIn";
  if (phase === "open" && relation === "confirmed" && can.calendar) return "calendar";
  if ((relation === "presenter" || relation === "staff") && can.hostConsole) return "hostView";
  if (input.canRate) return "rate";
  return null;
}
