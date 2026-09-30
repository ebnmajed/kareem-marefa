// `ui/skeleton` inside the playground's scope — DEC-199 §3, REQ-UIX-050, REQ-UIX-005.
//
// Wave 15 gave it its scope class and no test that says so. `04-components.md`:
// «shaped like the content, opacity pulse only».
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { PlayScope } from "@/components/ui/scope";
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const outside = (el: Element | null) => tokens(el?.getAttribute("class")).filter((c) => !scoped(c)).join(" ");
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

const VARIANTS = ["text", "title", "card", "media", "row"] as const;

describe("ui/skeleton — inside the scope", () => {
  it.each(VARIANTS)("%s keeps its shape and its old fill, and the scope adds the raised step after it", (variant) => {
    const { container } = render(<PlayScope><Skeleton variant={variant} /></PlayScope>);
    const el = container.querySelector("[aria-hidden='true']:not([data-play-portal])")!;
    expect(el.closest(".theme-play")).not.toBeNull();
    expect(outside(el)).toMatch(/^animate-pulse bg-silver-100 /);
    expect(inside(el)).toEqual(["pg:bg-raised"]);
  });

  it("the pulse is opacity only: no transform, no shimmer, no scale", () => {
    const { container } = render(<PlayScope><Skeleton variant="card" count={3} /></PlayScope>);
    const els = container.querySelectorAll(".animate-pulse");
    expect(els).toHaveLength(3);
    for (const el of els) expect(el.getAttribute("class")).not.toMatch(/translate|scale|shimmer|bg-gradient/);
  });

  it("carries no text and is hidden from assistive technology — it renders before the locale is known", () => {
    const { container } = render(<PlayScope><SkeletonPageHeader /></PlayScope>);
    expect(container.textContent).toBe("");
    expect(container.querySelector(".theme-play > [aria-hidden='true']")).not.toBeNull();
  });
});
