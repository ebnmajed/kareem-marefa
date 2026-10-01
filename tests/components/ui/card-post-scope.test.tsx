// `<Card density="post">` inside the playground's scope — wave 18, REQ-UIX-057, DEC-206 §4.80. Add-only: the four
// densities are `card.test.tsx`'s and `card-scope.test.tsx`'s, untouched. A post is a column, a container, and
// NOT one link — it holds several.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Card } from "@/components/ui/card";

describe("Card density=post", () => {
  it("is an article that is a column and a container, with the scope's panel corner", () => {
    const { container } = render(
      <div className="theme-play">
        <Card density="post">
          <p>منشور</p>
        </Card>
      </div>,
    );
    const article = container.querySelector("article")!;
    expect(article).toHaveAttribute("data-density", "post");
    expect(article).toHaveClass("@container", "flex-col", "rounded-panel", "bg-surface", "border-edge");
    expect(article.className).not.toContain("overflow-hidden");
  });

  it("ignores href: a post holds its own links and is never one wrapping link", () => {
    render(
      <Card density="post" href="/app/sessions/s1">
        <a href="#presenter">سارة</a>
        <a href="#session">الملصق</a>
      </Card>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.querySelector("a")).toBeNull();
  });

  it("is accessible inside the scope with several interactives in it", async () => {
    const { container } = render(
      <div className="theme-play">
        <Card density="post">
          <a href="#presenter">سارة القحطاني</a>
          <button type="button">إعجاب 48</button>
          <a href="#session">احجز مقعدك</a>
        </Card>
      </div>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
