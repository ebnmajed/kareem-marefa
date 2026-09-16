// The timeline's filters — REQ-UIX-022, REQ-DSC-005, DEC-130.
import { render, screen, within } from "@testing-library/react";
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

const { FilterBar } = await import("@/components/browse/filter-bar");

async function mount(search: Record<string, string>) {
  const element = await FilterBar({ query: parseTimelineQuery(search), data: timeline(), locale: "ar" });
  return render(<Wrap>{element}</Wrap>);
}

describe("FilterBar", () => {
  it("row A: the default status is pressed, and every toggle links to the canonical /app/sessions", async () => {
    await mount({});
    const nav = screen.getByRole("navigation", { name: "تصفية الجلسات" });
    expect(within(nav).getByRole("link", { name: "القادمة" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "جارية الآن" })).toHaveAttribute("href", "/ar/app/sessions?status=live");
    expect(within(nav).getByRole("link", { name: "إداري" })).toHaveAttribute("href", `/ar/app/sessions?category=${CAT}`);
    // Nothing applied: no row B.
    expect(screen.queryByRole("list", { name: "عوامل التصفية المطبّقة" })).toBeNull();
  });

  it("★ row B names every applied filter — never a raw id — and each removes only itself", async () => {
    const { container } = await mount({ tag: "تقارير", venue: VENUE, category: CAT });
    const applied = screen.getByRole("list", { name: "عوامل التصفية المطبّقة" });
    expect(within(applied).getByText("الوسم: تقارير")).toBeInTheDocument();
    expect(within(applied).getByText("المكان: القاعة الكبرى")).toBeInTheDocument();
    expect(applied.textContent).not.toContain(VENUE);

    const dropVenue = within(applied).getByRole("link", { name: "أزل عامل التصفية: المكان: القاعة الكبرى" });
    const href = decodeURIComponent(dropVenue.getAttribute("href")!);
    expect(href).toContain("tag=تقارير");
    expect(href).toContain(`category=${CAT}`);
    expect(href).not.toContain("venue=");

    // The pressed category carries its own remove, and one «امسح الكل» clears the lot.
    expect(screen.getByRole("link", { name: "أزل عامل التصفية: إداري" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "امسح الكل" })).toHaveAttribute("href", "/ar/app/sessions");

    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("the sheet's trigger says how many of its filters are applied, in words for a screen reader", async () => {
    await mount({ venue: VENUE, level: "advanced" });
    expect(screen.getByRole("button", { name: /المزيد من عوامل التصفية/ })).toHaveAccessibleName("المزيد من عوامل التصفية، عاملان مطبّقان");
  });
});
