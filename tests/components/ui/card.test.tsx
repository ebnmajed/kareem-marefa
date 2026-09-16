// `<Card>` — `16` §6.4. One component, four densities; the whole card is one
// link with the bookmark as a NESTED button (§6.4's own wording, repeated in
// `.claude/agents/content.md` and the lead's task message). This file proves
// the stopped propagation and the nested control's independent
// reachability directly, rather than trusting axe's `nested-interactive`
// rule — which this pattern deliberately trips, and which is disabled below
// with the same citation once the real concern is shown not to apply.
import type React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Card, CardActions, CardBody, CardMedia, MEDIA_TINTS } from "@/components/ui/card";
import ar from "@/messages/ar/browse.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

function ExampleCard({ onBookmark, density }: { onBookmark: () => void; density?: React.ComponentProps<typeof Card>["density"] }) {
  return (
    <Card href="/app/sessions/1" density={density}>
      <CardMedia placeholderFrom="جلسة تصوير الأفلام الوثائقية" />
      <CardBody>
        <h3>جلسة تصوير الأفلام الوثائقية</h3>
      </CardBody>
      <CardActions>
        <button type="button" aria-label="أضف إلى المحفوظات" onClick={onBookmark}>
          ★
        </button>
      </CardActions>
    </Card>
  );
}

