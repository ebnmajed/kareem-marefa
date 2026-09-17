// The house dropdown menu over Radix (DEC-019) — `dialog.test.tsx` is the
// house precedent for a Radix wrapper's test shape. Radix owns focus
// trapping, typeahead and closing; this proves the wiring and the copy.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Menu } from "@/components/ui/menu";

// ★ `href` items now render through `ui/link` (next-intl's `Link`), not a
// raw `<a>` — a real bug found while planning wave 6: a locale-less house
// `href` through a plain `<a>` was a hard navigation, caught only by
// `proxy.ts`'s redirect rather than landing directly, and drew no pending
// dot. `NextIntlClientProvider` is required now for the same reason
// `member-picker.test.tsx` needed one after adopting `ui/combobox` — a
// client component that calls `useLocale()` throws without a provider in
// jsdom, which has no app-level one to fall back on.
function Example({ onSelect = () => {} }: { onSelect?: () => void }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">
        <Menu
          trigger={<button type="button">القائمة</button>}
          items={[
            { label: "تعديل", onSelect },
            { label: "عرض السجل", href: "/app/admin/audit" },
            { label: "حذف", onSelect: () => {}, tone: "error", startsGroup: true },
            { label: "معطّل", onSelect: () => {}, disabled: true },
          ]}
        />
      </Direction.Provider>
    </NextIntlClientProvider>
  );
}

describe("Menu", () => {
  it("is closed until its trigger is used, then exposes its items as a menu", async () => {
    render(<Example />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "تعديل" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "عرض السجل" })).toBeInTheDocument();
  });

  it("calls onSelect and closes", async () => {
    let called = false;
    render(<Example onSelect={() => (called = true)} />);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "تعديل" }));
    expect(called).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a disabled item cannot be activated", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    const disabled = screen.getByRole("menuitem", { name: "معطّل" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
  });

  it("marks the page on show with aria-current and a check, and no other item", async () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{}}>
        <Direction.Provider dir="rtl">
          <Menu
            trigger={<button type="button">النقاط والتقدير</button>}
            items={[
              { label: "النقاط", href: "/app/admin/scoring", current: true },
              { label: "الشارات والمستويات", href: "/app/admin/recognition" },
            ]}
          />
        </Direction.Provider>
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "النقاط والتقدير" }));
    const current = screen.getByRole("menuitem", { name: "النقاط" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.querySelector("svg")).not.toBeNull();
    const other = screen.getByRole("menuitem", { name: "الشارات والمستويات" });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other.querySelector("svg")).toBeNull();
    // The open menu is portaled to `body`, so that is what axe reads; `region`
    // is a page-landmark rule a bare test document cannot satisfy.
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  }, 20000);

  it("closes on Escape", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("has no axe violations open or closed", async () => {
    // `color-contrast` disabled — jsdom has no layout/paint engine to
    // evaluate it against, the same reason `tests/components/ui/badge.test.tsx`
    // (already in the tree) disables it.
    const { container } = render(<Example />);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});
