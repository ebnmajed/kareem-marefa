// Contract 3 (wave 21, `DEC-227`, `DEC-228` §3.2): `getAdminAttention()` — the
// one read behind the dashboard's «يحتاج انتباهك» tiles and the console rail's
// badges (`REQ-UIX-084`, `REQ-UIX-086`). The stub filters for real, so a
// predicate that drifts from the dashboard's own reads a row it must not.
import { describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ab";
const ME = "00000000-0000-4000-8000-0000000000dd";

const state: { role: string; client: ReturnType<typeof memorySupabase> } = { role: "admin", client: memorySupabase({}) };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: state.role }, supabase: state.client }),
}));

const { getAdminAttention, getAdminDashboardData, UNSCHEDULED_SESSIONS_HREF } = await import("@/lib/dal/admin-dashboard");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString();

function world() {
  state.client = memorySupabase({
    proposals: [
      { org_id: ORG, state: "submitted", created_at: daysAgo(6) },
      { org_id: ORG, state: "in_review", created_at: daysAgo(1) },
      { org_id: ORG, state: "draft", created_at: daysAgo(30) }, // not awaiting a decision
      { org_id: ORG, state: "approved", created_at: daysAgo(20) },
      { org_id: OTHER_ORG, state: "submitted", created_at: daysAgo(40) },
    ],
    sessions: [
      { org_id: ORG, state: "approved", starts_at: null, created_at: daysAgo(2) },
      { org_id: ORG, state: "draft", starts_at: null, created_at: daysAgo(3) },
      { org_id: ORG, state: "cancelled", starts_at: null, created_at: daysAgo(50) }, // excluded
      { org_id: ORG, state: "archived", starts_at: null, created_at: daysAgo(60) }, // excluded
      { org_id: ORG, state: "published", starts_at: daysAgo(-3), created_at: daysAgo(10) }, // dated
    ],
    reports: [
      { org_id: ORG, target: "photo", status: "open", created_at: daysAgo(0) },
      { org_id: ORG, target: "photo", status: "resolved", created_at: daysAgo(9) },
      { org_id: ORG, target: "comment", status: "open", created_at: daysAgo(3) },
      { org_id: ORG, target: "comment", status: "open", created_at: daysAgo(1) },
    ],
    rsvps: [],
    check_ins: [],
    members: [],
    points_ledger: [],
    session_presenters: [],
  });
}

describe("getAdminAttention — contract 3", () => {
  it("gives an admin the four queues in the artboard's order, each counted, aged and linked to its queue", async () => {
    state.role = "admin";
    world();
    const a = await getAdminAttention("ar");
    expect(a?.items).toEqual([
      { queue: "proposals", navKey: "proposals", count: 2, oldestAgeDays: 6, href: "/app/admin/proposals" },
      { queue: "unscheduledSessions", navKey: "sessions", count: 2, oldestAgeDays: 3, href: UNSCHEDULED_SESSIONS_HREF },
      { queue: "photoReports", navKey: "moderationReports", count: 1, oldestAgeDays: 0, href: "/app/admin/moderation/reports" },
      { queue: "commentReports", navKey: "moderationComments", count: 2, oldestAgeDays: 3, href: "/app/admin/moderation/comments" },
    ]);
    expect(a?.total).toBe(7);
  });

  it("agrees with the dashboard's own attention rows, figure for figure", async () => {
    state.role = "admin";
    world();
    const [a, d] = await Promise.all([getAdminAttention("ar"), getAdminDashboardData("ar")]);
    const by = Object.fromEntries((a?.items ?? []).map((i) => [i.queue, { count: i.count, oldestAgeDays: i.oldestAgeDays }]));
    expect(by).toEqual({
      proposals: d?.attention.proposalsAwaitingDecision,
      unscheduledSessions: d?.attention.sessionsNotScheduled,
      photoReports: d?.attention.openPhotoReports,
      commentReports: d?.attention.openCommentReports,
    });
  });

  it("gives a moderator the two report queues only — never a count that leads to a page that 404s for them (REQ-ADM-020)", async () => {
    state.role = "moderator";
    world();
    const a = await getAdminAttention("ar");
    expect(a?.items.map((i) => i.queue)).toEqual(["photoReports", "commentReports"]);
    expect(a?.total).toBe(3);
  });

  it("gives a plain member nothing", async () => {
    state.role = "member";
    world();
    expect(await getAdminAttention("ar")).toBeNull();
  });

  it("an empty queue is a zero with no age, never a missing item", async () => {
    state.role = "admin";
    state.client = memorySupabase({ proposals: [], sessions: [], reports: [] });
    const a = await getAdminAttention("ar");
    expect(a?.items.every((i) => i.count === 0 && i.oldestAgeDays === null)).toBe(true);
    expect(a?.items).toHaveLength(4);
    expect(a?.total).toBe(0);
  });
});
