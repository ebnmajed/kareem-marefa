// `ui/icon-button` inside the playground's scope — DEC-199 §3, REQ-UIX-051.
//
// It composes `ui/button`, so inside the scope it is already a circle with the
// button's faces. What a square needs of its own: 52 px at `lg`. `sm` stays 36 px
// with no larger hit area — see the component for what one cost.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { ButtonVariant, Size } from "@/components/ui";
import { buttonBase, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon } from "@/components/ui/icons";
import { PlayScope } from "@/components/ui/scope";

const MESSAGES = {};

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <Direction.Provider dir="rtl">
        <PlayScope>{children}</PlayScope>
      </Direction.Provider>
    </NextIntlClientProvider>
  );
}

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const outside = (el: Element | null) => tokens(el?.getAttribute("class")).filter((c) => !scoped(c)).join(" ");
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The squares as they stood before wave 17.
const BEFORE: Record<Size, string> = {
  sm: "size-9 text-[1.125rem]",
  md: "size-11 text-[1.25rem]",
  lg: "size-12 text-[1.375rem]",
};
const ADDED: Record<Size, string[]> = {
  sm: [],
  md: [],
  lg: ["pg:size-13"],
};
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-45";

function mount(size: Size, variant: ButtonVariant = "ghost") {
  render(
    <IconButton label="إغلاق" size={size} variant={variant}>
      <CloseIcon />
    </IconButton>,
    { wrapper: Wrap },
  );
  return screen.getByRole("button", { name: "إغلاق" });
}

describe("ui/icon-button — inside the scope", () => {
  it.each(["sm", "md", "lg"] as const)("%s: it is the button's base and variant around its square, and the square adds only its scope classes", (size) => {
    const button = mount(size);
    expect(button.closest(".theme-play")).not.toBeNull();
    const list = tokens(button.getAttribute("class"));
    expect(list.join(" ")).toBe(tokens(`${buttonBase} ${BEFORE[size]} ${ADDED[size].join(" ")} ${buttonVariants.ghost} ${DISABLED}`).join(" "));
  });

  it("with the scope's classes taken away it is what main rendered", () => {
    const button = mount("sm");
    const mainBase = tokens(buttonBase).filter((c) => !scoped(c)).join(" ");
    const mainGhost = tokens(buttonVariants.ghost).filter((c) => !scoped(c)).join(" ");
    expect(outside(button)).toBe(`${mainBase} ${BEFORE.sm} ${mainGhost} ${DISABLED}`);
  });

  it("is a circle inside the scope: the button's pill on a square", () => {
    expect(inside(mount("md"))).toContain("pg:rounded-pill");
  });

  it("`sm` draws 36 px and adds nothing that overflows its box — a pseudo-element hit area made a phone page scroll sideways", () => {
    const cls = tokens(mount("sm").getAttribute("class"));
    expect(cls).toContain("size-9");
    expect(cls.some((c) => /after:|before:|-inset-/.test(c))).toBe(false);
  });

  it("nothing scales on hover, and the press is the button's — transform only", () => {
    const cls = mount("lg", "primary").getAttribute("class")!;
    expect(cls).not.toMatch(/hover:scale|hover:pg:scale|pg:hover:scale/);
    expect(cls).toContain("pg:transition-transform");
  });

  it("the name is on the element and is its tooltip; pending keeps the name", async () => {
    const { container } = render(
      <IconButton label="حذف" pending>
        <CloseIcon />
      </IconButton>,
      { wrapper: Wrap },
    );
    const button = screen.getByRole("button", { name: "حذف" });
    expect(button).toHaveAttribute("title", "حذف");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    await expectAccessible(container);
  });
});
