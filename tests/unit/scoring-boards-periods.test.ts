// Wave 20, PR B — the boards' pure parts (REQ-UIX-078, REQ-UIX-079, DEC-219 §2 as corrected). ★ The quarter's company
// snapshot never shows as the month's — the rule both `getLeaderboards()` and `getCompanyRace()` read through
// `latestMonthly()`; «N نشطًا» recovered exactly from the frozen pair; the quarter and its round.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { isMonthPeriod, isQuarterPeriod, latestMonthly, derivedActive, quarterOf, boardPlace } = await import("@/lib/dal/leaderboards");

describe("a snapshot's period", () => {
  it("a calendar month, and the year's turn", () => {
    expect(isMonthPeriod("2026-09-01", "2026-10-01")).toBe(true);
    expect(isMonthPeriod("2026-12-01", "2027-01-01")).toBe(true);
    expect(isMonthPeriod("2026-10-01", "2027-01-01")).toBe(false);
    expect(isMonthPeriod(null, null)).toBe(false);
  });

  it("a calendar quarter — and a month is not one", () => {
    expect(isQuarterPeriod("2026-10-01", "2027-01-01")).toBe(true);
    expect(isQuarterPeriod("2026-07-01", "2026-10-01")).toBe(true);
    expect(isQuarterPeriod("2026-08-01", "2026-11-01")).toBe(false);
    expect(isQuarterPeriod("2026-10-01", "2026-11-01")).toBe(false);
  });

  it("★ getLeaderboards(): the quarter taken after the month that night is never «the newest» month", () => {
    const rows = [
      { id: "q", period_start: "2026-10-01", period_end: "2027-01-01" },
      { id: "m", period_start: "2026-10-01", period_end: "2026-11-01" },
      { id: "old", period_start: "2026-09-01", period_end: "2026-10-01" },
    ];
    expect(latestMonthly(rows)?.id).toBe("m");
  });

  it("★ getCompanyRace(): with only a quarter on hand, there is no month — null, never the quarter", () => {
    expect(latestMonthly([{ id: "q", period_start: "2026-10-01", period_end: "2027-01-01" }])).toBeNull();
  });
});

describe("«N نشطًا» — the frozen pair", () => {
  it("★ recovers the count exactly from the ratio as Postgres stores it (16 fractional digits, measured)", () => {
    expect(derivedActive(170, "9.4444444444444444")).toBe(18);
    expect(derivedActive(7, "2.3333333333333333")).toBe(3);
    expect(derivedActive(-25, "-3.5714285714285714")).toBe(7);
    expect(derivedActive(99999, "10.0269728266319061")).toBe(9973);
  });

  it("draws nothing when either is missing or zero — never a guess", () => {
    expect(derivedActive(0, "1")).toBeNull();
    expect(derivedActive(10, null)).toBeNull();
    expect(derivedActive(10, "0")).toBeNull();
  });
});

describe("the quarter and its round", () => {
  it("Q4 2026, the month within it", () => {
    expect(quarterOf("2026-10-01", "2026-10-15")).toEqual({ quarter: 4, year: 2026, round: 1 });
    expect(quarterOf("2026-10-01", "2026-12-31")).toEqual({ quarter: 4, year: 2026, round: 3 });
    expect(quarterOf("2026-07-01", "2026-08-02")).toEqual({ quarter: 3, year: 2026, round: 2 });
  });

  it("never beyond three — a final quarter read in the next is its third round", () => {
    expect(quarterOf("2026-07-01", "2026-10-02").round).toBe(3);
  });
});

describe("boardPlace", () => {
  const row = (memberId: string, rank: number, points: number, isSelf = false) => ({ memberId, displayName: memberId, rank, points, isSelf, company: null, teamColor: null });
  it("the viewer's rank and points, and the visible row above with strictly more points", () => {
    expect(boardPlace([row("a", 1, 210), row("b", 2, 160), row("c", 2, 160), row("me", 4, 130, true)])).toEqual({ rank: 4, points: 130, above: { displayName: expect.stringMatching(/^[bc]$/), gap: 30 } });
  });
  it("first place has nobody above; not ranked is null", () => {
    expect(boardPlace([row("me", 1, 10, true)])).toEqual({ rank: 1, points: 10, above: null });
    expect(boardPlace([row("a", 1, 10)])).toBeNull();
  });
});
