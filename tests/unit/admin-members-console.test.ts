// SCR-049's read (`listMembersForConsole`, wave 22). ★ The level a member holds is the one the nightly evaluation stored,
// and — for a member it has not reached (no balance row, or none stored) — the one their balance meets: level 1 starts
// at 0, so a new member is «مشارِك», never «—» (the lead's finding at the 1280 capture). Every read is paged.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORG = "org";
const tables: Record<string, Record<string, unknown>[]> = {
  members: [
    { id: "m1", avatar_version: null },
    { id: "m2", avatar_version: null },
    { id: "m3", avatar_version: null },
  ],
  companies: [],
  points_balances: [
    { member_id: "m1", total_points: 1240, current_level_id: "l3" },
    { member_id: "m2", total_points: 310, current_level_id: null },
  ],
  levels: [
    { id: "l1", name: "مشارِك", threshold_points: 0 },
    { id: "l2", name: "مشارِك نشِط", threshold_points: 200 },
    { id: "l3", name: "كريم معرفة", threshold_points: 1000 },
  ],
};
const roster = [
  { id: "m1", email: "a@x", display_name: "أ", company_id: null, job_title: null, org_role: "admin", status: "active", deactivated_at: null, deactivated_reason: null, created_at: "2026-01-01" },
  { id: "m2", email: "b@x", display_name: "ب", company_id: null, job_title: null, org_role: "member", status: "active", deactivated_at: null, deactivated_reason: null, created_at: "2026-01-01" },
  { id: "m3", email: "c@x", display_name: "ت", company_id: null, job_title: null, org_role: "member", status: "active", deactivated_at: null, deactivated_reason: null, created_at: "2026-01-01" },
];

function builder(rows: Record<string, unknown>[]) {
  const q = { select: () => q, eq: () => q, order: () => q, range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) };
  return q;
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { role: "admin", orgId: ORG },
    supabase: { from: (t: string) => builder(tables[t] ?? []), rpc: () => builder(roster) },
  }),
}));

const { listMembersForConsole } = await import("@/lib/dal/admin-members");

describe("listMembersForConsole — the level", () => {
  it("the stored level when there is one; the level the balance meets when there is none; level 1 at 0 points", async () => {
    const data = (await listMembersForConsole("ar", { q: "", company: null, role: null, page: 1 }))!;
    const level = Object.fromEntries(data.rows.map((r) => [r.id, r.levelName]));
    expect(level).toEqual({ m1: "كريم معرفة", m2: "مشارِك نشِط", m3: "مشارِك" });
    expect(data.rows.find((r) => r.id === "m3")?.points).toBe(0);
  });
});
