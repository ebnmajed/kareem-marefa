// `ui/submit-button` inside the playground's scope — DEC-199 §3, REQ-UIX-051.
//
// It draws nothing of its own: it is `ui/button` with `type="submit"` and the
// enclosing form's pending state. So its playground design is the button's, and
// what is held here is that it stays a pure composition — the day it grows a
// class of its own, that class needs a design.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
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

describe("ui/submit-button — inside the scope", () => {
  it("is the primary button, class for class, and submits", () => {
    render(<form><SubmitButton>احفظ</SubmitButton></form>, { wrapper: Wrap });
    const button = screen.getByRole("button", { name: "احفظ" });
    expect(button.closest(".theme-play")).not.toBeNull();
    expect(button).toHaveAttribute("type", "submit");
    const list = tokens(button.getAttribute("class"));
    for (const c of tokens(buttonClass("primary", "lg"))) expect(list).toContain(c);
    // The button's own face inside the scope: the display face, the pill, the press.
    expect(inside(button)).toEqual(expect.arrayContaining(["pg:rounded-pill", "pg:font-display", "pg:font-extrabold", "pg:shadow-press", "pg:text-play-sm"]));
  });

  it.each(["secondary", "quiet", "danger"] as const)("takes the button's %s face unchanged", (variant) => {
    render(<form><SubmitButton variant={variant} size="md">أرسل</SubmitButton></form>, { wrapper: Wrap });
    const list = tokens(screen.getByRole("button", { name: "أرسل" }).getAttribute("class"));
    for (const c of tokens(buttonClass(variant, "md"))) expect(list).toContain(c);
  });

  it("pending keeps the label, marks the control busy and cannot be pressed twice", async () => {
    const { container } = render(<form><SubmitButton pending pendingLabel="جارٍ الحفظ">احفظ</SubmitButton></form>, { wrapper: Wrap });
    const button = screen.getByRole("button", { name: /احفظ/ });
    expect(button).toHaveTextContent("احفظ");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    await expectAccessible(container);
  });

  it("outside a form it simply never lights up", () => {
    render(<SubmitButton>احفظ</SubmitButton>, { wrapper: Wrap });
    expect(screen.getByRole("button", { name: "احفظ" })).not.toHaveAttribute("aria-busy");
  });
});
