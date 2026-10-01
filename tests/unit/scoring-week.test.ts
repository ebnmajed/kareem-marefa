// Wave 18 — the member's week, its pure rules (REQ-UIX-055, DEC-206 §4.47 – §4.52, DEC-207 §1).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const points = await import("@/lib/dal/points");
const boards = await import("@/lib/dal/leaderboards");
const recognition = await import("@/lib/dal/recognition");
const { monthName } = await import("@/components/scoring/week-format");

const snap = (over: Partial<{ period_start: string; period_end: string; is_final: boolean; taken_at: string }> = {}) => ({
  period_start: "2026-09-01",
  period_end: "2026-10-01",
  is_final: false,
  taken_at: "2026-09-04T00:05:00Z",
  ...over,
});

describe("weekPeriod — the snapshot's own month, and the days left in it", () => {
  it("counts the whole days after today until the period's end", () => {
    expect(boards.weekPeriod(snap(), new Date("2026-09-04T12:00:00Z")).daysLeft).toBe(26);
  });
  it("the last day is 0 — «ينتهي اليوم»; the day before is 1 — «غدًا»", () => {
    expect(boards.weekPeriod(snap(), new Date("2026-09-30T20:00:00Z")).daysLeft).toBe(0);
    expect(boards.weekPeriod(snap(), new Date("2026-09-29T20:00:00Z")).daysLeft).toBe(1);
  });
  it("★ the month closes at its UTC midnight — 03:00 in Riyadh on the 1st, as the job computes it (0042)", () => {
    expect(boards.weekPeriod(snap(), new Date("2026-09-30T23:59:00Z")).daysLeft).toBe(0);
  });
  it("a stale provisional after its end is clamped to 0, never negative", () => {
    expect(boards.weekPeriod(snap(), new Date("2026-10-02T00:00:00Z")).daysLeft).toBe(0);
  });
  it("a final snapshot has no days left — null, never 0", () => {
    const p = boards.weekPeriod(snap({ period_start: "2026-08-01", period_end: "2026-09-01", is_final: true }), new Date("2026-09-01T09:00:00Z"));
    expect(p).toEqual({ start: "2026-08-01", end: "2026-09-01", isFinal: true, takenAt: "2026-09-04T00:05:00Z", daysLeft: null });
  });
});

describe("raceRows — the leaders, then the own company", () => {
  const row = (rank: number, isOwn = false) => ({ companyId: `c${rank}`, companyName: `شركة ${rank}`, teamColor: null, rank, totalPoints: 100 - rank, pointsPerActiveMember: null, fraction: 1 / rank, isOwn });
  it("two leaders and the own below them (the phone)", () => {
    expect(boards.raceRows([row(1), row(2), row(3), row(4, true)], 2).map((r) => r.rank)).toEqual([1, 2, 4]);
  });
  it("the own among the leaders is not repeated", () => {
    expect(boards.raceRows([row(1), row(2, true), row(3)], 2).map((r) => r.rank)).toEqual([1, 2]);
  });
  it("four leaders on desktop, and no own company at all", () => {
    expect(boards.raceRows([row(1), row(2), row(3), row(4), row(5)], 4).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("fewer companies than leaders", () => {
    expect(boards.raceRows([row(1, true)], 4).map((r) => r.rank)).toEqual([1]);
  });
});

describe("weekPointsMark — ★★ the level last seen is passed through (DEC-207 §1.3)", () => {
  const held = { id: "l3", tier: 3, name: "صاحب أثر", threshold: 300, unlocks: [] };
  it("a level-up unseen: the week writes the OLD level, so SCR-022's card still turns", () => {
    const { mark } = points.weekPointsMark({
      mark: { entryId: "e2", total: 730, levelId: "l4" },
      levelUp: { occurrenceId: "l4", held },
      seen: { entryId: "e1", total: 680, levelId: "l3" },
    });
    expect(mark).toEqual({ entryId: "e2", total: 730, levelId: "l3" });
  });
  it("with the level-up unseen and the points already seen, nothing needs writing — the home does not write every visit", () => {
    expect(
      points.weekPointsMark({ mark: { entryId: "e2", total: 730, levelId: "l4" }, levelUp: { occurrenceId: "l4", held }, seen: { entryId: "e2", total: 730, levelId: "l3" } }).needsMark,
    ).toBe(false);
  });
  it("no level-up: the level held — the same as SCR-022 writes", () => {
    const { mark, needsMark } = points.weekPointsMark({ mark: { entryId: "e2", total: 730, levelId: "l3" }, levelUp: null, seen: { entryId: "e1", total: 680, levelId: "l3" } });
    expect(mark.levelId).toBe("l3");
    expect(needsMark).toBe(true);
  });
  it("no mark at all: a baseline, with the level held — the first level is where a member starts", () => {
    expect(points.weekPointsMark({ mark: { entryId: "e1", total: 20, levelId: "l1" }, levelUp: null, seen: null })).toEqual({
      mark: { entryId: "e1", total: 20, levelId: "l1" },
      needsMark: true,
    });
  });
});

describe("newestFirst — the feed's order", () => {
  it("by awardedAt, and by id among rows one evaluation wrote at the same instant", () => {
    const at = "2026-09-30T02:00:00Z";
    const items = [
      { id: "a", awardedAt: at },
      { id: "c", awardedAt: at },
      { id: "z", awardedAt: "2026-09-29T02:00:00Z" },
      { id: "b", awardedAt: at },
    ];
    expect(recognition.newestFirst(items).map((i) => i.id)).toEqual(["c", "b", "a", "z"]);
  });
});

describe("monthName — the snapshot's month, in UTC and Latin digits", () => {
  it("names the month of a period's start, whatever the process's zone", () => {
    expect(monthName("2026-09-01")).toBe("سبتمبر");
    expect(monthName("2026-12-01", "en")).toBe("December");
  });
});

describe("presenterNet — a presenter's award, the ledger's net (wave 18 PR B, sessions' S3)", () => {
  const row = (id: string, amount: number, source: string, source_id: string | null = null, occurred_at = "2026-09-30T18:00:00Z") => ({ id, amount, source, source_id, occurred_at });
  it("session_delivered plus the attendee bonus, at the latest of the two", () => {
    expect(points.presenterNet([row("a", 100, "session_delivered"), row("b", 30, "attendee_bonus", null, "2026-09-30T18:05:00Z")])).toEqual({ points: 130, paidAt: "2026-09-30T18:05:00Z" });
  });
  it("★ a presenter removed after completion is reversed — nothing to draw, never «+0»", () => {
    expect(points.presenterNet([row("a", 100, "session_delivered"), row("r", -100, "reversal", "a")])).toBeNull();
  });
  it("a reversal of another row does not count against the presenter's award", () => {
    expect(points.presenterNet([row("a", 100, "session_delivered"), row("r", -20, "reversal", "someone-else")])?.points).toBe(100);
  });
  it("no presenter row: null", () => {
    expect(points.presenterNet([])).toBeNull();
  });
});
