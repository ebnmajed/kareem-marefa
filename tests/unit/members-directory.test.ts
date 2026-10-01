// SCR-019's directory is a DAL guarantee (REQ-UIX-068, REQ-PRF-005, A33, contract 7) — tested at the DAL:
//
//   · only tier-1 fields leave `listDirectory()` — never an email, points, a rank or the opt-out flag;
//   · a non-admin is read from `members_member_view` whatever the query string says; an admin who asks gets the
//     deactivated members, marked; an anonymised member (no name) is left out for everyone;
//   · «الأنشط أولًا» is the sessions DELIVERED (contract 4's batch), then the name; the paging is cumulative;
//   · search folds Arabic, and matches the name or the job title.
//
// Supabase is a stub that answers by table; RLS itself is the boundary for other orgs (`members_read_org`).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const C2 = "00000000-0000-4000-8000-0000000000c2";
const CAT = "00000000-0000-4000-8000-0000000000e1";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const state = { role: "member" as "admin" | "moderator" | "member", tables: [] as string[] };

const ACTIVE = [
  { id: id(1), display_name: "سارة القحطاني", avatar_version: null, company_id: C1, job_title: "مديرة المواهب", org_role: "member" },
  { id: id(2), display_name: "أحمد العنزي", avatar_version: 7, company_id: C2, job_title: "مهندس بيانات", org_role: "member" },
  { id: id(3), display_name: "بدر الغامدي", avatar_version: null, company_id: null, job_title: null, org_role: "admin" },
  { id: id(4), display_name: "  ", avatar_version: null, company_id: null, job_title: null, org_role: "member" },
];
const BASE = [
  ...ACTIVE.map((m) => ({ ...m, status: "active" })),
  { id: id(5), display_name: "عضو سابق", avatar_version: null, company_id: C1, job_title: null, org_role: "member", status: "deactivated" },
  { id: id(6), display_name: null, avatar_version: null, company_id: null, job_title: null, org_role: "member", status: "deactivated" },
];

function answer(table: string) {
  switch (table) {
    case "members_member_view":
      return ACTIVE;
    case "members":
      return BASE;
    case "companies":
      return [
        { id: C1, name: "مواهب", team_color: "#35d0ff" },
        { id: C2, name: "أيك", team_color: null },
      ];
    case "points_balances":
      return [{ member_id: id(1), current_level_id: "L4", total_points: 999, leaderboard_opt_out: true }];
    case "levels":
      return [{ id: "L4", name: "كريم معرفة", sort_order: 4 }];
    case "member_interests":
      return [{ member_id: id(2), category_id: CAT, categories: { name: "فني" } }];
    case "session_presenters":
      return [{ member_id: id(2) }, { member_id: id(2) }, { member_id: id(1) }];
    default:
      return [];
  }
}

function query(table: string) {
  state.tables.push(table);
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit", "neq", "not"]) chain[method] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: answer(table), error: null });
  return chain;
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: id(9), orgId: ORG, role: state.role }, supabase: { from: (t: string) => query(t) } }),
}));

const { listDirectory, foldArabic, orderDirectory, DIRECTORY_PAGE_SIZE } = await import("@/lib/dal/members");

beforeEach(() => {
  state.role = "member";
  state.tables = [];
});

describe("listDirectory — tier 1 only (contract 7)", () => {
  it("★ no email, no points, no rank, no opt-out flag ever leaves the DAL", async () => {
    const page = await listDirectory("ar", { order: "active", page: 1 });
    const json = JSON.stringify(page);
    expect(json).not.toMatch(/@|total_points|totalPoints|"rank"|opt_out|optOut|999/);
    expect(Object.keys(page.members[0]).sort()).toEqual(["avatarUrl", "company", "displayName", "id", "jobTitle", "level", "presentedCount", "role"]);
  });

  it("the avatar is our copy through the resolver, never a stored URL (DEC-099)", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1 });
    expect(page.members.find((m) => m.id === id(2))?.avatarUrl).toMatch(/^\/api\/avatars\//);
    expect(page.members.find((m) => m.id === id(1))?.avatarUrl).toBeNull();
  });

  it("the level shows, the company carries its team colour, «بلا شركة» is a null company", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1 });
    const sara = page.members.find((m) => m.id === id(1))!;
    expect(sara.level).toEqual({ tier: 4, name: "كريم معرفة" });
    expect(sara.company).toEqual({ id: C1, name: "مواهب", teamColor: "#35d0ff" });
    expect(page.members.find((m) => m.id === id(3))!.company).toBeNull();
  });
});

