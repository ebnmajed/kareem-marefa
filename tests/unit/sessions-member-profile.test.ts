// SCR-020's tiering is a DAL guarantee (REQ-PRF-004, A33, DEC-141 ruling 4) —
// so it is tested at the DAL, not through the page. What must hold:
//
//   · only an ADMIN viewer causes `admin_member_profile()` to be called, and
//     only the admin tier carries the admin record — a moderator is the member
//     tier (A33);
//   · an opted-out member's points and rank are withheld from the member tier,
//     and shown to themselves and to an admin (DEC-141 ruling 5);
//   · the current streak counts consecutive months ending this month or last.
//
// Supabase is a stub that answers by table; the database's own gates are
// proven in `tests/rls/sessions-member-profile.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const MEMBER = "00000000-0000-4000-8000-000000000011";
const VIEWER = "00000000-0000-4000-8000-000000000022";

const state = { role: "member" as "admin" | "moderator" | "member", memberId: VIEWER, optOut: false, rpcCalls: [] as string[] };

/** A chainable query stub: every filter returns itself; awaiting it (or `.maybeSingle()`) yields the table's canned answer. */
function query(table: string) {
  const answer = () => {
    switch (table) {
      case "members_member_view":
        return { data: { id: MEMBER, display_name: "ريم العتيبي", avatar_url: null, company_id: null, job_title: "محلّلة", bio: null, org_role: "member", created_at: "2026-01-01T00:00:00Z" }, error: null };
      case "members":
        return { data: { leaderboard_opt_out: state.optOut }, error: null };
      case "points_balances":
        return { data: { total_points: 140, levels: { name: "مستكشف" } }, error: null };
      case "org_settings":
        return { data: { time_zone: "Asia/Riyadh" }, error: null };
      default:
        return { data: [], error: null };
    }
  };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit", "neq"]) chain[method] = () => chain;
  chain.maybeSingle = async () => answer();
  chain.then = (resolve: (v: unknown) => unknown) => resolve(answer());
  return chain;
}

const supabase = {
  from: (table: string) => query(table),
  rpc: async (name: string) => {
    state.rpcCalls.push(name);
    if (name === "all_time_leaderboard") return { data: [{ member_id: MEMBER, rank: 3, total_points: 140 }], error: null };
    if (name === "admin_member_profile")
      return { data: [{ email: "reem@kareem.example", attended_count: 2, attended: [], no_show_count: 1, late_cancel_count: 0 }], error: null };
    return { data: null, error: null };
  },
};

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: state.memberId, orgId: "org", role: state.role }, supabase }),
}));

const { getMemberProfileForViewer } = await import("@/lib/dal/members");
const { currentStreak } = await import("@/lib/dal/recognition");

beforeEach(() => {
  state.role = "member";
  state.memberId = VIEWER;
  state.optOut = false;
  state.rpcCalls = [];
});

describe("getMemberProfileForViewer — the tier is decided in the DAL", () => {
  it("a member viewer gets the member tier, and admin_member_profile() is never called", async () => {
    const view = await getMemberProfileForViewer("ar", MEMBER);
    expect(view?.tier).toBe("member");
    expect(view?.adminRecord).toBeNull();
    expect(JSON.stringify(view)).not.toContain("@");
    expect(state.rpcCalls).not.toContain("admin_member_profile");
  });

  it("★ a moderator is the member tier too (A33)", async () => {
    state.role = "moderator";
    const view = await getMemberProfileForViewer("ar", MEMBER);
    expect(view?.tier).toBe("member");
    expect(view?.adminRecord).toBeNull();
    expect(state.rpcCalls).not.toContain("admin_member_profile");
  });

  it("an admin gets the admin record, from the function", async () => {
    state.role = "admin";
    const view = await getMemberProfileForViewer("ar", MEMBER);
    expect(view?.tier).toBe("admin");
    expect(view?.adminRecord).toEqual({ email: "reem@kareem.example", attendedCount: 2, attended: [], noShowCount: 1, lateCancelCount: 0 });
  });

  it("the member reading their own profile is the self tier, with no admin record", async () => {
    state.memberId = MEMBER;
    const view = await getMemberProfileForViewer("ar", MEMBER);
    expect(view?.tier).toBe("self");
    expect(view?.adminRecord).toBeNull();
  });
});

describe("getMemberProfileForViewer — an opted-out member (DEC-141 ruling 5)", () => {
  it("withholds points and rank from the member tier", async () => {
    state.optOut = true;
    expect((await getMemberProfileForViewer("ar", MEMBER))?.standing).toBeNull();
  });

  it("still shows them to the member themselves and to an admin", async () => {
    state.optOut = true;
    state.memberId = MEMBER;
    expect((await getMemberProfileForViewer("ar", MEMBER))?.standing?.totalPoints).toBe(140);
    state.memberId = VIEWER;
    state.role = "admin";
    expect((await getMemberProfileForViewer("ar", MEMBER))?.standing).toEqual({ totalPoints: 140, rank: 3, levelName: "مستكشف" });
  });
});

describe("currentStreak", () => {
  const now = new Date("2026-09-16T09:00:00Z");
  it("counts consecutive months ending this month", () => {
    expect(currentStreak(["2026-09-01", "2026-08-01", "2026-07-01", "2026-05-01"], now)).toBe(3);
  });
  it("still counts a run that ended last month — this month's award may not have been made yet", () => {
    expect(currentStreak(["2026-08-01", "2026-07-01"], now)).toBe(2);
  });
  it("is zero once the run has broken", () => {
    expect(currentStreak(["2026-07-01", "2026-06-01"], now)).toBe(0);
    expect(currentStreak([], now)).toBe(0);
  });
});
