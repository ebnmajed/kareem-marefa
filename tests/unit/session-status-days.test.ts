// Contract 9 (DEC-150) — src/lib/session-status.ts on the day set (DEC-119).
//
// ★ The proof that a ONE-day session reads as it always did is NOT here: it is
// tests/unit/session-status.test.ts and session-matrix.test.ts passing
// unmodified, none of whose cases passes `days`. This file proves what is new —
// and restates the one-day case WITH `days` passed, because a caller that
// starts passing the one day must get the answer it got before.
import { describe, expect, it } from "vitest";
import {
  betweenDays,
  canGrantOn,
  CHECK_IN_CEILING_MS,
  checkInDay,
  dayPhase,
  neverGrantsMoreThanStored,
  resolveDay,
  sessionPhase,
  type DayWindow,
  type PhaseInput,
  type SessionState,
} from "@/lib/session-status";

const H = 3_600_000;
const T0 = Date.parse("2026-11-18T15:00:00.000Z"); // Wednesday 18:00 in Riyadh
const at = (h: number) => new Date(T0 + h * H);
const iso = (h: number) => at(h).toISOString();
const day = (id: string, position: number, fromH: number, toH: number): DayWindow => ({ id, position, startsAt: iso(fromH), endsAt: iso(toH) });

// Three evenings, 18:00–20:00, Wednesday to Friday.
const WED = day("d1", 1, 0, 2);
const THU = day("d2", 2, 24, 26);
const FRI = day("d3", 3, 48, 50);
const workshop = (state: SessionState): PhaseInput => ({ state, startsAt: WED.startsAt, endsAt: FRI.endsAt, days: [WED, THU, FRI] });
const talk = (state: SessionState, withDays: boolean): PhaseInput => ({
  state,
  startsAt: WED.startsAt,
  endsAt: WED.endsAt,
  ...(withDays ? { days: [WED] } : {}),
});

describe("sessionPhase — live while ANY day runs, ended after the LAST, open in between (DEC-119)", () => {
  const cases: [string, number, SessionState, string][] = [
    ["before the first day", -1, "published", "open"],
    ["during day 1", 1, "in_progress", "live"],
    ["during day 1, the clock job lagging", 1, "published", "live"],
    ["the night after day 1", 10, "in_progress", "open"],
    ["the night after day 1, the clock job lagging", 10, "published", "open"],
    ["during day 2", 25, "in_progress", "live"],
    ["the night after day 2", 40, "in_progress", "open"],
    ["during day 3", 49, "in_progress", "live"],
    ["after the last day, the completion job lagging", 51, "in_progress", "ended"],
    ["after the last day", 51, "completed", "ended"],
    ["cancelled between days", 10, "cancelled", "cancelled"],
  ];
  for (const [name, h, state, phase] of cases) {
    it(`${name} → ${phase}`, () => expect(sessionPhase(workshop(state), at(h))).toBe(phase));
  }

  it("the floor and the end of a day are [start, end): live AT the start, in the gap AT the end", () => {
    expect(sessionPhase(workshop("in_progress"), at(0))).toBe("live");
    expect(sessionPhase(workshop("in_progress"), at(2))).toBe("open");
    expect(sessionPhase(workshop("in_progress"), at(24))).toBe("live");
  });

  it("★ a one-day session reads the same with its one day passed as without — at every hour and in every state", () => {
    const states: SessionState[] = ["draft", "submitted", "in_review", "changes_requested", "approved", "published", "in_progress", "completed", "archived", "cancelled"];
    for (const state of states) {
      for (let h = -3; h <= 6; h += 0.5) {
        expect(sessionPhase(talk(state, true), at(h)), `${state} @ ${h}h`).toBe(sessionPhase(talk(state, false), at(h)));
      }
    }
  });

  it("`days: []` and `days: null` are a session with no days, not a crash: the stored window alone decides", () => {
    for (const days of [[], null, undefined]) {
      expect(sessionPhase({ state: "in_progress", startsAt: WED.startsAt, endsAt: WED.endsAt, days }, at(1))).toBe("live");
    }
  });

  it("days handed over out of order are read in the order they happen", () => {
    const shuffled: PhaseInput = { ...workshop("in_progress"), days: [FRI, WED, THU] };
    expect(sessionPhase(shuffled, at(10))).toBe("open");
    expect(sessionPhase(shuffled, at(25))).toBe("live");
  });
});

