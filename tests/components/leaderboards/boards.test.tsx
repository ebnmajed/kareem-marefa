// SCR-027 · SCR-028 — the two board components, wave 7 (DEC-137, DEC-141).
//
// What a screenshot cannot say: the member's own rank is there even when they
// are outside the rows shown (REQ-LDR-001); nobody's face is on a board
// (DEC-099); and both company metrics are on every row with the ranking one
// first and marked (REQ-LDR-004, REQ-LDR-005). Strings are the real Arabic.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import leaderboards from "@/messages/ar/leaderboards.json";
import ui from "@/messages/ar/ui.json";
import type { CompanyBoardRow, CompanyPointsBreakdown, MemberBoardRow } from "@/lib/dal/leaderboards";

const messages = { ...leaderboards, ...ui };

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));

const { MemberBoard } = await import("@/components/scoring/member-board");
const { CompanyBoard } = await import("@/components/scoring/company-board");
const { CompanyPointsBreakdownSection } = await import("@/components/scoring/company-points-breakdown");

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
  ...over,
});

describe("MemberBoard", () => {
  it("★ shows the viewer's own row under «ترتيبك» when they are below the rows shown", async () => {
    const rows = [member(1), member(2), member(3), member(4, { isSelf: true, displayName: "ريم العتيبي" })];
    render(<Wrap>{await MemberBoard({ rows, limit: 2 })}</Wrap>);
    const lists = screen.getAllByRole("list");
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(2);
    const self = screen.getByRole("region", { name: "ترتيبك" });
    expect(self).toHaveTextContent("ريم العتيبي");
    expect(self).toHaveTextContent("أنت");
    expect(self).toHaveTextContent("المرتبة 4");
  });

  it("does not repeat the viewer's row when they are already among the rows shown", async () => {
    const rows = [member(1, { isSelf: true }), member(2)];
    render(<Wrap>{await MemberBoard({ rows, limit: 20 })}</Wrap>);
    expect(screen.queryByRole("region", { name: "ترتيبك" })).toBeNull();
    expect(screen.getAllByText("أنت")).toHaveLength(1);
  });

  it("links a name to the member's profile, and draws no avatar (DEC-099)", async () => {
    const { container } = render(<Wrap>{await MemberBoard({ rows: [member(1)] })}</Wrap>);
    expect(screen.getByRole("link", { name: "عضو 1" })).toHaveAttribute("href", `/ar/app/members/${member(1).memberId}`);
    expect(container.querySelector("img, [data-slot=avatar]")).toBeNull();
  });

  it("an empty board names what to do next", async () => {
    render(<Wrap>{await MemberBoard({ rows: [] })}</Wrap>);
    expect(screen.getByText(leaderboards.leaderboards.empty)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفّح الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
  });
});

describe("CompanyBoard", () => {
  const rows: CompanyBoardRow[] = [
    { companyId: "c1", companyName: "الشركة الأولى", rank: 1, totalPoints: 420, pointsPerActiveMember: 35 },
    { companyId: "c2", companyName: "الشركة الثانية", rank: 2, totalPoints: 900, pointsPerActiveMember: 22.5 },
  ];

  it("★ shows both metrics on every row, the ranking one first and marked", async () => {
    render(<Wrap>{await CompanyBoard({ rows, metric: "points_per_active_member" })}</Wrap>);
    const first = screen.getAllByRole("listitem")[0];
    const terms = within(first).getAllByRole("term").map((dt) => dt.textContent);
    expect(terms[0]).toContain("نقاط لكل عضو نشط");
    expect(terms[0]).toContain("الترتيب حسبه");
    expect(terms[1]).toContain("مجموع النقاط");
    expect(terms[1]).not.toContain("الترتيب حسبه");
    expect(within(first).getAllByRole("definition").map((dd) => dd.textContent)).toEqual(["35", "420"]);
  });

  it("follows the org's metric when it is total points", async () => {
    render(<Wrap>{await CompanyBoard({ rows, metric: "total_points" })}</Wrap>);
    const second = screen.getAllByRole("listitem")[1];
    expect(within(second).getAllByRole("term")[0]).toHaveTextContent("مجموع النقاط");
    expect(within(second).getAllByRole("definition").map((dd) => dd.textContent)).toEqual(["900", "22.5"]);
  });
});

// ★ A signed number's direction is PINNED, not resolved. jsdom lays nothing
// out, so it cannot see a «20-» reorder — the attribute is what is asserted.
describe("signed numbers read left to right", () => {
  it("a negative company total and its per-member figure", async () => {
    const negative: CompanyBoardRow[] = [{ companyId: "c3", companyName: "الشركة الثالثة", rank: 3, totalPoints: -12, pointsPerActiveMember: -1.5 }];
    render(<Wrap>{await CompanyBoard({ rows: negative, metric: "total_points" })}</Wrap>);
    const values = within(screen.getByRole("listitem")).getAllByRole("definition").map((dd) => dd.querySelector("bdi")!);
    expect(values).toHaveLength(2);
    for (const bdi of values) {
      expect(bdi).toHaveAttribute("dir", "ltr");
      expect(bdi.textContent).toMatch(/-1/);
    }
  });

  it("a negative row in the company's own ledger", async () => {
    const breakdown: CompanyPointsBreakdown = {
      companyId: "c1",
      companyName: "الشركة الأولى",
      totalPoints: 30,
      catalogue: [],
      rows: [
        { id: "r1", occurredAt: "2026-09-01T09:00:00Z", amount: 50, reason: "استضافة", source: "company_hosting", sessionId: null, sessionTitle: null, meta: null },
        { id: "r2", occurredAt: "2026-09-02T09:00:00Z", amount: -20, reason: "تصحيح", source: "company_hosting", sessionId: null, sessionTitle: null, meta: null },
      ],
    };
    const { container } = render(<Wrap>{await CompanyPointsBreakdownSection({ breakdown, locale: "ar", timeZone: "Asia/Riyadh" })}</Wrap>);
    const amounts = Array.from(container.querySelectorAll("li p.text-label bdi"));
    expect(amounts.map((b) => b.textContent?.replace(/\u200E/g, ""))).toEqual(["50", "-20"]);
    for (const bdi of amounts) expect(bdi).toHaveAttribute("dir", "ltr");
  });
});
