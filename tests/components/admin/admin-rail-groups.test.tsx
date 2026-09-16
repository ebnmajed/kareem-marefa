// The admin rail's disclosure groups — the fourteen-group IA, wave 7
// (`DEC-137`, `16` §6.7). `docs/plan/notes/console.md`'s "Wave 7 plan" §1 is
// the design this proves: a group's own default expand/collapse state, the
// three renderings by surface (inline disclosure on the phone sheet and the
// expanded desktop rail, a `ui/menu` flyout on the collapsed desktop rail).
//
// ★ A SEPARATE FILE FROM `admin-rail.test.tsx`, DELIBERATELY. `AdminRail`'s
// whole-rail collapse and each group's own expand state are module-level
// `useSyncExternalStore` stores (`admin-rail.tsx`'s own header comment
// explains why — a hydration-safe external store, not `useState`), which
// persist for the LIFETIME OF THE MODULE, not per test — correct for a real
// page (one `AdminRail` ever mounts), but it means any test in THIS file
// that ends with the whole rail collapsed would leak that into whatever
// runs after it in the SAME file (vitest isolates modules PER FILE, not per
// `it()`). Found empirically: appending these cases to `admin-rail.test.tsx`
// made an unrelated, later test in that file fail — its own collapse-toggle
// test had already flipped the shared module cache. Two disciplines here
// because of that: a fresh file (no interference from `admin-rail.test.tsx`'s
// own collapse-toggle test), and inside this file, the ONE case that
// collapses the whole rail (`the collapsed rail turns a group into a menu`)
// is ordered LAST, so nothing after it depends on the rail starting expanded.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { AdminRail, type AdminRailItem } from "@/components/admin/admin-rail";

// The rail reads the path itself; «التسجيل» is the page every case is on.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), usePathname: () => "/ar/app/admin/scoring" }));

const GROUPED_ITEMS: AdminRailItem[] = [
  { key: "dashboard", href: "/app/admin", label: "لوحة التحكم", icon: "home", exact: true },
  {
    key: "moderation",
    label: "الإشراف",
    icon: "alertTriangle",
    children: [
      { key: "moderationComments", href: "/app/admin/moderation/comments", label: "التعليقات" },
      { key: "moderationPhotos", href: "/app/admin/moderation/photos", label: "الصور" },
    ],
  },
  {
    key: "points",
    label: "النقاط والتقدير",
    icon: "star",
    children: [
      { key: "scoring", href: "/app/admin/scoring", label: "التسجيل" },
      { key: "recognition", href: "/app/admin/recognition", label: "التكريم" },
    ],
  },
];

function renderRail() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">
        <AdminRail items={GROUPED_ITEMS} brand="لوحة إدارة المؤسسة" collapseLabel="طيّ قائمة الإدارة" expandLabel="توسيع قائمة الإدارة" openLabel="فتح قائمة الإدارة" />
      </Direction.Provider>
    </NextIntlClientProvider>,
  );
}

describe("AdminRail — disclosure groups (wave 7, DEC-137)", () => {
  it("a group with no current child starts collapsed, and its own button reveals its children on click", async () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
    const group = within(nav).getByRole("button", { name: "الإشراف" });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).queryByRole("link", { name: "التعليقات" })).not.toBeInTheDocument();

    await userEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByRole("link", { name: "التعليقات" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "الصور" })).toBeInTheDocument();
  });

  it("a group containing the current route starts expanded, with the current child marked", () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
    expect(within(nav).getByRole("button", { name: "النقاط والتقدير" })).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByRole("link", { name: "التسجيل" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "التكريم" })).not.toHaveAttribute("aria-current");
  });

  it("the phone sheet renders the same inline disclosure, never a menu, and still closes on a child link", async () => {
    renderRail();
    await userEvent.click(screen.getByRole("button", { name: "فتح قائمة الإدارة" }));
    const dialog = screen.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });

    // Already expanded — `points` contains the current route.
    expect(within(dialog).getByRole("button", { name: "النقاط والتقدير" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(dialog).getByRole("link", { name: "التسجيل" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no axe violations with a group expanded on the desktop rail and the phone drawer open", async () => {
    const { container } = renderRail();
    const nav = screen.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
    await userEvent.click(within(nav).getByRole("button", { name: "الإشراف" }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "فتح قائمة الإدارة" }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);

  // ★ LAST — see the file header. Collapses the whole rail's module-level
  // store; nothing after this case may assume the rail starts expanded.
  it("the collapsed (icon-only) desktop rail turns a group into a menu of its children", async () => {
    renderRail();
    await userEvent.click(screen.getByRole("button", { name: "طيّ قائمة الإدارة" }));

    const trigger = screen.getByRole("button", { name: "الإشراف" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "التعليقات" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "الصور" })).toBeInTheDocument();
  });
});
