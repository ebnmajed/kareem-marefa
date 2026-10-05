// SCR-027 · SCR-028 — the boards rebuilt (wave 20, PR B, REQ-UIX-078, REQ-UIX-079, DEC-218, DEC-219 §2). Re-written at
// this path after the old components were deleted (DEC-208); the retired cases are re-homed here (scoring's note).
//
// What a screenshot cannot say: the viewer's own rank is there even outside the rows shown (REQ-LDR-001); nobody's face
// is on a board (DEC-099); both company metrics are on every row with the ranking one marked (REQ-LDR-004, -005); a
// signed number reads left to right; the cup draws only the quarter snapshot's own facts.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import leaderboards from "@/messages/ar/leaderboards.json";
import ui from "@/messages/ar/ui.json";
import type { CompanyBoardRow, CompanyCup, CompanyPointsBreakdown, MemberBoardRow } from "@/lib/dal/leaderboards";

const messages = { ...leaderboards, ...ui };

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));

const { MemberBoard } = await import("@/components/scoring/member-board");
const { CompanyBoard } = await import("@/components/scoring/company-board");
const { CompanyPointsBreakdownSection } = await import("@/components/scoring/company-points-breakdown");
const { CupCard } = await import("@/components/scoring/cup-card");

const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

const member = (rank: number, over: Partial<MemberBoardRow> = {}): MemberBoardRow => ({
  memberId: `00000000-0000-4000-8000-${String(rank).padStart(12, "0")}`,
  displayName: `عضو ${rank}`,
  rank,
  points: 1000 - rank * 10,
  isSelf: false,
  company: null,
  teamColor: null,
  ...over,
});

async function board(rows: MemberBoardRow[], place: { rank: number; points: number; above: { displayName: string; gap: number } | null } | null = null, extra: { optedOut?: boolean; moreHref?: string | null } = {}) {
  const ui = await MemberBoard({ rows, place, windowLabel: "هذا الأسبوع", optedOut: extra.optedOut ?? false, moreHref: extra.moreHref ?? null });
  return render(<Wrap>{ui}</Wrap>).container;
}

describe("MemberBoard", () => {
  it("★ the rank card is always there — the rank, the member above and the gap, the window's points", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => member(i + 1, i === 3 ? { isSelf: true } : {}));
    const c = await board(rows, { rank: 4, points: 960, above: { displayName: "عضو 3", gap: 10 } });
    const card = c.querySelector("[data-slot=rank-card]")!;
    expect(card.textContent).toContain("#4");
    expect(card.textContent).toContain("فوقك: عضو 3");
    expect(card.textContent).toContain("+10");
    expect(card.textContent).toContain("هذا الأسبوع");
  });

  it("★ not ranked is words on the card, never a zero rank", async () => {
    const c = await board([member(1)], null);
    expect(c.querySelector("[data-slot=rank-card]")!.textContent).toContain("لا ترتيب بعد");
  });

  it("the first three stand on the podium; the rows begin at 4", async () => {
    const c = await board(Array.from({ length: 6 }, (_, i) => member(i + 1)));
    expect(c.querySelectorAll("[data-slot=podium] > li")).toHaveLength(3);
    expect(Array.from(c.querySelectorAll("[data-slot=board-rows] > li")).map((li) => li.textContent?.match(/عضو \d/)?.[0])).toEqual(["عضو 4", "عضو 5", "عضو 6"]);
  });

  it("★ shows the viewer's own row under «ترتيبك» when they are below the rows shown (REQ-LDR-001)", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => member(i + 1, i === 11 ? { isSelf: true } : {}));
    await board(rows, { rank: 12, points: 880, above: null });
    const own = screen.getByRole("heading", { name: "ترتيبك" }).closest("section")!;
    expect(within(own).getByText("عضو 12")).toBeTruthy();
    expect(within(own).getByText("أنت")).toBeTruthy();
  });

  it("does not repeat the viewer's row when they are among the rows shown", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => member(i + 1, i === 4 ? { isSelf: true } : {}));
    await board(rows);
    expect(screen.queryByRole("heading", { name: "ترتيبك" })).toBeNull();
    expect(screen.getAllByText("عضو 5")).toHaveLength(1);
  });

  it("links a name to the member's profile, and draws no photograph anywhere — podium included (DEC-099)", async () => {
    const c = await board(Array.from({ length: 5 }, (_, i) => member(i + 1)));
    expect(screen.getAllByRole("link", { name: "عضو 1" })[0]).toHaveAttribute("href", expect.stringContaining("/app/members/00000000-0000-4000-8000-000000000001"));
    expect(c.querySelector("img")).toBeNull();
  });

  it("an empty board names what to do next, and the rank card stays", async () => {
    const c = await board([]);
    expect(screen.getByRole("link", { name: "تصفّح الجلسات" })).toBeTruthy();
    expect(c.querySelector("[data-slot=rank-card]")).not.toBeNull();
  });

  it("«عرض 11 إلى 50» when more rows exist", async () => {
    await board(Array.from({ length: 14 }, (_, i) => member(i + 1)), null, { moreHref: "/app/leaderboards?rows=50" });
    expect(screen.getByRole("link", { name: /عرض 11 إلى 50/ })).toHaveAttribute("href", expect.stringContaining("rows=50"));
  });

  it("an opted-out viewer is told nobody else sees them (REQ-LDR-008)", async () => {
    const c = await board([member(1, { isSelf: true })], { rank: 1, points: 990, above: null }, { optedOut: true });
    expect(c.querySelector("[data-slot=rank-card]")!.textContent).toContain("لا يراك الآخرون");
  });
});

