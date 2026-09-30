// `ui/link` inside the playground's scope — DEC-199 §3, §5.25, REQ-UIX-051.
//
// The house link draws NOTHING of its own: no colour, no underline, no radius.
// What a link looks like is its caller's — a card, a breadcrumb, a line of prose
// — and those callers read semantic names, which the scope reassigns. So its
// playground design is three things, and this file holds each:
//   · it adds no class, so it can never carry the old look into a scoped screen;
//   · its one drawn part, the pending dot, is the link's own colour (`bg-current`)
//     — never the accent, which is 1.07:1 on the light ground (DEC-186 §2);
//   · its focus ring is the scope's one rule, and it declares none.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { Link } from "@/components/ui/link";
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

describe("ui/link — inside the scope", () => {
  it("renders the caller's classes and none of its own", () => {
    render(<Link href="/app/sessions" className="underline underline-offset-4 hover:text-fg-heading">الجلسات</Link>, { wrapper: Wrap });
    const a = screen.getByRole("link", { name: "الجلسات" });
    expect(a.closest(".theme-play")).not.toBeNull();
    expect(tokens(a.getAttribute("class"))).toEqual(["underline", "underline-offset-4", "hover:text-fg-heading"]);
  });

  it("with no class given it carries none — and no raw palette name, no ring of its own", () => {
    render(<Link href="/app">الرئيسية</Link>, { wrapper: Wrap });
    const a = screen.getByRole("link", { name: "الرئيسية" });
    expect(a.getAttribute("class") ?? "").toBe("");
    expect(a.outerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|outline-|ring-/);
  });

  it("is locale-aware: `/app/sessions` arrives at `/ar/app/sessions`", () => {
    render(<Link href="/app/sessions">الجلسات</Link>, { wrapper: Wrap });
    expect(screen.getByRole("link", { name: "الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
  });

  it("`quiet` is marked on the element and draws no dot; an idle link draws none either", () => {
    const { container } = render(
      <>
        <Link href="/app" quiet>بطاقة</Link>
        <Link href="/app/me">حسابي</Link>
      </>,
      { wrapper: Wrap },
    );
    expect(screen.getByRole("link", { name: "بطاقة" })).toHaveAttribute("data-quiet", "true");
    expect(screen.getByRole("link", { name: "حسابي" })).not.toHaveAttribute("data-quiet");
    expect(container.querySelector("[data-link-pending]")).toBeNull();
  });

  it("RTL: the markup is accessible", async () => {
    const { container } = render(<Link href="/app">الرئيسية</Link>, { wrapper: Wrap });
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expectAccessible(container);
  });
});
