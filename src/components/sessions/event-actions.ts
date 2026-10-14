import type { AffordanceCell } from "@/components/checkin/session-matrix";
import type { SeatState, SessionPhase, ViewerRelation } from "@/lib/session-status";

// The event page's ONE primary action — `16` §3 principle 2, §5.4.2, §6.1
// note 2, REQ-SES-013, REQ-UIX-015.
//
// ★ THIS DECIDES NOTHING ABOUT PERMISSION. Every input is a predicate that
// already exists and is already tested elsewhere — the matrix cell
// (`affordancesFor`), the RSVP panel's own `canReserve` and seat, the
// page's one check-in answer `eventCheckIn()` (contract 2), the rating's `rateAllowed` plus its
// window — and this function only picks which of the already-permitted
// actions is the one drawn as primary. The action card draws it on desktop and
// the bottom action bar draws it on the phone; they read the same answer, so
// the two can never disagree about what the member is being asked to do.
//
// The order is the member's journey: reserve before the session, diarise once
// the seat is theirs (§5.4.2 — the calendar takes the reserve button's place
// because it was never offered before there was a seat), check in while it
// runs, run the room if it is theirs, rate once it is over.
//
// ★ WHO IS OFFERED CHECK-IN AS THE PRIMARY (the owner, 2026-10-14):
//   · a member with a confirmed seat — always, while the day takes attendance;
//   · a member with no seat, or waitlisted — only through the walk-in door;
//   · a presenter of the session — never (REQ-CHK-011);
//   · staff who hold no seat of their own (relation `staff`) — NEVER as the
//     primary: they are running the room, so «شاشة التقديم» is their button and
//     the walk-in check-in is drawn beside it as a secondary. Staff who reserved
//     a seat are attendees (relation `confirmed`) and are offered it first.

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
  /** `eventCheckIn() === "offer"` — the states, the day's window to its ceiling, the room's switch, the walk-in door, not already checked in today. */
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
  if ((relation === "presenter" || relation === "staff") && can.hostConsole) return "hostView";
  // Staff without a seat get check-in as a secondary only — also in the grace window, when no host view remains.
  if (input.canCheckIn && relation !== "staff") return "checkIn";
  if (phase === "open" && relation === "confirmed" && can.calendar) return "calendar";
  if (input.canRate) return "rate";
  return null;
}

// ★ Wave 16 — «حضرت» (DEC-195 §2.5, contract 4, REQ-UIX-015). `checkin`'s
// `checkInOfferFor()` answers `recorded` for a member already checked in to
// today (per day, from `checkedInDayIds`). The card then draws `session-cta`'s
// `attended` face while the session runs — once it has ended,
// `AttendanceOutcome` says «حضرت» and the card must not say it twice — and
// never the check-in link beside it.

export type CheckInAnswer = "offer" | "recorded" | "none";

/** Whether the card draws «حضرت» itself: recorded, and not yet the ended outcome's to say. */
export function showsAttended(answer: CheckInAnswer, can: Pick<AffordanceCell, "attendanceOutcome">): boolean {
  return answer === "recorded" && !can.attendanceOutcome;
}

/** The primary once the matrix has answered: a recorded check-in is never offered again. */
export function primaryAfterCheckIn(primary: PrimaryAction | null, answer: CheckInAnswer): PrimaryAction | null {
  return primary === "checkIn" && answer === "recorded" ? null : primary;
}

/**
 * The live rules line under the check-in — REQ-CHK-019, REQ-CHK-018, DEC-255 D4. What it says, as message keys: the
 * period when the code rotates, the first clause alone when it does not (null is «off» — or unread, `checkin`'s
 * contract 2), and the pending points after either. ★ The points sentence never goes with the rotation.
 */
export type RotationLine = { rotation: { key: "rotation"; minutes: number } | { key: "rotationFixed" }; points: number | null };

export function rotationLineFor(rotationSeconds: number | null, points: number | null): RotationLine {
  return {
    rotation: rotationSeconds ? { key: "rotation", minutes: Math.round(rotationSeconds / 60) } : { key: "rotationFixed" },
    points: points !== null && points > 0 ? points : null,
  };
}
