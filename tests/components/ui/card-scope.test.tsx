// `<Card>` inside the playground's scope — DEC-183, DEC-186 §2 and §5, REQ-UIX-030, REQ-UIX-026.
//
// New cases live here, never in `card.test.tsx`, which is evidence (DEC-186 §9).
import type React from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Card, CardActions, CardBody, CardMedia, MEDIA_TINTS } from "@/components/ui/card";
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

async function expectAccessible(container: HTMLElement) {
  // `nested-interactive` is off for the reason `card.test.tsx` gives: the bookmark is a nested
  // control by design (`16` §6.4), independently reachable and never navigating.
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false }, "nested-interactive": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood at `477d6ba`, before wave 15.
const BEFORE_CARD = "group relative overflow-hidden rounded-card border border-edge bg-surface shadow-card transition-shadow duration-150 hover:shadow-raise".split(" ");
const BEFORE_MEDIA = "relative shrink-0 overflow-hidden bg-navy-900 aspect-[4/5]".split(" ");
const BEFORE_BODY = "flex min-w-0 flex-1 flex-col gap-1.5 p-4".split(" ");

function expectAdded(el: Element | null, before: string[]) {
  const got = classes(el);
  for (const cls of before) expect(got, cls).toContain(cls);
  for (const cls of got) if (!before.includes(cls)) expect(cls, cls).toMatch(/^pg:/);
}

describe("Card — the scope adds, it never replaces", () => {
  it("the card keeps every class it had", () => {
    const { container } = render(
      <Card>
        <CardBody>محتوى</CardBody>
      </Card>,
    );
    expectAdded(container.querySelector("article"), BEFORE_CARD);
  });

  it("the media box keeps every class it had, and MEDIA_TINTS are untouched", () => {
    const { container } = render(<CardMedia placeholderFrom="لوحة تحكم لا يهجرها أحد" />);
    expectAdded(container.firstElementChild, BEFORE_MEDIA);
    for (const tint of MEDIA_TINTS) expect(tint).not.toMatch(/pg/);
  });

  it("the body keeps every class it had", () => {
    const { container } = render(<CardBody>محتوى</CardBody>);
    expectAdded(container.firstElementChild, BEFORE_BODY);
  });
});

describe("Card — the look inside the scope (`04-components.md`)", () => {
  it("takes the 22 px panel radius and drops every shadow — at rest and on hover", () => {
    const { container } = render(
      <Card>
        <CardBody>محتوى</CardBody>
      </Card>,
    );
    expect(container.querySelector("article")).toHaveClass("pg:rounded-panel", "pg:shadow-none", "pg:hover:shadow-none");
  });

  it("does not move on hover inside the scope: no transition, nothing scales — the hairline steps up in place", () => {
    const { container } = render(
      <Card>
        <CardBody>محتوى</CardBody>
      </Card>,
    );
    const article = container.querySelector("article");
    expect(article).toHaveClass("pg:transition-none", "pg:hover:border-edge-strong");
    expect(article?.className).not.toMatch(/scale/);
  });

  it("the body is 12 px on the phone and 16 px from sm up", () => {
    const { container } = render(<CardBody>محتوى</CardBody>);
    expect(container.firstElementChild).toHaveClass("pg:p-3", "pg:sm:p-4");
  });

  it("the letterbox around a contained image is the raised surface, and the image is still whole", () => {
    const { container } = render(<CardMedia src="/posters/demo.webp" placeholderFrom="ملصق" />);
    expect(container.firstElementChild).toHaveClass("pg:bg-raised");
    expect(container.querySelector("img")).toHaveClass("object-contain");
  });

  it("★ the linked card's ring is drawn inside the link in the scope — the article clips, and the link fills it", () => {
    const { container } = render(
      <Scope>
        <Card href="/app/sessions/s-1">
          <CardBody>محتوى</CardBody>
        </Card>
      </Scope>,
    );
    const link = container.querySelector("article > a")!;
    // What it had stays, byte for byte — inert today, and on main.
    for (const cls of ["block", "h-full", "rounded-card", "focus-visible:outline-2", "focus-visible:-outline-offset-2", "focus-visible:outline-[var(--ring)]"]) {
      expect(link, cls).toHaveClass(cls);
    }
    // The scope's rule reads the variable; the corner follows the article's.
    expect(link).toHaveClass("pg:[--focus-offset:calc(var(--focus-width)*-1)]", "pg:rounded-panel");
    // Never without `pg:` — outside the scope the global rule must not change this wave.
    expect(link.className).not.toMatch(/(?:^|\s)\[--focus-offset/);
  });

  it("is accessible inside the scope, linked, with media and a nested action", async () => {
    const { container } = render(
      <Scope>
        <Card href="/app/sessions/s-1">
          <CardMedia placeholderFrom="العرض في 5 شرائح" />
          <CardBody>
            <p>العرض في 5 شرائح</p>
          </CardBody>
          <CardActions>
            <button type="button" aria-label="احفظ الجلسة">
              ☆
            </button>
          </CardActions>
        </Card>
        <Card density="row">
          <CardMedia placeholderFrom="قيادة" />
          <CardBody>قيادة</CardBody>
        </Card>
      </Scope>,
    );
    await expectAccessible(container);
  });
});
