// `ui/section-header` inside the playground's scope — DEC-199 §3, §5.26, REQ-UIX-051.
//
// An `h2` is the display face at display-sm; an `h3` stays the body face. The
// face is set on the TITLE, not on the heading: the count beside it is a small
// muted number, and the display face has no weight below 700.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { SectionHeader } from "@/components/ui/section-header";
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

describe("ui/section-header — inside the scope", () => {
  it("an h2 takes display-sm, and its title the display face; every class it had is kept", () => {
    render(<SectionHeader title="المواد" count={3} description="تُفتح بعد انتهاء الجلسة." />, { wrapper: Wrap });
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.closest(".theme-play")).not.toBeNull();
    expect(outside(h2)).toBe("text-h2 text-fg-heading");
    expect(inside(h2)).toEqual(["pg:text-play-sm"]);
    const title = h2.querySelector("bdi")!;
    expect(title).toHaveTextContent("المواد");
    expect(tokens(title.getAttribute("class"))).toEqual(["pg:font-display", "pg:font-extrabold"]);
  });

  it("the count stays the body face, muted, and keeps the separator a screen reader can hear", () => {
    render(<SectionHeader title="هذا الأسبوع" count={1} />, { wrapper: Wrap });
    const h2 = screen.getByRole("heading", { level: 2 });
    const count = h2.querySelector("span.text-label")!;
    expect(tokens(count.getAttribute("class")).some((c) => c.includes("font-display"))).toBe(false);
    expect(tokens(count.getAttribute("class"))).toContain("text-fg-muted");
    expect(h2.textContent).toBe("هذا الأسبوع (1)");
  });

  it("an h3 takes nothing from the scope: the body face, as outside it", () => {
    render(<SectionHeader as="h3" title="النقاش" />, { wrapper: Wrap });
    const h3 = screen.getByRole("heading", { level: 3 });
    expect(tokens(h3.getAttribute("class"))).toEqual(["text-h3", "text-fg-heading"]);
    expect(h3.querySelector("bdi")!.getAttribute("class")).toBeNull();
  });

  it("RTL: the title is bidi-isolated, the id is the jump target, and the markup is accessible", async () => {
    const { container } = render(<SectionHeader id="materials" title="Q3 — المواد" actions={<button type="button">أضف</button>} />, { wrapper: Wrap });
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "materials");
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d/);
    await expectAccessible(container);
  });
});
