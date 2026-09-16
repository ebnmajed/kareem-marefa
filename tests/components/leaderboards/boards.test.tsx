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
import type { CompanyBoardRow, MemberBoardRow } from "@/lib/dal/leaderboards";

const messages = { ...leaderboards, ...ui };

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));

const { MemberBoard } = await import("@/components/scoring/member-board");
const { CompanyBoard } = await import("@/components/scoring/company-board");

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
