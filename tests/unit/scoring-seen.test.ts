// Wave 16 — when do moments 3 to 5 have an occurrence? (REQ-UIX-047, REQ-UIX-048, DEC-195 §2.6,
// DEC-197 §7.) The server decides from `member_seen_marks` (0162); these are its rules, pure.
// Every «no occurrence» branch is here, because a moment that plays when it should not is the defect.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const points = await import("@/lib/dal/points");
const boards = await import("@/lib/dal/leaderboards");
const { companyFractions } = await import("@/components/scoring/race-fractions");

const seen = (over: Partial<{ points_entry_id: string | null; points_total: number | null; level_id: string | null }> = {}) => ({
  points_entry_id: "e1",
  points_total: 680,
  level_id: "l3",
  ...over,
});

describe("decideCompletion — moment 3", () => {
  it("plays from the balance last seen to the new one, for an unseen completion row", () => {
    expect(points.decideCompletion(seen(), { entryId: "e2", total: 730 }, true)).toEqual({ occurrenceId: "e2", from: 680, to: 730, delta: 50 });
  });
  it("★ no mark yet — the first sight writes a baseline and plays nothing", () => {
    expect(points.decideCompletion(null, { entryId: "e2", total: 730 }, true)).toBeNull();
    expect(points.decideCompletion(seen({ points_total: null }), { entryId: "e2", total: 730 }, true)).toBeNull();
  });
  it("the same last entry — nothing new", () => {
    expect(points.decideCompletion(seen(), { entryId: "e1", total: 730 }, true)).toBeNull();
  });
  it("★ a net decrease, or no change, plays nothing", () => {
    expect(points.decideCompletion(seen(), { entryId: "e2", total: 600 }, true)).toBeNull();
    expect(points.decideCompletion(seen(), { entryId: "e2", total: 680 }, true)).toBeNull();
  });
  it("★ a gain with no completion row — a comment, a streak, a manual adjustment — plays nothing (D-25)", () => {
    expect(points.decideCompletion(seen(), { entryId: "e2", total: 730 }, false)).toBeNull();
  });
  it("no ledger at all plays nothing", () => {
    expect(points.decideCompletion(seen(), { entryId: null, total: 0 }, true)).toBeNull();
  });
  it("the completion pass's sources are the four it writes", () => {
    expect([...points.COMPLETION_SOURCES]).toEqual(["check_in", "proposal_accepted", "session_delivered", "attendee_bonus"]);
  });
});

describe("decideLevelUp — moment 4", () => {
  it("a level last seen, left for a higher one", () => {
    expect(points.decideLevelUp({ id: "l3", tier: 3 }, { id: "l4", tier: 4 })).toBe(true);
  });
  it("★ the first level a member is given is where they start, not a promotion", () => {
    expect(points.decideLevelUp(null, { id: "l1", tier: 1 })).toBe(false);
  });
  it("the same level, a lower one, or none", () => {
    expect(points.decideLevelUp({ id: "l3", tier: 3 }, { id: "l3", tier: 3 })).toBe(false);
    expect(points.decideLevelUp({ id: "l3", tier: 3 }, { id: "l2", tier: 2 })).toBe(false);
    expect(points.decideLevelUp({ id: "l3", tier: 3 }, null)).toBe(false);
  });
});

describe("levelProgress — the bar's truth (D-26)", () => {
  it("points into the level held, out of the level's span", () => {
    expect(points.levelProgress(730, { threshold: 700 }, { threshold: 1500 })).toEqual({ value: 30, max: 800 });
  });
  it("full at the top; clamped at both ends; nothing with no level", () => {
    expect(points.levelProgress(2000, { threshold: 1500 }, null)).toEqual({ value: 1, max: 1 });
    expect(points.levelProgress(1600, { threshold: 700 }, { threshold: 1500 })).toEqual({ value: 800, max: 800 });
    expect(points.levelProgress(650, { threshold: 700 }, { threshold: 1500 })).toEqual({ value: 0, max: 800 });
    expect(points.levelProgress(10, null, null)).toBeNull();
  });
});

