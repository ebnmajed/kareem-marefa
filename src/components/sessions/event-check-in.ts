import "server-only";
import { canOfferCheckInFor } from "@/lib/dal/checkin";
import type { EventSession } from "@/lib/dal/sessions";

// The event page's check-in link — contract 2 (checkin `5248e6b`; DEC-113,
// DEC-116, DEC-141; REQ-CHK-015, REQ-CHK-016, REQ-UIX-015).
//
// ★ FROM THE RAW FACTS, NOT THE RELATION. `canOfferCheckInFor()` is checkin's
// predicate and decides everything — the three states, the floor, the
// `ends_at + 2 h` ceiling, the room's switch, the walk-in door. What it needs
// from this page is what `viewerRelation` was derived FROM: the window
// outlives the phase a relation is bucketed by, so a completed session half an
// hour past its end reads «absent» for a member the room is still admitting.
//
// One function, so the page's call and its test are the same call
// (`tests/unit/sessions-event-check-in.test.ts`). It decides nothing of its
// own; `check_in()` remains the authority (REQ-NFR-001).
export function eventCheckInLink(session: EventSession, now: Date = new Date()): boolean {
  return canOfferCheckInFor(
    session,
    { isPresenter: session.viewerIsPresenter, isStaff: session.viewerIsStaff, rsvpStatus: session.rsvpStatus, checkedIn: session.checkedIn },
    session.allowWalkIns,
    session.checkInOpen,
    now,
  );
}
