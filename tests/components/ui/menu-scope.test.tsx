// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `menu.tsx` had
// before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. Not wrapped in `<PlayScope>` — see
// `data-table-scope.test.tsx`'s header comment (`next/font/google` has no
// jsdom alias in `vitest.config.ts`, a lead-only file).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import { Menu } from "@/components/ui/menu";

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
