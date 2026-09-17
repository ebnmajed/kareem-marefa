// `checkInIneligibleReason()` on the DAY — src/components/checkin/session-matrix.ts
// (DEC-119, DEC-150 contract 4, DEC-151). The courtesy twin of `check_in()`,
// and the whole point is that it answers what the RPC answers: a screen that
// offers a check-in the database refuses is DEC-141's bug (c) coming back.
//
// ★ `tests/unit/session-matrix.test.ts` is untouched (rule 4) — it asserts the
// 42 cells and the pre-day predicate, and every one of its cases still passes
// because a caller that passes no days takes the same path it always did.
import { describe, expect, it } from "vitest";
import { checkInDayFor, checkInIneligibleReason, checkInWindowAllowed } from "@/components/checkin/session-matrix";
import type { DayWindow, PhaseInput, ViewerInput } from "@/lib/session-status";

const NOW = new Date("2026-03-11T13:30:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const CONFIRMED: ViewerInput = { isStaff: false, isPresenter: false, rsvpStatus: "confirmed", checkedIn: false };

const day = (id: string, position: number, fromH: number, toH: number, checkInOpen?: boolean): DayWindow => ({
  id,
  position,
  startsAt: at(fromH),
  endsAt: at(toH),
  ...(checkInOpen === undefined ? {} : { checkInOpen }),
});

/** The session's own window is the stored shadow: first day's start, last day's end. */
function session(days: DayWindow[] | null): PhaseInput {
  if (!days || days.length === 0) return { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
  return { state: "in_progress", startsAt: days[0].startsAt, endsAt: days[days.length - 1].endsAt, days };
}

const reason = (s: PhaseInput, open = true) => checkInIneligibleReason(s, CONFIRMED, false, open, NOW);

describe("no days passed — every pre-wave-9 caller takes the path it always did", () => {
  it("is eligible inside the session's own window, and refused either side of it", () => {
    expect(reason(session(null))).toBeNull();
    expect(reason({ state: "in_progress", startsAt: at(1), endsAt: at(3) })).toBe("not_started");
    expect(reason({ state: "in_progress", startsAt: at(-6), endsAt: at(-3) })).toBe("session_ended");
    // The grace window, REQ-CHK-016: ended 1 h ago, still inside end + 2 h.
    expect(reason({ state: "in_progress", startsAt: at(-3), endsAt: at(-1) })).toBeNull();
    expect(reason(session(null), false)).toBe("check_in_closed");
  });
});

describe("one day — identical to no days, by arithmetic and not by a branch", () => {
  it("gives the same answer as the session's own window in every position", () => {
    const one = (fromH: number, toH: number) => session([day("d1", 1, fromH, toH)]);
    expect(reason(one(-1, 1))).toBeNull();
    expect(reason(one(1, 3))).toBe("not_started");
    expect(reason(one(-6, -3))).toBe("session_ended");
    expect(reason(one(-3, -1))).toBeNull(); // the grace window survives: no next day, no cap
    expect(reason(one(-1, 1), false)).toBe("check_in_closed");
  });
});

describe("three days — the window, the switch and the ceiling are the day's", () => {
  const three = (opts: { d2Open?: boolean; d3Open?: boolean } = {}) =>
    session([day("d1", 1, -50, -48), day("d2", 2, -1, 1, opts.d2Open), day("d3", 3, 22, 24, opts.d3Open)]);

  it("is eligible during day 2, and names day 2 as the day the screen is about", () => {
    expect(reason(three())).toBeNull();
    expect(checkInDayFor(three(), NOW)?.id).toBe("d2");
    expect(checkInWindowAllowed(three(), CONFIRMED, false, true, NOW)).toBe(true);
  });

  it("day 2's own switch refuses, and day 3's switch is not consulted for it", () => {
    expect(reason(three({ d2Open: false }))).toBe("check_in_closed");
    expect(reason(three({ d2Open: true, d3Open: false }))).toBeNull();
  });

  it("falls back to the session's shadow only when the day carries no switch of its own", () => {
    // `checkInOpen` omitted on every day: the fourth argument — the `bool_or`
    // shadow (DEC-150 contract 2) — decides, which at one day IS the day's.
    expect(reason(three(), false)).toBe("check_in_closed");
    // Present on the day, it wins over the shadow.
    expect(reason(three({ d2Open: true }), false)).toBeNull();
  });

  it("★ after day 2's ceiling, with day 3 still ahead, the answer is session_ended — the envelope check_in() returns", () => {
    const ended = session([day("d1", 1, -50, -48), day("d2", 2, -6, -4), day("d3", 3, 22, 24)]);
    expect(reason(ended)).toBe("session_ended");
    // ★ and the day it is about is day 2, not day 3 — so the screen's label
    // and its refusal are about the same meeting.
    expect(checkInDayFor(ended, NOW)?.id).toBe("d2");
  });

  it("before the first day, the answer is not_started and the day is the FIRST", () => {
    const ahead = session([day("d1", 1, 10, 12), day("d2", 2, 34, 36)]);
    expect(reason(ahead)).toBe("not_started");
    expect(checkInDayFor(ahead, NOW)?.id).toBe("d1");
  });
});

describe("between two days — the grace window, and the cap that ends it", () => {
  it("a gap WIDER than the grace: day 1's ceiling has passed, so session_ended", () => {
    // day 1 ended 5 h ago; its ceiling was 3 h ago; day 2 is 5 h away.
    const s = session([day("d1", 1, -7, -5), day("d2", 2, 5, 7)]);
    expect(reason(s)).toBe("session_ended");
  });

  it("a gap NARROWER than the grace: day 1 is still taking attendance, exactly as a one-day session would be", () => {
    // day 1 ended 1 h ago; day 2 is 1 h away, so the cap is 1 h from now and
    // has not passed.
    const s = session([day("d1", 1, -3, -1), day("d2", 2, 1, 3)]);
    expect(reason(s)).toBeNull();
    expect(checkInDayFor(s, NOW)?.id).toBe("d1");
  });

  it("★ the cap: two meetings on one date, at 13:30 the answer is the AFTERNOON", () => {
    // 9–12 and 13–16 on this date. Uncapped, day 1's ceiling would be 14:00
    // and both days would hold 13:30; capped at 13:00, only day 2 does.
    const s = session([day("d1", 1, -4.5, -1.5), day("d2", 2, -0.5, 2.5)]);
    expect(checkInDayFor(s, NOW)?.id).toBe("d2");
    expect(reason(s)).toBeNull();
    // Closing the MORNING changes nothing about the afternoon.
    const morningClosed = session([day("d1", 1, -4.5, -1.5, false), day("d2", 2, -0.5, 2.5, true)]);
    expect(reason(morningClosed)).toBeNull();
  });
});

describe("the session-level gates are unchanged — they are lifecycle facts, not meeting ones", () => {
  const days = [day("d1", 1, -1, 1), day("d2", 2, 22, 24)];

  it("a presenter, a cancelled session and an unpublished one answer before any day is read", () => {
    const s = { state: "in_progress", startsAt: days[0].startsAt, endsAt: days[1].endsAt, days } as PhaseInput;
    expect(checkInIneligibleReason(s, { ...CONFIRMED, isPresenter: true }, true, true, NOW)).toBe("presenter_cannot_check_in");
    expect(reason({ ...s, state: "cancelled" })).toBe("cancelled");
    expect(reason({ ...s, state: "draft" })).toBe("not_published");
    expect(reason({ ...s, state: "archived" })).toBe("session_ended");
  });

  it("the walk-in door is the session's: one registration covers every day (DEC-120)", () => {
    const s = session(days);
    const noSeat: ViewerInput = { isStaff: false, isPresenter: false, rsvpStatus: null, checkedIn: false };
    expect(checkInIneligibleReason(s, noSeat, false, true, NOW)).toBe("reservation_required");
    expect(checkInIneligibleReason(s, noSeat, true, true, NOW)).toBeNull();
  });
});