const marks = (over: Record<string, unknown> = {}) => ({
  all_time_rank: 5,
  monthly_period: "2026-09-01",
  monthly_rank: 5,
  company_period: "2026-09-01",
  company_id: "c1",
  company_rank: 3,
  company_fraction: "0.5",
  ...over,
});
const allTime = (rank: number | null) => ({ board: "all_time" as const, period: null, rank, companyId: null, fraction: null });
const monthly = (rank: number | null, period = "2026-09-01") => ({ board: "monthly" as const, period, rank, companyId: null, fraction: null });
const company = (rank: number | null, fraction: number | null, companyId = "c1", period = "2026-09-01") => ({ board: "company" as const, period, rank, companyId, fraction });

describe("decideBoardMoment — moment 5", () => {
  it("a rise since the last view is an occurrence, with the rank last seen", () => {
    const m = boards.decideBoardMoment("all_time", marks(), allTime(4));
    expect(m.occurrenceId).toBe("all_time:all:5-4");
    expect(m.seenRank).toBe(5);
    expect(m.needsMark).toBe(true);
  });
  it("★★ a fall, a tie — no occurrence; the mark moves on", () => {
    for (const rank of [6, 5]) {
      const m = boards.decideBoardMoment("all_time", marks(), allTime(rank));
      expect(m.occurrenceId).toBeNull();
      expect(m.seenRank).toBeNull();
    }
    expect(boards.decideBoardMoment("all_time", marks(), allTime(5)).needsMark).toBe(false);
  });
  it("★ no mark at all — the baseline, silently", () => {
    const m = boards.decideBoardMoment("all_time", null, allTime(1));
    expect(m).toMatchObject({ occurrenceId: null, needsMark: true });
  });
  it("★ a new month is not comparable with the last", () => {
    expect(boards.decideBoardMoment("monthly", marks(), monthly(1, "2026-10-01")).occurrenceId).toBeNull();
    expect(boards.decideBoardMoment("monthly", marks(), monthly(2)).occurrenceId).toBe("monthly:2026-09-01:5-2");
  });
  it("the member off the board has nothing to compare", () => {
    expect(boards.decideBoardMoment("all_time", marks(), allTime(null)).occurrenceId).toBeNull();
  });
  it("the company: a rise, or a longer bar, is an occurrence; a shorter one or another company is not", () => {
    const rose = boards.decideBoardMoment("company", marks(), company(2, 0.5));
    expect(rose.occurrenceId).not.toBeNull();
    expect(rose).toMatchObject({ seenRank: 3, seenFraction: null });
    const grew = boards.decideBoardMoment("company", marks(), company(3, 0.7));
    expect(grew).toMatchObject({ seenRank: null, seenFraction: 0.5 });
    expect(grew.occurrenceId).not.toBeNull();
    expect(boards.decideBoardMoment("company", marks(), company(3, 0.4)).occurrenceId).toBeNull();
    expect(boards.decideBoardMoment("company", marks(), company(1, 0.9, "c2")).occurrenceId).toBeNull();
  });
});

describe("companyFractions", () => {
  it("each value over the leader's; a negative value or no leader draws an empty track", () => {
    const row = (id: string, total: number, per: number | null) => ({ companyId: id, companyName: id, rank: 1, totalPoints: total, pointsPerActiveMember: per });
    const f = companyFractions([row("a", 400, 10), row("b", 100, 5), row("c", -20, null)], "total_points");
    expect([...f.values()]).toEqual([1, 0.25, 0]);
    expect([...companyFractions([row("a", -1, null)], "total_points").values()]).toEqual([0]);
    expect(companyFractions([row("a", 400, 10), row("b", 100, 5)], "points_per_active_member").get("b")).toBe(0.5);
  });
});
