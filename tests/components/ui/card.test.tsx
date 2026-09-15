// `<Card>` — `16` §6.4. One component, four densities; the whole card is one
// link with the bookmark as a NESTED button (§6.4's own wording, repeated in
// `.claude/agents/content.md` and the lead's task message). This file proves
// the stopped propagation and the nested control's independent
// reachability directly, rather than trusting axe's `nested-interactive`
// rule — which this pattern deliberately trips, and which is disabled below
// with the same citation once the real concern is shown not to apply.
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
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
  it("shows a two-letter glyph built from the title's first two words, never an empty box", () => {
    render(<CardMedia placeholderFrom="ورشة عمل" />);
    expect(screen.getByText("وع")).toBeInTheDocument();
  });

  it("takes the first two characters of a single-word title", () => {
    render(<CardMedia placeholderFrom="مؤتمر" />);
    expect(screen.getByText("مؤ")).toBeInTheDocument();
  });

  it("picks the same tint for the same title, deterministically", () => {
    const { container: a } = render(<CardMedia placeholderFrom="جلسة الإخراج" />);
    const { container: b } = render(<CardMedia placeholderFrom="جلسة الإخراج" />);
    expect(a.querySelector("[aria-hidden]")?.className).toBe(b.querySelector("[aria-hidden]")?.className);
  });

  it("renders a real image, not a placeholder, once a src is given", () => {
    // Not `getByRole("img")`: an empty `alt` (the default, decorative — the
    // card's own heading carries the meaning) computes to role
    // "presentation", removed from the accessibility tree on purpose.
    const { container } = render(<CardMedia src="https://example.com/poster.webp" alt="" placeholderFrom="جلسة" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/poster.webp");
  });
});
