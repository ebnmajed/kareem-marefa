// SCR-020's wave-19 fields are a DAL guarantee (REQ-UIX-069, A33, DEC-213 §5.114 – §5.121, DEC-214) — at the DAL:
//
//   · ★ an opted-out member's LEVEL still reaches a colleague; the balance, the month's rank and the progress line
//     do not (DEC-141 r5, §5.116) — and the member and an admin get the balance;
//   · ★ an average is read for the self and admin tiers only — `session_rating_aggregates` is never queried for a
//     colleague, a moderator included (A33, §5.115);
//   · ★ the presented figure is contract 4's COUNT (delivered sessions), never the rows' length (§5.120);
//   · the month's rank is the member's row in the latest monthly snapshot; «N من M»'s M is the org's live badges.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const MEMBER = "00000000-0000-4000-8000-000000000011";
const VIEWER = "00000000-0000-4000-8000-000000000022";
const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";

const state = { role: "member" as "admin" | "moderator" | "member", memberId: VIEWER, optOut: false, tables: [] as string[] };

function answer(table: string): { data: unknown; count?: number } {
  switch (table) {
    case "members_member_view":
      return { data: { id: MEMBER, display_name: "ريم العتيبي", avatar_version: null, company_id: "c1", job_title: "محلّلة", bio: null, org_role: "member", created_at: "2026-01-01T00:00:00Z" } };
    case "members":
      return { data: { leaderboard_opt_out: state.optOut } };
    case "companies":
      return { data: { name: "الشركة الأولى", team_color: "#35d0ff" } };
    case "points_balances":
      return { data: { total_points: 140, current_level_id: "L2", levels: { name: "مشارِك نشِط" } } };
    case "levels":
      return {
        data: [
          { id: "L1", name: "مشارِك", threshold_points: 0, sort_order: 1 },
          { id: "L2", name: "مشارِك نشِط", threshold_points: 100, sort_order: 2 },
          { id: "L3", name: "صاحب أثر", threshold_points: 300, sort_order: 3 },
        ],
      };
    case "leaderboard_snapshots":
      return { data: { id: "snap" } };
    case "leaderboard_entries":
      return { data: { rank: 4 } };
    case "badges":
      return { data: null, count: 8 };
    case "session_presenters":
      return { data: [{ session_id: S1 }, { session_id: S2 }] };
    case "sessions":
      // The list read and the count read share a table: a list for one, a count of 7 for the other.
      return {
        data: [
          { id: S1, title: "جلسة منتهية", state: "completed", starts_at: "2026-09-01T15:00:00Z", ends_at: "2026-09-01T16:00:00Z", duration_minutes: 60, time_zone: null, session_days: [] },
          { id: S2, title: "جلسة قادمة", state: "published", starts_at: "2026-10-20T15:00:00Z", ends_at: "2026-10-20T16:00:00Z", duration_minutes: 60, time_zone: null, session_days: [] },
        ],
        count: 7,
      };
    case "session_rating_aggregates":
      return { data: { rating_count: 5, session_avg: 4.2, presenter_avg: 4.8, comments: [] } };
    case "photos":
      return { data: [], count: 9 };
    case "org_settings":
      return { data: { time_zone: "Asia/Riyadh" } };
    default:
      return { data: [] };
  }
}

function query(table: string) {
  state.tables.push(table);
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit", "neq", "not", "gt", "lt"]) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ ...answer(table), error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ ...answer(table), error: null });
  return chain;
}

const supabase = {
  from: (table: string) => query(table),
  rpc: async (name: string) => {
    if (name === "all_time_leaderboard") return { data: state.optOut && state.memberId !== MEMBER ? [] : [{ member_id: MEMBER, rank: 3, total_points: 140 }], error: null };
    if (name === "session_attendance_count") return { data: 34, error: null };
    if (name === "admin_member_profile") return { data: [{ email: "reem@kareem.example", attended_count: 0, attended: [], no_show_count: 0, late_cancel_count: 0 }], error: null };
    return { data: null, error: null };
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
};

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: state.memberId, orgId: "org", role: state.role }, supabase }),
}));

const { getMemberProfileForViewer } = await import("@/lib/dal/members");

beforeEach(() => {
  state.role = "member";
  state.memberId = VIEWER;
  state.optOut = false;
  state.tables = [];
});

describe("the profile's standing (wave 19)", () => {
  it("the level, the bar toward the next, the month's rank, the team colour", async () => {
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.level).toEqual({ tier: 2, name: "مشارِك نشِط" });
    expect(view.progress).toEqual({ value: 140, max: 300, remaining: 160, next: "صاحب أثر" });
    expect(view.monthRank).toBe(4);
    expect(view.company).toEqual({ id: "c1", name: "الشركة الأولى", teamColor: "#35d0ff" });
    expect(view.badgeCatalogue).toBe(8);
  });

  it("★ opted out, to a colleague: the level still shows; the balance, the month's rank and the line do not", async () => {
    state.optOut = true;
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.level).toEqual({ tier: 2, name: "مشارِك نشِط" });
    expect(view.standing).toBeNull();
    expect(view.monthRank).toBeNull();
    expect(view.progress).toBeNull();
    expect(JSON.stringify(view)).not.toContain("140");
  });

  it("opted out, to themselves: every figure", async () => {
    state.optOut = true;
    state.memberId = MEMBER;
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.standing?.totalPoints).toBe(140);
    expect(view.monthRank).toBe(4);
    expect(view.progress).not.toBeNull();
  });
});

describe("the sessions presented (contract 4)", () => {
  it("★ the figure is the delivered COUNT, not the rows' length", async () => {
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.presentedCount).toBe(7);
    expect(view.presentedRows).toHaveLength(2);
    expect(view.presentedRows[0].attendedCount).toBe(34);
    expect(view.presentedRows[1].attendedCount).toBeNull();
  });

  it("★ a colleague: no average, and the aggregates are never read", async () => {
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.presentedRows.every((r) => r.average === null)).toBe(true);
    expect(state.tables).not.toContain("session_rating_aggregates");
  });

  it("★ a moderator is a colleague here too (A33)", async () => {
    state.role = "moderator";
    await getMemberProfileForViewer("ar", MEMBER);
    expect(state.tables).not.toContain("session_rating_aggregates");
  });

  it("the member themselves and an admin: the average of a held session, and none for one on the schedule", async () => {
    state.memberId = MEMBER;
    const self = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(self.presentedRows.map((r) => r.average)).toEqual([4.8, null]);
    state.memberId = VIEWER;
    state.role = "admin";
    const admin = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(admin.presentedRows.map((r) => r.average)).toEqual([4.8, null]);
  });
});

describe("the photos uploaded (contract 3)", () => {
  it("the count is the count", async () => {
    const view = (await getMemberProfileForViewer("ar", MEMBER))!;
    expect(view.photos).toEqual({ count: 9, photos: [] });
  });
});
