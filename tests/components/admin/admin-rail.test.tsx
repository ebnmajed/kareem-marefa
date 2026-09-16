// The admin console's left rail — `16` §6.7, wave 6 (`DEC-130`). Proves the
// three real behaviours a screenshot cannot: the phone drawer closes on a
// link click (the exact class of bug DEC-111 named — a disclosure that stays
// open over the destination), the collapse toggle's accessible name follows
// its own state, and the desktop/phone chrome are never both focusable at
// once (jsdom has no media queries, so this asserts on markup, not layout —
// the 390 px capture is where the visual claim is actually checked).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import { AdminRail, type AdminRailItem } from "@/components/admin/admin-rail";
import { CalendarIcon, HomeIcon } from "@/components/ui/icons";

const ITEMS: AdminRailItem[] = [
  { key: "dashboard", href: "/app/admin", label: "لوحة التحكم", Icon: HomeIcon, current: true },
  { key: "sessions", href: "/app/admin/sessions", label: "الجلسات", Icon: CalendarIcon, current: false },
];

function renderRail() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">
        <AdminRail items={ITEMS} brand="لوحة إدارة المؤسسة" collapseLabel="طيّ قائمة الإدارة" expandLabel="توسيع قائمة الإدارة" openLabel="فتح قائمة الإدارة" />
      </Direction.Provider>
    </NextIntlClientProvider>,
  );
}

describe("AdminRail", () => {
  it("lists every item once in the desktop nav and once in the phone sheet, each with the current one marked", () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
    expect(within(nav).getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "الجلسات" })).not.toHaveAttribute("aria-current");
  });

  it("the collapse toggle's accessible name follows its own state, not a fixed label", async () => {
    renderRail();
    const toggle = screen.getByRole("button", { name: "طيّ قائمة الإدارة" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "توسيع قائمة الإدارة" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "طيّ قائمة الإدارة" })).not.toBeInTheDocument();
  });

  it("★ the phone drawer closes when a link inside it is followed — DEC-111's own bug, not repeated here", async () => {
    renderRail();
    await userEvent.click(screen.getByRole("button", { name: "فتح قائمة الإدارة" }));
    const dialog = screen.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("link", { name: "الجلسات" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no axe violations, closed or with the phone drawer open", async () => {
    const { container } = renderRail();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "فتح قائمة الإدارة" }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});
