// `<TagChip>` inside the playground's scope — DEC-183, DEC-186 §2 and §5, REQ-UIX-030.
//
// New cases live here, never in `tag-chip.test.tsx`, which is evidence (DEC-186 §9).
// jsdom has no layout engine and does not evaluate the variant's selector, so these assert
// the two halves of the promise directly: every class the chip had before wave 15 is still
// on it, byte for byte — that is «outside the scope nothing moves» — and the scope's look is
// ADDED under `pg:`, so it can win only inside `.theme-play`.
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { TagChip } from "@/components/ui/tag-chip";
import ar from "@/messages/ar/browse.json";

function Scope({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <div className="theme-play">{children}</div>
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

// The class strings as they stood at `3151630`, before wave 15.
const BEFORE = "inline-flex w-fit items-center gap-1.5 rounded-field border px-3 py-1 text-caption".split(" ");
const BEFORE_UNSELECTED = "border-edge bg-surface text-fg-body".split(" ");
const BEFORE_SELECTED = "border-navy-900 bg-navy-900 text-white".split(" ");
const BEFORE_REMOVE = "-me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading".split(" ");

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("TagChip — the scope adds, it never replaces", () => {
  it("keeps every class it had before wave 15, unselected", () => {
    const { container } = render(<TagChip label="تقارير" />);
    const chip = classes(container.firstElementChild);
    for (const cls of [...BEFORE, ...BEFORE_UNSELECTED]) expect(chip, cls).toContain(cls);
  });

  it("keeps every class it had before wave 15, selected", () => {
    const { container } = render(
      <Scope>
        <TagChip label="تقارير" href="/app/sessions?tag=reports" selected />
      </Scope>,
    );
    const chip = classes(container.querySelector("div > span"));
    for (const cls of [...BEFORE, ...BEFORE_SELECTED]) expect(chip, cls).toContain(cls);
  });

  it("every class it adds is under a scope variant", () => {
    const { container } = render(<TagChip label="تقارير" selected onRemove={() => {}} removeLabel="أزل الوسم: تقارير" />);
    const known = new Set([...BEFORE, ...BEFORE_SELECTED, ...BEFORE_UNSELECTED, ...BEFORE_REMOVE]);
    for (const el of [container.firstElementChild, container.querySelector("button")]) {
      for (const cls of classes(el)) if (!known.has(cls)) expect(cls, cls).toMatch(/^pg(-dark|-light)?:/);
    }
  });
});

describe("TagChip — the look inside the scope (`04-components.md`)", () => {
  it("is a pill on the raised surface, 13 px at 700", () => {
    const { container } = render(<TagChip label="أتمتة" count={12} />);
    expect(container.firstElementChild).toHaveClass("pg:rounded-pill", "pg:bg-raised", "pg:text-[0.8125rem]", "pg:font-bold");
    expect(container.firstElementChild).not.toHaveClass("pg:bg-accent");
  });

  it("selected takes the accent with the ink on it — and aria-current stays the non-colour channel", () => {
    render(
      <Scope>
        <TagChip label="تقارير" href="/app/sessions?tag=reports" selected />
      </Scope>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link.parentElement).toHaveClass("pg:bg-accent", "pg:text-on-accent", "pg:border-accent");
    expect(link.parentElement).not.toHaveClass("pg:bg-raised");
  });

  it("the remove button keeps its 24 px glyph and gains a 44 px hit area inside the scope", () => {
    render(<TagChip label="تقارير" onRemove={() => {}} removeLabel="أزل الوسم: تقارير" />);
    const button = screen.getByRole("button", { name: "أزل الوسم: تقارير" });
    // 24 px + 10 px on each side = 44 px.
    expect(button).toHaveClass("size-6", "pg:relative", "pg:after:absolute", "pg:after:-inset-2.5");
  });

  it("the remove link, too", () => {
    render(
      <Scope>
        <TagChip label="تقارير" removeHref="/app/sessions" removeLabel="أزل الوسم: تقارير" />
      </Scope>,
    );
    expect(screen.getByRole("link", { name: "أزل الوسم: تقارير" })).toHaveClass("pg:after:-inset-2.5");
  });

  it("is accessible inside the scope, every form", async () => {
    const { container } = render(
      <Scope>
        <TagChip label="تقارير" />
        <TagChip label="أتمتة" count={12} href="/app/sessions?tag=automation" selected />
        <TagChip label="تصميم" onRemove={() => {}} removeLabel="أزل الوسم: تصميم" />
      </Scope>,
    );
    await expectAccessible(container);
  });
});
