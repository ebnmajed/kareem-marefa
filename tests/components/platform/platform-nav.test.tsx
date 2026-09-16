// The console's navigation — `components/platform/platform-nav.tsx`, SCR-080 …
// 085, REQ-UIX-017, DEC-111, wave 8 (`docs/plan/notes/platform.md` W8.1).
//
// What a screenshot cannot prove: the current section is read from the PATH
// (never from a layout that stops re-rendering after the first screen), the
// phone switcher names that section in its trigger and closes when an item is
// followed, and nothing in the list is a horizontal scroller.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/platform.json";

let pathname = "/ar/app/platform/orgs/new";
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => pathname,
}));

const { PlatformNav, platformSection } = await import("@/components/platform/platform-nav");

function renderNav(path: string) {
  pathname = path;
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <Direction.Provider dir="rtl">
        <PlatformNav />
      </Direction.Provider>
    </NextIntlClientProvider>,
  );
}

describe("platformSection", () => {
  it("matches the home exactly and every other section by prefix", () => {
    expect(platformSection("/ar/app/platform")).toBe("home");
    expect(platformSection("/ar/app/platform/")).toBe("home");
    expect(platformSection("/ar/app/platform/orgs")).toBe("orgs");
    expect(platformSection("/ar/app/platform/orgs/new")).toBe("orgs");
    expect(platformSection("/ar/app/platform/orgs/0b1c/domains")).toBe("orgs");
    expect(platformSection("/en/app/platform/impersonate")).toBe("impersonate");
    // A prefix that only LOOKS like a section is not one.
    expect(platformSection("/ar/app/platform/orgsx")).toBeNull();
    expect(platformSection("/ar/app/admin")).toBeNull();
  });
});

describe("PlatformNav", () => {
  it("lists the five sections in the rail and marks only the one the path is in", () => {
    renderNav("/ar/app/platform/orgs/new");
    const rails = screen.getAllByRole("navigation", { name: "لوحة المنصة" });
    const rail = rails.find((n) => within(n).queryAllByRole("link").length > 0)!;
    const links = within(rail).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["نظرة عامة", "المؤسسات", "مكتبة القوالب", "المؤشرات", "الدخول الاستثنائي"]);
    expect(within(rail).getByRole("link", { name: "المؤسسات" })).toHaveAttribute("aria-current", "page");
    expect(links.filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
    // ★ Never a horizontal scroller (DEC-147): an item scrolled out of view at
    // 390 px reads as not being there.
    for (const el of [rail, ...Array.from(rail.querySelectorAll("*"))]) {
      expect(el.className.toString()).not.toMatch(/overflow-x-(auto|scroll)/);
    }
  });

  it("★ the current section follows the path it is rendered on, not the first one", () => {
    const first = renderNav("/ar/app/platform/metrics");
    const rail = () => screen.getAllByRole("navigation", { name: "لوحة المنصة" }).find((n) => within(n).queryAllByRole("link").length > 0)!;
    expect(within(rail()).getByRole("link", { name: "المؤشرات" })).toHaveAttribute("aria-current", "page");
    pathname = "/ar/app/platform";
    first.rerender(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <Direction.Provider dir="rtl">
          <PlatformNav />
        </Direction.Provider>
      </NextIntlClientProvider>,
    );
    expect(within(rail()).getByRole("link", { name: "نظرة عامة" })).toHaveAttribute("aria-current", "page");
    expect(within(rail()).getByRole("link", { name: "المؤشرات" })).not.toHaveAttribute("aria-current");
  });

  it("the phone switcher names the current section, lists all five, and closes when one is followed", async () => {
    renderNav("/ar/app/platform/templates");
    const trigger = screen.getByRole("button", { name: "أقسام لوحة المنصة: مكتبة القوالب" });
    expect(trigger).toHaveTextContent("مكتبة القوالب");
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(5);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "المؤشرات" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // `landmark-unique` is off for a reason jsdom cannot see past: the phone bar
  // and the rail are both `nav «لوحة المنصة»`, and a real browser only ever
  // displays one of them (`md:hidden` / `hidden md:block` — `display: none`
  // takes the other out of the accessibility tree). jsdom has no media
  // queries, so both look present here. The e2e axe scan runs on real widths.
  const RULES = { "color-contrast": { enabled: false }, "landmark-unique": { enabled: false } };

  it("has no axe violations, closed or with the switcher open", async () => {
    const { container } = renderNav("/ar/app/platform");
    expect((await axe.run(container, { rules: RULES })).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "أقسام لوحة المنصة: نظرة عامة" }));
    // The open menu is portalled to `body`, outside any landmark, which `region`
    // (moderate) reports for every Radix menu in the product; it is the
    // wrapper's portal, not this list.
    expect((await axe.run(document.body, { rules: { ...RULES, region: { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});
