// The playground's tokens — DEC-183 §4.2, DEC-186 §2, REQ-UIX-028.
//
// Three things are held here, and each is a promise the wave made:
//   1. NOTHING THAT EXISTED CHANGED. `globals.css` with the playground's block
//      taken out is, byte for byte, the file as it stood on `main`.
//   2. THE SCOPE NEVER REACHES `:root`. It is a class, with a light variant.
//   3. THE VALUES PASS. The design's hairline is 1.45:1 on its own ground and
//      its accent ring 1.07:1 on the light variant; what replaced them is
//      measured here, so a later edit cannot quietly undo it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

// ★ A later wave that changes an existing token changes this hash ON PURPOSE,
// in the commit that changes the token, with the decision that allows it.
// ★ Wave 29 (DEC-280 §5): moved ON PURPOSE — navigation carries the game. Outside the playground's block the file gains
// `--ease-pop` and `--dur-play` beside the M9 tokens, the navigation-motion section, the reduced-motion cut of the
// transition's pseudo-elements, and a `ui-lint-keyframes:` reason above each of the five keyframes that animate more
// than transform, opacity and filter. Nothing that existed changed value; `main`'s was 91948137…ddc3.
const GLOBALS_BEFORE_WAVE_15 = "afd486514d43e85cf662c0cfb0ac8d83c5cbf9be810222e8e03c215d7d618e31";

const START = "/* ═══════════════════════════════════════════════════════════════════════════\n   «ساحة اللعب» — THE PLAYGROUND, AS A SCOPE.";
const END = "/* --------------------------------- typography ---------------------------";

const block = (() => {
  const from = css.indexOf(START);
  const to = css.indexOf(END);
  if (from < 0 || to < 0 || to < from) throw new Error("the playground's block is not where the test expects it");
  return css.slice(from, to);
})();

const REDUCED = [
  "    /* The playground's ramp collapses here too, and nowhere else (DEC-183 §4.3). */",
  "    --duration-fast: 0ms;",
  "    --duration-base: 0ms;",
  "    --duration-slow: 0ms;",
  "    --duration-party: 0ms;",
  // wave 16 (DEC-197): the flame's loop collapses in the same block.
  "    --duration-loop: 0ms;",
  "",
].join("\n");

function hex(name: string): string {
  const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`no hex for --color-${name}`);
  return m[1];
}
function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the playground's tokens are added, and nothing that existed changed", () => {
  it("globals.css without the playground's block is main's file, byte for byte", () => {
    expect(css).toContain(REDUCED);
    const without = css.replace(block, "").replace(REDUCED, "");
    expect(createHash("sha256").update(without).digest("hex")).toBe(GLOBALS_BEFORE_WAVE_15);
  });

  it("the block redefines none of the five names tokens.css collided with, nor the two utilities", () => {
    // Inside `@theme`: a declaration at the start of a line, two spaces in.
    const theme = [...block.matchAll(/@theme(?: inline)? \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    for (const name of ["--color-surface", "--radius-card", "--radius-field", "--ease-out", "--text-body", "--text-caption", "--color-canvas", "--color-fg-muted"]) {
      expect(theme, name).not.toMatch(new RegExp(`^\\s*${name}:`, "m"));
    }
  });

  it("the scope is a class: the one :root rule in the block holds durations and the focus width, and no colour", () => {
    const roots = [...block.matchAll(/^:root \{([\s\S]*?)\n\}/gm)].map((m) => m[1]);
    expect(roots).toHaveLength(1);
    const names = [...roots[0].matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]).sort();
    // wave 16 (DEC-197): the flame's loop and the shine's direction join the ramp; still no colour.
    expect(names).toEqual(["--duration-base", "--duration-fast", "--duration-loop", "--duration-party", "--duration-slow", "--focus-width", "--moment-dir"]);
  });

  it("the semantic layer sits on .theme-play and .theme-play-light, and both set color-scheme", () => {
    expect(block).toMatch(/^\.theme-play \{\n\s*color-scheme: dark;/m);
    expect(block).toMatch(/^\.theme-play-light \{\n\s*color-scheme: light;/m);
    for (const name of ["--bg", "--surface", "--fg-heading", "--fg-body", "--fg-muted", "--edge", "--edge-strong", "--ring"]) {
      expect(block.match(new RegExp(`^  ${name}:`, "gm")) ?? [], name).toHaveLength(2);
    }
  });

  it("the three variants are declared in :where(), so they add no specificity", () => {
    expect(block).toContain("@custom-variant pg (&:where(.theme-play, .theme-play *));");
    expect(block).toContain("@custom-variant pg-light (&:where(.theme-play-light, .theme-play-light *));");
    expect(block).toContain("@custom-variant pg-dark (&:where(.theme-play:not(.theme-play-light), .theme-play:not(.theme-play-light) *));");
  });

  it("every new semantic colour falls back to today's context variable, inline", () => {
    const inline = block.match(/@theme inline \{([\s\S]*?)\n\}/)![1];
    const fallbacks: Record<string, string> = {
      raised: "var(--raised, var(--btn2-bg-hover))",
      hover: "var(--hover, var(--btn2-bg-hover))",
      accent: "var(--accent, var(--btn-bg))",
      "accent-deep": "var(--accent-deep, var(--btn-bg-active))",
      "on-accent": "var(--on-accent, var(--btn-fg))",
      signal: "var(--signal, var(--color-live))",
      team: "var(--team, var(--team-neutral, var(--edge-strong)))",
    };
    for (const [name, value] of Object.entries(fallbacks)) expect(inline, name).toContain(`--color-${name}: ${value};`);
    expect(inline).toContain("--font-display: var(--display-face, var(--font-arabic));");
  });

  it("the four durations collapse in the one reduced-motion block", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const name of ["fast", "base", "slow", "party", "loop"]) expect(reduced).toContain(`--duration-${name}: 0ms;`);
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
  });
});