describe("the direction rule survives the gap (DEC-090 corollary 2)", () => {
  it("between two days an `in_progress` workshop grants no host console — the phase is the clock's, and the clock only removes", () => {
    expect(canGrantOn(workshop("in_progress"), "hostConsole", at(1))).toBe(true); //   day 1 running
    expect(canGrantOn(workshop("in_progress"), "hostConsole", at(10))).toBe(false); // the night between
    expect(canGrantOn(workshop("in_progress"), "hostConsole", at(25))).toBe(true); //  day 2 running
  });

  it("no derived phase grants what the stored phase does not — over every state and every hour of a three-day workshop", () => {
    const states: SessionState[] = ["approved", "published", "in_progress", "completed", "archived", "cancelled"];
    for (const state of states) {
      for (let h = -2; h <= 53; h++) {
        expect(neverGrantsMoreThanStored(workshop(state), at(h)), `${state} @ ${h}h`).toBe(true);
      }
    }
  });
});

describe("betweenDays", () => {
  it("is false for one day and for none, by arithmetic", () => {
    for (let h = -2; h <= 5; h++) {
      expect(betweenDays([WED], at(h))).toBe(false);
      expect(betweenDays([], at(h))).toBe(false);
      expect(betweenDays(null, at(h))).toBe(false);
    }
  });
  it("is true only after one day has ended and before the next begins", () => {
    expect(betweenDays([WED, THU, FRI], at(-1))).toBe(false); // before everything
    expect(betweenDays([WED, THU, FRI], at(1))).toBe(false);
    expect(betweenDays([WED, THU, FRI], at(2))).toBe(true);
    expect(betweenDays([WED, THU, FRI], at(23.9))).toBe(true);
    expect(betweenDays([WED, THU, FRI], at(24))).toBe(false);
    expect(betweenDays([WED, THU, FRI], at(51))).toBe(false); // after everything
  });
});

describe("dayPhase", () => {
  it("upcoming → live → ended, on [start, end)", () => {
    expect(dayPhase(THU, at(23.9))).toBe("upcoming");
    expect(dayPhase(THU, at(24))).toBe("live");
    expect(dayPhase(THU, at(25.9))).toBe("live");
    expect(dayPhase(THU, at(26))).toBe("ended");
  });
});

describe("checkInDay — rule 1 of public.resolve_session_day(), and only rule 1", () => {
  it("the ceiling is the day's end + 2 h, exclusive (REQ-CHK-016)", () => {
    expect(CHECK_IN_CEILING_MS).toBe(2 * H);
    expect(checkInDay([WED, THU, FRI], at(-0.1))).toBeNull();
    expect(checkInDay([WED, THU, FRI], at(0))?.id).toBe("d1");
    expect(checkInDay([WED, THU, FRI], at(3.9))?.id).toBe("d1"); //  18:00–20:00, open to 22:00
    expect(checkInDay([WED, THU, FRI], at(4))).toBeNull(); //       ★ day 1 is shut while days 2 and 3 are still ahead
    expect(checkInDay([WED, THU, FRI], at(24))?.id).toBe("d2");
    expect(checkInDay([WED, THU, FRI], at(52))).toBeNull();
  });

  it("two days on one date whose windows overlap: the later-started", () => {
    const morning = day("am", 1, 0, 3); //    9–12, open to 14
    const afternoon = day("pm", 2, 4, 7); //  13–16
    expect(checkInDay([morning, afternoon], at(3.5))?.id).toBe("am");
    expect(checkInDay([morning, afternoon], at(4.5))?.id).toBe("pm"); // 13:30 — both windows hold it
  });

  it("one day: exactly the window a one-day session has today", () => {
    expect(checkInDay([WED], at(1))?.id).toBe("d1");
    expect(checkInDay([WED], at(3.99))?.id).toBe("d1");
    expect(checkInDay([WED], at(4))).toBeNull();
  });
});

describe("resolveDay — all three rules, the same table tests/rls/session-days.test.ts runs against the SQL function", () => {
  const d1 = day("d1", 1, 10, 12);
  const d2 = day("d2", 2, 34, 36);
  const table: [number, string | null][] = [
    [0, "d1"], //    nothing has begun: the first
    [10, "d1"], //   the floor is inclusive
    [13.9, "d1"], // inside day 1's + 2 h
    [14, "d1"], //   past the ceiling, and day 1 is still the latest begun
    [33, "d1"],
    [34, "d2"],
    [200, "d2"], //  long after: the latest day begun
  ];
  for (const [h, id] of table) {
    it(`now + ${h} h → ${id}`, () => expect(resolveDay([d1, d2], at(h))?.id ?? null).toBe(id));
  }
  it("no days → null", () => expect(resolveDay([], at(0))).toBeNull());
});
