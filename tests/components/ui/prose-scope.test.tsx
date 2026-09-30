// `ui/prose` inside the playground's scope — DEC-199 §3, §5.25, REQ-UIX-051.
//
// Body text is the body face inside the scope as outside it. The scope adds the
// display face on an `h2` inside the text. A link is told from the text by its
// underline, in the text's own colour — never by the accent.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { Prose } from "@/components/ui/prose";
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

// The class string as it stood before wave 17.
const BEFORE =
  "max-w-prose text-fg-body text-body [&_p+p]:mt-4 [&_h2]:mt-8 [&_h2]:text-h3 [&_h3]:mt-6 [&_h3]:text-label [&_h3]:text-fg-heading " +
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_li+li]:mt-1.5 " +
  "[&_a]:text-fg-heading [&_a]:underline [&_a]:underline-offset-4";

function mount() {
  return render(
    <Prose>
      <h2>عن الجلسة</h2>
      <p>
        المواد في <a href="#top">صفحة الجلسة</a> بعد انتهائها.
      </p>
      <ul>
        <li>عرض من 5 شرائح</li>
      </ul>
    </Prose>,
    { wrapper: Wrap },
  );
}

describe("ui/prose — inside the scope", () => {
  it("keeps every class it had, and adds the display face on an h2 inside it — nothing else", () => {
    mount();
    const prose = screen.getByRole("heading", { level: 2 }).parentElement!;
    expect(prose.closest(".theme-play")).not.toBeNull();
    expect(outside(prose)).toBe(BEFORE);
    expect(inside(prose)).toEqual(["pg:[&_h2]:font-display", "pg:[&_h2]:font-extrabold"]);
  });

  it("a link is underlined in the text's colour, and the accent is never its colour", () => {
    mount();
    const cls = tokens(screen.getByRole("heading", { level: 2 }).parentElement!.getAttribute("class"));
    expect(cls).toContain("[&_a]:underline");
    expect(cls).toContain("[&_a]:text-fg-heading");
    expect(cls.some((c) => /accent|signal/.test(c))).toBe(false);
  });

  it("never justifies, letter-spaces or clips a line (`10` §1)", () => {
    mount();
    const cls = screen.getByRole("heading", { level: 2 }).parentElement!.getAttribute("class")!;
    expect(cls).not.toMatch(/text-justify|tracking-|overflow-hidden|truncate/);
  });

  it("the small size keeps the rhythm and the same two additions", () => {
    render(<Prose size="sm"><p>نص</p></Prose>, { wrapper: Wrap });
    const prose = screen.getByText("نص").parentElement!;
    expect(outside(prose)).toBe(BEFORE.replace("text-body ", "text-body-sm "));
    expect(inside(prose)).toHaveLength(2);
  });

  it("RTL: lists indent from the inline start, and the markup is accessible", async () => {
    const { container } = mount();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { level: 2 }).parentElement!.getAttribute("class")).toContain("[&_ul]:ps-5");
    await expectAccessible(container);
  });
});
