// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `menu.tsx` had
// before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. The token cases below are not wrapped in
// `<PlayScope>` — see `data-table-scope.test.tsx`'s header comment (jsdom
// applies no CSS regardless, so the assertion is the class string's
// presence); the portal cases (DEC-188, contract 6) DO mount the scope,
// which needs `@/lib/fonts` mocked — `tests/components/ui/
// scope-portal.test.tsx` is the pattern.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { Menu } from "@/components/ui/menu";
import { PlayScope } from "@/components/ui/scope";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

function Example() {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">
        <Menu
          trigger={<button type="button">القائمة</button>}
          items={[
            { label: "لوحة المؤسسة", href: "/app/admin", current: true },
            { label: "التصاميم", href: "/app/admin/templates" },
          ]}
        />
      </Direction.Provider>
    </NextIntlClientProvider>
  );
}

describe("Menu — the playground's scope, token-only", () => {
  it("the content panel drops its shadow inside the scope, keeping the border that already told it apart", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("shadow-[var(--shadow-card)]");
    expect(menu).toHaveClass("pg:shadow-none");
    expect(menu).toHaveClass("border", "border-edge");
  });

  it("the current-page item keeps its resting fill and gains the scope's raised step", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "القائمة" }));
    const current = screen.getByRole("menuitem", { name: "لوحة المؤسسة" });
    expect(current).toHaveClass("bg-silver-100");
    expect(current).toHaveClass("pg:bg-raised");
  });
});

describe("Menu — the portal (DEC-188, contract 6)", () => {
  it("★ inside the scope it lands INSIDE the scope's element, so the menu wears the scope", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PlayScope>
        <Example />
      </PlayScope>,
    );
    await user.click(screen.getByRole("button", { name: "القائمة" }));
    const menu = screen.getByRole("menu");
    expect(menu.closest(".theme-play")).toBe(container.firstElementChild);
    expect(menu.closest("[data-play-portal]")).not.toBeNull();
  });

  it("★ outside a scope it lands in <body>, exactly as before the wave", async () => {
    const user = userEvent.setup();
    const { container } = render(<Example />);
    await user.click(screen.getByRole("button", { name: "القائمة" }));
    const menu = screen.getByRole("menu");
    expect(menu.closest(".theme-play")).toBeNull();
    expect(menu.closest("[data-play-portal]")).toBeNull();
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });
});