const company = (rank: number, over: Partial<CompanyBoardRow> = {}): CompanyBoardRow => ({
  companyId: `c${rank}`,
  companyName: `شركة ${rank}`,
  rank,
  totalPoints: 1000 - rank * 100,
  pointsPerActiveMember: 10 - rank,
  teamColor: null,
  isOwn: false,
  ...over,
});

describe("CompanyBoard", () => {
  it("★ both metrics on every row, the ranking one said and marked; the header names them once", async () => {
    const ui = await CompanyBoard({ rows: [company(1), company(2, { isOwn: true })], metric: "points_per_active_member" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    const rows = container.querySelectorAll("[data-slot=board-rows] > li");
    for (const row of Array.from(rows)) {
      expect(row.textContent).toContain("الترتيب حسبه: نقاط لكل عضو نشط");
      expect(row.textContent).toContain("مجموع النقاط");
    }
    expect(rows[1].textContent).toContain("فريقك");
  });

  it("★ «N نشطًا» after each name, from the frozen pair — and nothing when it cannot be derived", async () => {
    const ui = await CompanyBoard({ rows: [{ ...company(1), active: 18 }, { ...company(2), active: null }], metric: "points_per_active_member" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    const rows = container.querySelectorAll("[data-slot=board-rows] > li");
    expect(rows[0].textContent).toContain("18 نشطًا");
    expect(rows[1].textContent).not.toContain("نشطًا");
  });

  it("★ «بلا ترتيب»: a company below the snapshot's minimum draws no rank, and says so beside its count (REQ-UIX-082)", async () => {
    const ui = await CompanyBoard({ rows: [{ ...company(1), active: 18 }, { ...company(2), active: 2, unranked: true }], metric: "points_per_active_member" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    const rows = container.querySelectorAll("[data-slot=board-rows] > li");
    expect(rows[1].textContent).toContain("بلا ترتيب · عضوان نشطان");
    expect(rows[1].textContent).not.toContain("المرتبة");
    expect(rows[0].textContent).toContain("المرتبة");
  });

  it("follows the org's metric when it is total points", async () => {
    const ui = await CompanyBoard({ rows: [company(1)], metric: "total_points" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    expect(container.querySelector("[data-slot=board-rows] li")!.textContent).toContain("الترتيب حسبه: مجموع النقاط");
  });

  it("a negative company total reads left to right", async () => {
    const ui = await CompanyBoard({ rows: [company(1, { totalPoints: -40, pointsPerActiveMember: -2 })], metric: "total_points" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    expect(Array.from(container.querySelectorAll("bdi[dir=ltr]")).some((b) => b.textContent?.includes("-40"))).toBe(true);
  });
});

describe("the breakdown", () => {
  const breakdown: CompanyPointsBreakdown = {
    companyId: "c1",
    companyName: "صنف",
    totalPoints: 175,
    rows: [{ id: "r1", occurredAt: "2026-09-20T10:00:00Z", amount: -12, reason: "x", source: "company_attendance_pct", sessionId: null, sessionTitle: null, meta: null }],
    catalogue: [],
  };

  it("a negative row in the company's own ledger reads left to right, with its minus", async () => {
    const ui = await CompanyPointsBreakdownSection({ breakdown, locale: "ar", timeZone: "Asia/Riyadh" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    expect(container.querySelector("#company-breakdown [data-slot=figure] bdi")!.textContent).toBe("−12");
    expect(screen.getByRole("heading", { name: "كيف حصلت شركتك على نقاطها" })).toBeTruthy();
  });

  // wave 27 (DEC-255 §4, REQ-PRF-012): «بلا شركة» and no way to choose one — a member does not choose a company.
  it("★ no company: «بلا شركة» in place of the breakdown, and nothing asking for one", async () => {
    const ui = await CompanyPointsBreakdownSection({ breakdown: null, locale: "ar", timeZone: "Asia/Riyadh" });
    render(<Wrap>{ui}</Wrap>);
    expect(screen.getByText("بلا شركة")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /اختر شركتك/ })).not.toBeInTheDocument();
  });
});

describe("CupCard", () => {
  const cup = (over: Partial<CompanyCup> = {}): CompanyCup => ({
    quarter: 4,
    year: 2026,
    round: 1,
    daysLeft: 26,
    isFinal: false,
    takenAt: "2026-10-02T23:00:00Z",
    periodStart: "2026-10-01",
    metric: "points_per_active_member",
    rows: [],
    timeZone: "Asia/Riyadh",
    ...over,
  });

  it("★ the quarter, the month of three, the days left, provisional, the frozen metric, «تُسلَّم في اللقاء السنوي»", async () => {
    const ui = await CupCard({ cup: cup(), locale: "ar" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    expect(screen.getByRole("heading", { name: "كأس الربع الرابع" })).toBeTruthy();
    expect(container.textContent).toContain("الجولة 1 من 3");
    expect(container.textContent).toContain("26 يومًا");
    expect(container.textContent).toContain("تُسلَّم في اللقاء السنوي");
    expect(container.textContent).toContain("الترتيب حسبه: نقاط لكل عضو نشط");
    expect(container.textContent).toContain("مؤقتة");
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it("a final quarter says so, with no days and no round", async () => {
    const ui = await CupCard({ cup: cup({ isFinal: true, daysLeft: null, quarter: 3 }), locale: "ar" });
    const { container } = render(<Wrap>{ui}</Wrap>);
    expect(screen.getByRole("heading", { name: "كأس الربع الثالث" })).toBeTruthy();
    expect(container.textContent).toContain("نهائية");
    expect(container.textContent).not.toContain("الجولة");
  });
});
