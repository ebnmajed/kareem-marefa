// `ui/page-header` inside the playground's scope — DEC-199 §3, §5.25 – §5.26, REQ-UIX-051.
//
// The design's task list never named this file, so wave 15 did not migrate it and
// every scoped screen drew its title in the old face. `page-header.test.tsx` is
// the existing suite and is not edited; this file holds what wave 17 added.
//
// jsdom computes no CSS, so the two promises are held the way they can be:
// outside the scope nothing moved — take the scope's classes away and what is left
// is the string `main` rendered — and inside it the `h1`, and only the `h1`, is
// the display face.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { PageHeader } from "@/components/ui/page-header";
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

function mount() {
  return render(
    <PageHeader
      eyebrow="الجلسات"
      title="How we halved reporting time — تقرير"
      description="الخميس 6:30 م · قاعة الرياض"
      breadcrumb={[
        { href: "/app", label: "الرئيسية" },
        { href: "/app/sessions", label: "الجلسات" },
      ]}
      breadcrumbLabel="مسار الصفحة"
      actions={<button type="button">احجز</button>}
    />,
    { wrapper: Wrap },
  );
}

describe("ui/page-header — inside the scope", () => {
  it("renders inside the scope's element", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 }).closest(".theme-play")).not.toBeNull();
  });

  it("the h1 is the display face at display-md, balanced — and keeps every class it had", () => {
    mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(outside(h1)).toBe("text-h1 text-fg-heading");
    expect(inside(h1)).toEqual(["pg:font-display", "pg:font-extrabold", "pg:text-play-md", "pg:text-balance"]);
  });

  it("the scope's classes come after the ones that existed, never between", () => {
    mount();
    const list = tokens(screen.getByRole("heading", { level: 1 }).getAttribute("class"));
    const first = list.findIndex(scoped);
    expect(first).toBeGreaterThan(0);
    expect(list.slice(first).every(scoped)).toBe(true);
  });

  it("nothing else in the header is set in the display face: breadcrumb, eyebrow and description stay the body face", () => {
    const { container } = mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    for (const el of container.querySelectorAll("header *")) {
      if (el === h1) continue;
      expect(tokens(el.getAttribute("class")).some((c) => c.includes("font-display")), el.outerHTML.slice(0, 80)).toBe(false);
    }
  });

  it("reads semantic names only — no raw palette name anywhere in what it renders", () => {
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d/);
  });

  it("RTL: the title is bidi-isolated and the breadcrumb's separator mirrors", async () => {
    const { container } = mount();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { level: 1 }).querySelector("bdi")).not.toBeNull();
    const chevron = container.querySelector("nav svg[data-direction='forward']")!;
    expect(tokens(chevron.getAttribute("class"))).toContain("rtl:-scale-x-100");
    await expectAccessible(container);
  });
});
