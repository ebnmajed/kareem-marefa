import "server-only";
import { checkInOfferFor } from "@/lib/dal/checkin";
import type { CheckInOffer } from "@/components/checkin/session-matrix";
import type { EventSession } from "@/lib/dal/sessions";
import type { DayWindow } from "@/lib/session-status";

// The event page's check-in answer — contract 2 (checkin `5248e6b`; DEC-113,
// DEC-116, DEC-141, DEC-195 §2.5; REQ-CHK-011, REQ-CHK-015, REQ-CHK-016, REQ-UIX-015).
//
// ★ ONE ANSWER PER PAGE. The page computes it once and hands it to both the
// primary-action choice and the action card, so the card, the phone's bar and
// the primary can never disagree. It used to be computed twice — once here
// WITHOUT the days and once in the card WITH them — and on a workshop the two
// differed: between two days the primary offered a check-in the screen then
// refused, and a member checked in on day 1 lost day 2's button.
//
// ★ FROM THE RAW FACTS, NOT THE RELATION. The window outlives the phase a
// relation is bucketed by (`ends_at + 2 h`), so `checkInOffer()` reads the seat,
// the presenter and staff flags, the days and the days already checked in.
// It decides nothing of its own; `check_in()` remains the authority (REQ-NFR-001).
export function eventCheckIn(session: EventSession, days: readonly DayWindow[], now: Date = new Date()): CheckInOffer {
  return checkInOfferFor(
    { ...session, days },
    {
      isPresenter: session.viewerIsPresenter,
      isStaff: session.viewerIsStaff,
      rsvpStatus: session.rsvpStatus,
      checkedIn: session.checkedIn,
      checkedInDayIds: session.checkedInDayIds,
    },
    session.allowWalkIns,
    session.checkInOpen,
    now,
  );
}
