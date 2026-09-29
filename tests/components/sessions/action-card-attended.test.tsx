// «حضرت» on the event page's action card — DEC-195 §2.5, contract 4 (`checkin`'s
// `checkInOfferFor()`), REQ-UIX-015, REQ-UIX-033.
//
// The matrix decides; the card draws its answer. A member already checked in to
// today gets `session-cta`'s `attended` face while the session runs and never
// the check-in link again — and once it has ended, `AttendanceOutcome` says
// «حضرت», so the card does not say it twice.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { primaryAfterCheckIn, showsAttended } from "@/components/sessions/event-actions";
import { SessionCta } from "@/components/ui/session-cta";
import { checkInOffer } from "@/components/checkin/session-matrix";

const DAY_1 = "00000000-0000-4000-8000-0000000002d1";
const DAY_2 = "00000000-0000-4000-8000-0000000002d2";
const now = new Date("2026-09-11T15:30:00Z");
const workshop = {
  state: "in_progress" as const,
  startsAt: "2026-09-10T15:00:00Z",
  endsAt: "2026-09-11T17:00:00Z",
  days: [
    { id: DAY_1, position: 1, startsAt: "2026-09-10T15:00:00Z", endsAt: "2026-09-10T17:00:00Z" },
    { id: DAY_2, position: 2, startsAt: "2026-09-11T15:00:00Z", endsAt: "2026-09-11T17:00:00Z" },
  ],
};
const viewer = { isPresenter: false, isStaff: false, rsvpStatus: "confirmed" as const, checkedIn: true };

describe("«حضرت» on the action card", () => {
  it("recorded for today: the face is drawn and the check-in link is not", () => {
    const answer = checkInOffer(workshop, { ...viewer, checkedInDayIds: [DAY_1, DAY_2] }, false, true, now);
    expect(answer).toBe("recorded");
    expect(showsAttended(answer, { attendanceOutcome: false })).toBe(true);
    expect(primaryAfterCheckIn("checkIn", answer)).toBeNull();
  });

  it("★ a workshop's day 2 is not answered by day 1's check-in: the link stays, no face", () => {
    const answer = checkInOffer(workshop, { ...viewer, checkedInDayIds: [DAY_1] }, false, true, now);
    expect(answer).not.toBe("recorded");
    expect(showsAttended(answer, { attendanceOutcome: false })).toBe(false);
    expect(primaryAfterCheckIn("checkIn", answer)).toBe("checkIn");
  });

  it("once the session has ended the outcome says «حضرت», and the card does not say it twice", () => {
    expect(showsAttended("recorded", { attendanceOutcome: true })).toBe(false);
  });

  it("any other primary is left as the page chose it", () => {
    expect(primaryAfterCheckIn("rate", "recorded")).toBe("rate");
    expect(primaryAfterCheckIn("calendar", "offer")).toBe("calendar");
    expect(primaryAfterCheckIn(null, "recorded")).toBeNull();
  });

  it("the face is a fact, not a control — «حضرت», nothing to press", () => {
    render(<SessionCta state={{ kind: "attended" }} label="حضرت" />);
    expect(screen.getByText("حضرت")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