describe("listDirectory — who is listed (REQ-PRF-005)", () => {
  it("★ a member's ?inactive=1 is ignored: the read is the active view", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1, includeDeactivated: true });
    expect(state.tables).toContain("members_member_view");
    expect(state.tables).not.toContain("members");
    expect(page.canShowDeactivated).toBe(false);
    expect(page.members.some((m) => m.deactivated)).toBe(false);
  });

  it("a moderator too", async () => {
    state.role = "moderator";
    await listDirectory("ar", { order: "name", page: 1, includeDeactivated: true });
    expect(state.tables).not.toContain("members");
  });

  it("an admin sees no deactivated member by default", async () => {
    state.role = "admin";
    const page = await listDirectory("ar", { order: "name", page: 1 });
    expect(page.canShowDeactivated).toBe(true);
    expect(page.members.some((m) => m.deactivated)).toBe(false);
  });

  it("★ an admin who asks gets them, each marked — and an anonymised member is left out", async () => {
    state.role = "admin";
    const page = await listDirectory("ar", { order: "name", page: 1, includeDeactivated: true });
    expect(page.members.find((m) => m.id === id(5))?.deactivated).toBe(true);
    expect(page.members.find((m) => m.id === id(1))?.deactivated).toBeUndefined();
    expect(page.members.some((m) => m.id === id(6))).toBe(false);
  });

  it("a member with no name left is never a row", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1 });
    expect(page.members.some((m) => m.id === id(4))).toBe(false);
    expect(page.total).toBe(3);
  });
});

describe("listDirectory — order, filters, paging", () => {
  it("★ «الأنشط أولًا» is the sessions delivered, then the name", async () => {
    const page = await listDirectory("ar", { order: "active", page: 1 });
    expect(page.members.map((m) => [m.id, m.presentedCount])).toEqual([
      [id(2), 2],
      [id(1), 1],
      [id(3), 0],
    ]);
  });

  it("«الاسم» is Arabic collation", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1 });
    expect(page.members.map((m) => m.displayName)).toEqual(["أحمد العنزي", "بدر الغامدي", "سارة القحطاني"]);
  });

  it("search folds Arabic and reads the name or the job title", async () => {
    expect((await listDirectory("ar", { q: "احمد", order: "name", page: 1 })).members.map((m) => m.id)).toEqual([id(2)]);
    expect((await listDirectory("ar", { q: "المواهب", order: "name", page: 1 })).members.map((m) => m.id)).toEqual([id(1)]);
    const none = await listDirectory("ar", { q: "لا أحد", order: "name", page: 1 });
    expect(none.matched).toBe(0);
    expect(none.total).toBe(3);
  });

  it("filters by company and by interest; the interests row is the org's recorded interests", async () => {
    expect((await listDirectory("ar", { companyId: C1, order: "name", page: 1 })).members.map((m) => m.id)).toEqual([id(1)]);
    const byInterest = await listDirectory("ar", { interestId: CAT, order: "name", page: 1 });
    expect(byInterest.members.map((m) => m.id)).toEqual([id(2)]);
    expect(byInterest.interests).toEqual([{ id: CAT, name: "فني" }]);
  });

  it("the company chips are the companies that have a listed member", async () => {
    const page = await listDirectory("ar", { order: "name", page: 1 });
    expect(page.companies.map((c) => c.id).sort()).toEqual([C1, C2].sort());
  });

  it("★ paging is cumulative and clamped — a cold ?page=N is the first N pages", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: id(100 + i), displayName: `عضو ${i}`, presentedCount: 0 }));
    expect(orderDirectory(rows, "active")).toHaveLength(60);
    expect(DIRECTORY_PAGE_SIZE).toBe(24);
  });

  it("a page below 1 is page 1", async () => {
    expect((await listDirectory("ar", { order: "name", page: 0 })).page).toBe(1);
    expect((await listDirectory("ar", { order: "name", page: Number.NaN })).page).toBe(1);
  });
});

describe("foldArabic", () => {
  it("drops tashkeel and tatweel, folds the alifs, tā' marbūṭa and alif maqṣūra", () => {
    expect(foldArabic("أَحْمَد")).toBe("احمد");
    expect(foldArabic("إيمان")).toBe("ايمان");
    expect(foldArabic("فاطمة")).toBe("فاطمه");
    expect(foldArabic("مصطفى")).toBe("مصطفي");
    expect(foldArabic("محـــمد")).toBe("محمد");
    expect(foldArabic("  Data   Engineer ")).toBe("data engineer");
  });
});
