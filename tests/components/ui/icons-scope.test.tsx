// `ui/icons` inside the playground's scope — DEC-199 §3, REQ-UIX-052, REQ-UIX-041.
//
// ★ THE LIST IS THE FILE'S OWN EXPORTS, never a list kept here. `icons-playground`
// asserts the nine glyphs wave 15 added, by name; that is how the other forty-odd
// went a wave with no test inside the scope. This reads `Object.keys(Icons)`, so
// a glyph added tomorrow is held to the house shape the day it is exported.
//
// The playground asks of a glyph exactly what the house set already is
// (`04-components.md`: «hand-authored, 24px, stroke 2», in the text's colour): so
// the file does not change for the scope, and what is proved is that NOTHING in
// it can carry a colour of its own into a scoped screen.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import * as Icons from "@/components/ui/icons";
import { PlayScope } from "@/components/ui/scope";

type Glyph = (props: { label?: string; className?: string; direction?: string }) => React.ReactElement;
const GLYPHS = Object.entries(Icons as unknown as Record<string, Glyph>).filter(([name, value]) => name.endsWith("Icon") && typeof value === "function");

const mount = (G: Glyph, props: Parameters<Glyph>[0] = {}) =>
  render(
    <PlayScope>
      <G {...props} />
    </PlayScope>,
  ).container.querySelector("svg")!;

describe("ui/icons — every exported glyph, inside the scope", () => {
  it("finds the whole set, and every export of the file is a glyph", () => {
    expect(GLYPHS.length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(Icons).filter((name) => !name.endsWith("Icon"))).toEqual([]);
  });

  it.each(GLYPHS)("%s is drawn in the house shape: 24 px grid, 1em, stroke 2, round", (_name, G) => {
    const svg = mount(G);
    expect(svg.closest(".theme-play")).not.toBeNull();
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("width", "1em");
    expect(svg).toHaveAttribute("height", "1em");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
  });

  it.each(GLYPHS)("%s takes its colour from the text and carries none of its own", (_name, G) => {
    const svg = mount(G);
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of ["fill", "stroke", "color", "stop-color"]) {
        const value = el.getAttribute(attr);
        if (value !== null) expect(["none", "currentColor"], `${el.tagName} ${attr}="${value}"`).toContain(value);
      }
      expect(el.getAttribute("style"), `${el.tagName} carries an inline style`).toBeNull();
    }
    // No colour utility and no raw palette name in any class.
    expect(svg.outerHTML).not.toMatch(/\b(?:text|fill|stroke|bg)-(?:navy|silver|slate|white|black|play|accent|signal)/);
    expect(svg.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it.each(GLYPHS)("%s is decorative by default, and an image with a name when given one", (name, G) => {
    // The spinner is a live status, not an image: it says «loading» when it has a name.
    if (name === "SpinnerIcon") {
      expect(mount(G, { label: "تحميل" })).toHaveAttribute("role", "status");
      return;
    }
    expect(mount(G)).toHaveAttribute("aria-hidden", "true");
    const named = mount(G, { label: "اسم" });
    expect(named).toHaveAttribute("role", "img");
    expect(named).toHaveAttribute("aria-label", "اسم");
    expect(named).not.toHaveAttribute("aria-hidden");
  });

  it("a glyph that points mirrors in RTL, and one that does not never does", () => {
    const mirrors = (G: Glyph, props = {}) => (mount(G, props).getAttribute("class") ?? "").includes("rtl:-scale-x-100");
    const icons = Icons as unknown as Record<string, Glyph>;
    expect(mirrors(icons.ChevronIcon, { direction: "forward" })).toBe(true);
    expect(mirrors(icons.ChevronIcon, { direction: "back" })).toBe(true);
    expect(mirrors(icons.ChevronIcon, { direction: "down" })).toBe(false);
    expect(mirrors(icons.ArrowIcon, { direction: "forward" })).toBe(true);
    for (const still of ["CheckIcon", "CloseIcon", "PlusIcon", "DotIcon", "SpinnerIcon", "FlameIcon", "CoinIcon"]) {
      expect(mirrors(icons[still]), still).toBe(false);
    }
  });

  it("only the spinner moves, and only when motion is allowed", () => {
    for (const [name, G] of GLYPHS) {
      const cls = mount(G, name === "SpinnerIcon" ? { label: "تحميل" } : {}).getAttribute("class") ?? "";
      if (name === "SpinnerIcon") expect(cls).toContain("motion-safe:animate-spin");
      else expect(cls, name).not.toMatch(/animate-|transition/);
    }
  });
});
