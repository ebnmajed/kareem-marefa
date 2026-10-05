// SCR-048's table (REQ-UIX-095, REQ-UIX-043), written for wave 22 from `AdminCompanies.dc.html`. The team colour is a
// swatch AND its name in words — never colour alone — and «بلا لون» for none. ★ Wave 22 moved the colour's choice from a
// per-row menu into the edit form (`company-form.tsx`, `companies-add-colour.test.tsx`): the row's ⋯ opens it.
import type React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ToastProvider } from "@/components/ui/toast";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const setCompanyActiveAction = vi.fn(async () => ({ ok: false }));
vi.mock("@/app/[locale]/app/admin/companies/actions", () => ({ setCompanyActiveAction, saveCompany: vi.fn() }));

const { CompaniesTable } = await import("@/app/[locale]/app/admin/companies/companies-table");
type Row = React.ComponentProps<typeof CompaniesTable>["companies"][number];

const messages = { ...adminAr, ...uiAr };
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{children}</main>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

const COMPANIES: Row[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "شركة الأولى", deactivatedAt: null, memberCount: 9, activeMemberCount: 7, teamColor: "#35d0ff", quarterPoints: 25, domains: ["first.example", "first.sa"] },
  { id: "22222222-2222-4222-8222-222222222222", name: "شركة الثانية", deactivatedAt: null, memberCount: 0, activeMemberCount: 0, teamColor: null, quarterPoints: null, domains: [] },
  { id: "33333333-3333-4333-8333-333333333333", name: "شركة قديمة", deactivatedAt: "2026-09-01T00:00:00Z", memberCount: 2, activeMemberCount: 0, teamColor: null, quarterPoints: null, domains: [] },
];
const table = () => screen.getByRole("table");
const rows = () => within(table()).getAllByRole("row").slice(1);

describe("CompaniesTable", () => {
  // ★ wave 27 (DEC-254 §2, REQ-ADM-024; ledger B): the artboard's النطاق column is built — the expectation moved.
  it("draws الشركة · النطاق · الأعضاء · النشطون · الربع and a named ⋯ — no logo (DEC-195 §4)", () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["الشركة", "النطاق", "الأعضاء", "النشطون", "الربع", "إجراءات"]);
    expect(document.querySelector("img")).toBeNull();
  });

  it("a company with a colour shows its name, not just the swatch — colour is never the only channel", () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    expect(within(rows()[0]).getByText("سماوي")).toBeVisible();
    expect(rows()[0].querySelector("[aria-hidden='true'].bg-team")).not.toBeNull();
  });

  it("a company with none shows «بلا لون»", () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    expect(within(rows()[1]).getByText("بلا لون")).toBeVisible();
  });

  it("the quarter's points are read; «—» before the quarter's snapshot exists", () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    const cells = (r: HTMLElement) => within(r).getAllByRole("cell").map((c) => c.textContent);
    // ★ wave 27 (ledger B): one column further along — النطاق is the second.
    expect(cells(rows()[0]).slice(2, 5)).toEqual(["9", "7", "25"]);
    expect(cells(rows()[1])[4]).toBe("—");
  });

  it("state lives in the row: «معطّلة» beside a deactivated company only, and the count line under the table", () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    expect(within(rows()[0]).queryByText("معطّلة")).toBeNull();
    expect(within(rows()[2]).getByText("معطّلة")).toBeVisible();
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "3 شركات")).toBeVisible();
  });

  it("the ⋯ opens the edit form by URL and offers no delete; a write that matched nothing is «لم يُحفظ»", async () => {
    render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على شركة قديمة" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["عدّل", "أعد التفعيل"]);
    expect(screen.getByRole("menuitem", { name: "عدّل" }).closest("a")?.getAttribute("href")).toContain("?edit=33333333-3333-4333-8333-333333333333");
    await userEvent.click(screen.getByRole("menuitem", { name: "أعد التفعيل" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.", { exact: true })).toBeInTheDocument();
  });

  it("the phone card carries the ⋯ (wave 8, F1)", () => {
    const { container } = render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    const [card] = within(container.querySelector("ul") as HTMLElement).getAllByRole("listitem");
    expect(within(card).getByRole("button", { name: "مزيد من الإجراءات على شركة الأولى" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    const { container } = render(<CompaniesTable companies={COMPANIES} locale="ar" />, { wrapper: Wrap });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
