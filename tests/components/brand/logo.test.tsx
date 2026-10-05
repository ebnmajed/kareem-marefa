// The mark — `components/brand/logo.tsx`, REQ-UIX-119, DEC-247.
//
// What a screenshot cannot prove: it is named once, two marks on a page do not share an id, it rests visible whatever
// its motion (nothing waits on an animation), and it names none of the prototype's classes.
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Logo } from "@/components/brand/logo";

describe("Logo", () => {
  it("is an image named «كريم معرفة», and decorative when the name is already beside it", () => {
    const { rerender, container } = render(<Logo />);
    expect(screen.getByRole("img", { name: "كريم معرفة" })).toBeInTheDocument();
    rerender(<Logo label={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws four arcs, each a face over its shadow, every stroke measured to 1", () => {
    const { container } = render(<Logo />);
    const paths = [...container.querySelectorAll("[data-arc]")];
    expect(new Set(paths.map((p) => p.getAttribute("data-arc")))).toEqual(new Set(["coral", "lime", "violet", "orange"]));
    for (const arc of ["coral", "lime", "violet", "orange"]) {
      const parts = paths.filter((p) => p.getAttribute("data-arc") === arc).map((p) => p.getAttribute("data-part"));
      expect(parts, arc).toContain("face");
      expect(parts, arc).toContain("shadow");
      // The shadow is painted first, so the face sits over it.
      expect(parts.indexOf("shadow"), arc).toBeLessThan(parts.lastIndexOf("face"));
    }
    for (const p of paths) expect(p.getAttribute("pathLength")).toBe("1");
  });

  it("two marks on one page do not share a clip path's id", () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const g of container.querySelectorAll("[clip-path]")) {
      const ref = g.getAttribute("clip-path")!.match(/url\(#(.+)\)/)![1];
      expect(ids).toContain(ref);
    }
  });

  it("carries its motion as data, defaults to none, and keeps the height's ratio", () => {
    const { container, rerender } = render(<Logo />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("data-motion", "none");
    expect(svg).toHaveAttribute("height", "36");
    expect(svg).toHaveAttribute("width", String(Math.round((36 * 215.78) / 294.03)));
    rerender(<Logo motion="reveal" height={66} />);
    expect(container.querySelector("svg")).toHaveAttribute("data-motion", "reveal");
  });
});

describe("the mark's motion in globals.css", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const component = readFileSync("src/components/brand/logo.tsx", "utf8");

  it("★ rests visible: the paths' own offset is 0 and the hidden start lives only in the keyframe", () => {
    expect(css).toContain("[data-logo] [data-arc] { stroke-dasharray: 1; stroke-dashoffset: 0; }");
    expect(css).toMatch(/@keyframes logo-draw \{ from \{ stroke-dashoffset: 1; \} to \{ stroke-dashoffset: 0; \} \}/);
    // No rule outside a keyframe ever sets the offset to 1 — that would hide the mark wherever animation is off.
    const outsideKeyframes = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(outsideKeyframes).not.toMatch(/\[data-logo\][^{]*\{[^}]*stroke-dashoffset:\s*1/);
  });

  it("★ every move is declared only where motion is welcome — reduced motion gets the still mark", () => {
    const moves = [...css.matchAll(/\[data-logo\]\[data-motion="(reveal|loading|tap)"\][^{]*\{[^}]*animation/g)];
    expect(moves.length).toBeGreaterThan(3);
    const start = css.indexOf("/* ── The mark's three moves");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) {", start));
    for (const m of moves) expect(block.includes(m[0]), m[0].slice(0, 60)).toBe(true);
  });

  it("names none of the prototype's classes — the component speaks in data attributes", () => {
    expect(component).not.toMatch(/className=["'`][^"'`]*\b(km-logo|arc|face|shadow|coral|lime|violet|orange)\b/);
    expect(css).not.toMatch(/\.km-logo/);
  });
});