describe("the playground's values pass, measured", () => {
  const ink = hex("play-ink");
  const surface = hex("play-surface");
  const raised = hex("play-surface-2");
  const paper = hex("play-paper");
  const white = hex("play-paper-surface");

  it("a control's boundary is 3:1 or better on every ground — and the design's hairline is not", () => {
    const edge = hex("play-edge-strong");
    for (const ground of [ink, surface, raised]) expect(contrast(edge, ground)).toBeGreaterThanOrEqual(3);
    const paperEdge = hex("play-paper-edge-strong");
    for (const ground of [paper, white]) expect(contrast(paperEdge, ground)).toBeGreaterThanOrEqual(3);
    // Why `edge` is decoration only: DEC-186 §2.
    expect(contrast(hex("play-line"), ink)).toBeLessThan(1.5);
  });

  it("the focus ring is 3:1 or better on both grounds — lime on the dark, ink on the light", () => {
    expect(block).toMatch(/\.theme-play \{[\s\S]*?--ring: var\(--color-play-lime\);/);
    expect(block).toMatch(/\.theme-play-light \{[\s\S]*?--ring: var\(--color-play-paper-ink\);/);
    expect(contrast(hex("play-lime"), ink)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex("play-paper-ink"), paper)).toBeGreaterThanOrEqual(3);
    // The reason it is not the accent on the light variant.
    expect(contrast(hex("play-lime"), paper)).toBeLessThan(1.2);
  });

  it("text passes 4.5:1 on every surface it sits on", () => {
    for (const ground of [ink, surface, raised]) {
      expect(contrast(hex("play-bone"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex("play-muted"), ground)).toBeGreaterThanOrEqual(4.5);
    }
    for (const ground of [paper, white]) {
      expect(contrast(hex("play-paper-ink"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex("play-paper-muted"), ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ink passes 4.5:1 on every fill it is written on", () => {
    const fills = [
      "play-lime", "play-coral",
      "team-silver", "team-tangerine", "team-magenta", "team-cyan", "team-gold", "team-violet", "team-mint",
      "level-1", "level-2", "level-3", "level-4", "level-5",
      "sticker-accent", "sticker-signal", "sticker-cyan", "sticker-gold", "sticker-violet", "sticker-bone",
    ];
    for (const fill of fills) expect(contrast(ink, hex(fill)), fill).toBeGreaterThanOrEqual(4.5);
  });

  it("bone passes 4.5:1 on each of the six tints", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(contrast(hex("on-tint"), hex(`tint-${n}`)), `tint-${n}`).toBeGreaterThanOrEqual(4.5);
    for (const team of ["silver", "tangerine", "magenta", "cyan", "gold", "violet", "mint"])
      expect(contrast(hex("on-team"), hex(`team-${team}`)), `on-team on team-${team}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the status constants' on-dark forms pass on the scope's surface, where the light ones do not", () => {
    const onDark = { live: "#d2a86b", success: "#8fbfa5", error: "#e08c8f", ended: hex("ended-on-dark") };
    for (const [name, value] of Object.entries(onDark)) expect(contrast(value, surface), name).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#8a5a1f", surface)).toBeLessThan(4.5);
  });
});
