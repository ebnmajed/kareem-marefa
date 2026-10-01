// Browse's filters — REQ-UIX-060, REQ-UIX-022, REQ-DSC-005, DEC-207 (N4). The successor of
// `filter-bar.test.tsx` (its subject is deleted); the ledger names each case that moved.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { CAT, VENUE, Wrap, timeline, translations } from "./fixtures";
import { parseTimelineQuery } from "@/components/browse/timeline-query";

vi.mock("next-intl/server", () => ({ getTranslations: translations }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/sessions",
}));

const { FilterChips } = await import("@/components/browse/filter-chips");

async function mount(search: Record<string, string>) {
  const element = await FilterChips({ query: parseTimelineQuery(search), data: timeline(), locale: "ar" });
  return render(<Wrap>{element}</Wrap>);
}

describe("FilterChips", () => {
  it("★ one row: the status and the category say what is applied on their face, then «المزيد»", async () => {
    await mount({});
    const nav = screen.getByRole("navigation", { name: "تصفية الجلسات" });
    expect(within(nav).getByRole("button", { name: "الحالة: القادمة" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "التصنيف: الكل" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "المزيد من عوامل التصفية" })).toHaveTextContent("المزيد");
    expect(screen.queryByRole("list", { name: "عوامل التصفية المطبّقة" })).toBeNull();
  });

  it("★ each menu's items are LINKS to the canonical /app/sessions, the applied one current", async () => {
    await mount({});
    await userEvent.click(screen.getByRole("button", { name: "الحالة: القادمة" }));
    expect(await screen.findByRole("menuitem", { name: "جارية الآن" })).toHaveAttribute("href", "/ar/app/sessions?status=live");
    expect(screen.getByRole("menuitem", { name: "القادمة" })).toHaveAttribute("aria-current", "page");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "التصنيف: الكل" }));
    expect(await screen.findByRole("menuitem", { name: "إداري" })).toHaveAttribute("href", `/ar/app/sessions?category=${CAT}`);
  });

  it("an applied category names itself on the chip", async () => {
    await mount({ category: CAT });
    expect(screen.getByRole("button", { name: "التصنيف: إداري" })).toBeInTheDocument();
  });

  it("★ the applied row names every filter — never a raw id — the category and status included, and each removes only itself", async () => {
    const { container } = await mount({ tag: "تقارير", venue: VENUE, category: CAT, status: "live" });
    const applied = screen.getByRole("list", { name: "عوامل التصفية المطبّقة" });
    expect(within(applied).getByText("الوسم: تقارير")).toBeInTheDocument();
    expect(within(applied).getByText("المكان: القاعة الكبرى")).toBeInTheDocument();
    expect(within(applied).getByText("التصنيف: إداري")).toBeInTheDocument();
    expect(within(applied).getByText("الحالة: جارية الآن")).toBeInTheDocument();
    expect(applied.textContent).not.toContain(VENUE);

    const href = decodeURIComponent(within(applied).getByRole("link", { name: "أزل عامل التصفية: المكان: القاعة الكبرى" }).getAttribute("href")!);
    expect(href).toContain("tag=تقارير");
    expect(href).toContain(`category=${CAT}`);
    expect(href).not.toContain("venue=");

    expect(screen.getByRole("link", { name: "أزل عامل التصفية: إداري" }).getAttribute("href")).not.toContain("category=");
    expect(screen.getByRole("link", { name: "أزل عامل التصفية: جارية الآن" }).getAttribute("href")).not.toContain("status=");
    expect(screen.getByRole("link", { name: "امسح الكل" })).toHaveAttribute("href", "/ar/app/sessions");

    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("the sheet's trigger says how many of its filters are applied, in words for a screen reader", async () => {
    await mount({ venue: VENUE, level: "advanced" });
    expect(screen.getByRole("button", { name: /المزيد من عوامل التصفية/ })).toHaveAccessibleName("المزيد من عوامل التصفية، عاملان مطبّقان");
  });
});
