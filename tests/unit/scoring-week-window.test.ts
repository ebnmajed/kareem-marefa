// Wave 20 — contract 4's pure parts (REQ-UIX-078, DEC-216 §2.2, DEC-217 §3.4): the days left in the org's week,
// the caller's place and the neighbour above, and moment 5's rule on the weekly pair (0169).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { weekDaysLeft, weekPlace, decideBoardMoment, WEEKLY_MARK_WRITABLE } = await import("@/lib/dal/leaderboards");

describe("weekDaysLeft — counted in the org's own calendar", () => {
  it("is 0 on the Friday, 6 on the Saturday", () => {
    // Friday 2026-10-02 23:00 in Riyadh is 20:00 UTC.
    expect(weekDaysLeft("2026-10-02", "Asia/Riyadh", new Date("2026-10-02T20:00:00Z"))).toBe(0);
    // Saturday 2026-10-03 00:30 in Riyadh is still Friday in UTC — the org's day wins.
    expect(weekDaysLeft("2026-10-09", "Asia/Riyadh", new Date("2026-10-02T21:30:00Z"))).toBe(6);
  });

  it("never goes below 0", () => {
    expect(weekDaysLeft("2026-10-02", "Asia/Riyadh", new Date("2026-10-05T12:00:00Z"))).toBe(0);
  });
});

describe("weekPlace", () => {
  const rows = [
    { memberId: "a", rank: 1, points: 210 },
    { memberId: "b", rank: 2, points: 160 },
    { memberId: "c", rank: 2, points: 160 },
    { memberId: "me", rank: 4, points: 130 },
  ];

  it("names the caller's rank, points and how many the week ranks", () => {
    expect(weekPlace(rows, "me")).toMatchObject({ rank: 4, points: 130, ranked: 4 });
  });

  it("★ the neighbour above has STRICTLY more points — the gap is never 0", () => {
    const place = weekPlace(rows, "me")!;
    expect(place.gap).toBe(30);
    expect(["b", "c"]).toContain(place.aboveId);
    const tied = weekPlace(rows, "c")!;
    expect(tied.aboveId).toBe("a");
    expect(tied.gap).toBe(50);
  });

  it("first place has nobody above", () => {
    expect(weekPlace(rows, "a")).toMatchObject({ aboveId: null, gap: 0 });
  });

  it("★ no row is an ABSENCE — null, never a zero rank", () => {
    expect(weekPlace(rows, "nobody")).toBeNull();
  });
});

describe("moment 5 on the week — decideBoardMoment('weekly', …)", () => {
  const seen = (period: string | null, rank: number | null) => ({
    all_time_rank: null,
    monthly_period: null,
    monthly_rank: null,
    company_period: null,
    company_id: null,
    company_rank: null,
    company_fraction: null,
    weekly_period: period,
    weekly_rank: rank,
  });
  const now = (rank: number | null) => ({ board: "weekly" as const, period: "2026-09-26", rank, companyId: null, fraction: null });

  it("a rise within the same week is an occurrence, keyed by the week", () => {
    const m = decideBoardMoment("weekly", seen("2026-09-26", 6), now(4));
    expect(m.occurrenceId).toBe("weekly:2026-09-26:6-4");
    expect(m.seenRank).toBe(6);
  });

  it("★ last week's rank is never compared with this week's", () => {
    expect(decideBoardMoment("weekly", seen("2026-09-19", 9), now(4)).occurrenceId).toBeNull();
  });

  it("a fall and a first visit are the static state", () => {
    expect(decideBoardMoment("weekly", seen("2026-09-26", 2), now(4)).occurrenceId).toBeNull();
    expect(decideBoardMoment("weekly", null, now(4)).occurrenceId).toBeNull();
  });

  // ★ wave 20, PR B (DEC-217 §3.3, the ledger line the lead named): `mark_board_seen()` learns the week, so the surfaces
  // write the weekly pair. In PR A this read `false`.
  it("★ PR B: the weekly mark has its writer, so the surfaces write it", () => {
    expect(WEEKLY_MARK_WRITABLE).toBe(true);
  });
});
