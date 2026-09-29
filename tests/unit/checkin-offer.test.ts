// `checkInOffer()` — «حضرت», the matrix's answer for the event page's link
// (DEC-195 §2.5, REQ-UIX-015, contract 4). A member already checked in to the
// day taking attendance is `recorded`, never offered the link again; a
// workshop member who attended day 1 is still offered day 2's.
//
// ★ New behaviour in a new file (rule 14): `session-matrix.test.ts` and
// `checkin-day-window.test.ts` are untouched — `checkInWindowAllowed()` and
// `checkInIneligibleReason()` do not change.
import { describe, expect, it, vi } from "vitest";
import { checkInOffer, checkInWindowAllowed, type CheckInOfferViewer } from "@/components/checkin/session-matrix";
import { canOfferCheckInFor, checkInOfferFor } from "@/lib/dal/checkin";
import type { DayWindow, PhaseInput } from "@/lib/session-status";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const NOW = new Date("2026-03-11T13:30:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const viewer = (over: Partial<CheckInOfferViewer> = {}): CheckInOfferViewer => ({ isStaff: false, isPresenter: false, rsvpStatus: "confirmed", checkedIn: false, ...over });
const day = (id: string, position: number, fromH: number, toH: number): DayWindow => ({ id, position, startsAt: at(fromH), endsAt: at(toH) });

const TALK: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
const ONE_DAY: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1), days: [day("d1", 1, -1, 1)] };
/** Day 1 is over; day 2 is taking attendance now; day 3 is tomorrow. */
const WORKSHOP: PhaseInput = { state: "in_progress", startsAt: at(-50), endsAt: at(24), days: [day("d1", 1, -50, -48), day("d2", 2, -1, 1), day("d3", 3, 22, 24)] };

const offer = (s: PhaseInput, v: CheckInOfferViewer, open = true) => checkInOffer(s, v, false, open, NOW);

describe("one day (or none) — any active check-in is today's", () => {
  it("not checked in → offer; checked in → recorded, not the link again", () => {
    for (const s of [TALK, ONE_DAY]) {
      expect(offer(s, viewer())).toBe("offer");
      expect(offer(s, viewer({ checkedIn: true }))).toBe("recorded");
    }
  });

  it("recorded holds while the room's switch is closed — the member IS in", () => {
    expect(offer(TALK, viewer({ checkedIn: true }), false)).toBe("recorded");
    expect(offer(TALK, viewer(), false)).toBe("none");
  });

  it("a presenter is never recorded or offered (REQ-CHK-011); a cancelled session neither", () => {
    expect(offer(TALK, viewer({ isPresenter: true, checkedIn: true }))).toBe("none");
    expect(offer({ ...TALK, state: "cancelled" }, viewer({ checkedIn: true }))).toBe("none");
  });

  it("the day's ids, when given, decide at one day too", () => {
    expect(offer(ONE_DAY, viewer({ checkedIn: true, checkedInDayIds: ["d1"] }))).toBe("recorded");
    expect(offer(ONE_DAY, viewer({ checkedIn: false, checkedInDayIds: [] }))).toBe("offer");
  });
});

describe("a workshop — per day", () => {
  it("★ attended day 1, day 2 live → offer day 2's link", () => {
    expect(offer(WORKSHOP, viewer({ checkedIn: true, checkedInDayIds: ["d1"] }))).toBe("offer");
  });

  it("attended day 2, day 2 live → recorded", () => {
    expect(offer(WORKSHOP, viewer({ checkedIn: true, checkedInDayIds: ["d1", "d2"] }))).toBe("recorded");
  });

  it("★ no ids from the caller → never recorded: hiding a day's link is the worse error", () => {
    expect(offer(WORKSHOP, viewer({ checkedIn: true }))).toBe("offer");
  });
});

describe("the DAL's two re-exports", () => {
  it("canOfferCheckInFor() is offer only; checkInOfferFor() is the answer", () => {
    expect(canOfferCheckInFor(TALK, viewer({ checkedIn: true }), false, true, NOW)).toBe(false);
    expect(canOfferCheckInFor(TALK, viewer(), false, true, NOW)).toBe(true);
    expect(checkInOfferFor(TALK, viewer({ checkedIn: true }), false, true, NOW)).toBe("recorded");
  });

  it("★ the window itself does not move — the timeline's pinned card (SCR-010) is unchanged", () => {
    expect(checkInWindowAllowed(TALK, viewer({ checkedIn: true }), false, true, NOW)).toBe(true);
  });
});
