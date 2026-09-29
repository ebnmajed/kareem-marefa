import type { CompanyBoardRow } from "@/lib/dal/leaderboards";

// The company race's bar lengths (wave 16, REQ-UIX-038, REQ-UIX-048) — one pure
// function, read by the board that draws the bars and by the DAL that records
// which length the member last saw, so the two can never disagree.

/** Each company's bar: its ranked value ÷ the leader's, in [0, 1]. A negative value, or no leader above zero, draws an empty track. */
export function companyFractions(rows: CompanyBoardRow[], metric: "total_points" | "points_per_active_member"): Map<string, number> {
  const valueOf = (r: CompanyBoardRow) => (metric === "total_points" ? r.totalPoints : (r.pointsPerActiveMember ?? 0));
  const leader = Math.max(0, ...rows.map(valueOf));
  return new Map(rows.map((r) => [r.companyId, leader > 0 ? Math.min(1, Math.max(0, valueOf(r) / leader)) : 0]));
}