describe("Card — the whole surface", () => {
  it("renders as one link when href is given", () => {
    render(
      <Wrap>
        <ExampleCard onBookmark={() => {}} />
      </Wrap>,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("/app/sessions/1"));
  });

  it("renders without a link when href is omitted", () => {
    render(
      <Card>
        <CardBody>محتوى</CardBody>
      </Card>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("raises on hover by the shadow token and never scales — the UI-library default the brief bans", () => {
    const { container } = render(
      <Card className="probe">
        <CardBody>محتوى</CardBody>
      </Card>,
    );
    const article = container.querySelector("article.probe");
    expect(article).toHaveClass("hover:shadow-raise");
    expect(article?.className).not.toMatch(/scale/);
  });

  it.each([
    ["grid", "flex-col"],
    ["row", "flex-row"],
    ["compact", "flex-row"],
    ["wide", "flex-row"],
  ] as const)("density=%s lays its slots out as %s", (density, expectedClass) => {
    const { container } = render(
      <Wrap>
        <ExampleCard onBookmark={() => {}} density={density} />
      </Wrap>,
    );
    const slot = container.querySelector(`[data-density="${density}"]`);
    expect(slot).toHaveClass(expectedClass);
  });
});

describe("Card — REQ-NFR-007, the nested action", () => {
  it("keeps its own accessible name, distinct from the card's own link", () => {
    render(
      <Wrap>
        <ExampleCard onBookmark={() => {}} />
      </Wrap>,
    );
    const link = screen.getByRole("link");
    const button = screen.getByRole("button", { name: "أضف إلى المحفوظات" });
    expect(button).not.toBe(link);
  });

  it("stays independently reachable by Tab, as the second stop after the card's link", async () => {
    render(
      <Wrap>
        <ExampleCard onBookmark={() => {}} />
      </Wrap>,
    );
    const link = screen.getByRole("link");
    const button = screen.getByRole("button", { name: "أضف إلى المحفوظات" });
    await userEvent.tab();
    expect(document.activeElement).toBe(link);
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
  });

  it("CardActions stops its click from reaching an ancestor — clicking elsewhere on the card still bubbles", async () => {
    const onBookmark = vi.fn();
    const onCardAreaClick = vi.fn();
    render(
      <Wrap>
        <div onClick={onCardAreaClick}>
          <ExampleCard onBookmark={onBookmark} />
        </div>
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("button", { name: "أضف إلى المحفوظات" }));
    expect(onBookmark).toHaveBeenCalledTimes(1);
    expect(onCardAreaClick).not.toHaveBeenCalled();

    // A click that does NOT land on the nested action bubbles normally —
    // proving the isolation is `CardActions`' own doing, not something that
    // swallows every click on the card.
    await userEvent.click(screen.getByRole("link"));
    expect(onCardAreaClick).toHaveBeenCalledTimes(1);
  });

  it("is accessible aside from the intentional nested-interactive pattern (16 §6.4)", async () => {
    const { container } = render(
      <Wrap>
        <ExampleCard onBookmark={() => {}} />
      </Wrap>,
    );
    const { violations } = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
        // ★ `16` §6.4 / `.claude/agents/content.md` / the lead's task
        // message specify this literally: "the whole card is one link with
        // the bookmark as a NESTED button". Real DOM nesting of an
        // interactive inside an interactive is exactly what this
        // best-practice rule flags — the two tests above prove the concern
        // it stands in for (an inner control a keyboard/AT user cannot
        // reach independently) does not hold here.
        "nested-interactive": { enabled: false },
      },
    });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("CardMedia — the generated placeholder", () => {
  // ★ The lead's real-build finding: two letters read as a pause/loading
  // glyph («اا») for any title whose first word or two both started with
  // «ا» — one letter only now, matching `avatar.tsx`'s `initial()`.
  it("shows a one-letter glyph built from the title's first word, never an empty box", () => {
    render(<CardMedia placeholderFrom="ورشة عمل" />);
    expect(screen.getByText("و")).toBeInTheDocument();
  });

  it("takes the first character of a single-word title", () => {
    render(<CardMedia placeholderFrom="مؤتمر" />);
    expect(screen.getByText("م")).toBeInTheDocument();
  });

  it("skips a leading «ال» so the glyph is the noun's own first letter, not «ا» for nearly every Arabic title", () => {
    render(<CardMedia placeholderFrom="الجلسة التمهيدية" />);
    expect(screen.getByText("ج")).toBeInTheDocument();
  });

  it("a single word that is only «ال» itself is not emptied by the skip", () => {
    render(<CardMedia placeholderFrom="ال" />);
    expect(screen.getByText("ا")).toBeInTheDocument();
  });

  it("picks the same tint for the same title, deterministically", () => {
    const { container: a } = render(<CardMedia placeholderFrom="جلسة الإخراج" />);
    const { container: b } = render(<CardMedia placeholderFrom="جلسة الإخراج" />);
    expect(a.querySelector("[aria-hidden]")?.className).toBe(b.querySelector("[aria-hidden]")?.className);
  });

  // R7 (`sessions`' request, `/s/[id]`'s own dark background): the pick
  // narrows to `MEDIA_TINTS`' three navy entries — never one of the three
  // silver ones, which would be unreadable against a dark page — while
  // staying keyed to the same hash, so a title's tint does not change
  // depending on whether the surrounding card happens to ask for `"dark"`.
  it('placeholderTone="dark" never yields a silver tint, across many titles, and stays deterministic', () => {
    const titles = ["جلسة تصوير الأفلام", "ورشة عمل", "مؤتمر", "الجلسة التمهيدية", "ندوة", "لقاء", "معرض", "دورة", "محاضرة", "نقاش"];
    for (const title of titles) {
      const { container } = render(<CardMedia placeholderFrom={title} placeholderTone="dark" />);
      const el = container.querySelector("[aria-hidden]");
      expect(el?.className, title).toMatch(/bg-navy-(950|900|800)\b/);
      expect(el?.className, title).not.toMatch(/bg-silver-/);
    }

    const { container: a } = render(<CardMedia placeholderFrom="جلسة الإخراج" placeholderTone="dark" />);
    const { container: b } = render(<CardMedia placeholderFrom="جلسة الإخراج" placeholderTone="dark" />);
    expect(a.querySelector("[aria-hidden]")?.className).toBe(b.querySelector("[aria-hidden]")?.className);
  });

  it('placeholderTone="dark" absent leaves behaviour unchanged — the full six-tint pool stays reachable', () => {
    // No `placeholderTone` still reaches the light half of the pool for AT
    // LEAST one of these titles — proves the prop's absence, not merely
    // that "dark" avoids silver (the test above already covers that half).
    const titles = ["جلسة تصوير الأفلام", "ورشة عمل", "مؤتمر", "الجلسة التمهيدية", "ندوة", "لقاء", "معرض", "دورة", "محاضرة", "نقاش"];
    const sawSilver = titles.some((title) => {
      const { container } = render(<CardMedia placeholderFrom={title} />);
      return /bg-silver-(200|300|400)\b/.test(container.querySelector("[aria-hidden]")?.className ?? "");
    });
    expect(sawSilver).toBe(true);
  });

  it("renders a real image, not a placeholder, once a src is given", () => {
    // Not `getByRole("img")`: an empty `alt` (the default, decorative — the
    // card's own heading carries the meaning) computes to role
    // "presentation", removed from the accessibility tree on purpose.
    const { container } = render(<CardMedia src="https://example.com/poster.webp" alt="" placeholderFrom="جلسة" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/poster.webp");
  });
});

// ★ The lead's real-build finding, guarded against recurring: `MEDIA_TINTS`
// once referenced `bg-navy-600`/`bg-navy-200`, tokens `globals.css` never
// defined — a hand-copied hex pair in a test would not have caught this
// (`avatar.test.tsx` had exactly that and missed it too). This reads the
// actual `@theme` block and checks every class in the real array against it,
// so a token typo fails here instead of rendering invisibly in the browser.
describe("MEDIA_TINTS — every class resolves to a real design token", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const definedTokens = new Set([...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]!));
  const KNOWN_NON_TOKEN_UTILITIES = new Set(["white"]); // a Tailwind builtin, not a --color-* token

  it.each(MEDIA_TINTS)("%s", (tintClasses) => {
    const classes = tintClasses.split(/\s+/);
    expect(classes.length).toBeGreaterThan(0);
    for (const cls of classes) {
      const match = /^(?:bg|text)-([a-z0-9-]+)$/.exec(cls);
      if (!match) continue;
      const name = match[1]!;
      if (KNOWN_NON_TOKEN_UTILITIES.has(name)) continue;
      expect(definedTokens.has(name), `${cls} has no matching --color-${name} in globals.css`).toBe(true);
    }
  });
});
