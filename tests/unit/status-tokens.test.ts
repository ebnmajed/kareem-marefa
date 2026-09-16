import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The status colours are a platform constant, and their contrast is the reason
// they can be one — DEC-073, REQ-UIX-003, REQ-NFR-007, SC 1.4.3.
//
// ★ This test reads `globals.css` rather than a TypeScript copy of the values,
// because a second copy is a second source of truth and the one that drifts is
// always the one nothing reads. A change to a hex in the stylesheet fails here.
//
// ★ It is also the seam M13 extends. `branding` adds these pairs to
// `checkContrast()`'s set and makes `save_brand_kit()` REFUSE a palette on
// which a status badge fails AA (`16` §16.6) — because an org may override
// `light_canvas` and `light_surface` to any `^#[0-9a-f]{6}$` string
// (`0068_brand_kits.sql:69-70`: a regex, and no other constraint) while these
// backgrounds stay near-white and frozen. Until then this test covers the
// platform defaults, which is what M9 ships.

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): string {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, "m"));
  if (!match) throw new Error(`--${name} is not declared as a hex literal in globals.css`);
  return match[1];
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// The light-context surfaces a badge can sit on today.
const WHITE = "#ffffff";
const SILVER_100 = "#f4f6f9";
// `.theme-dark` surfaces — the event page's hero band (DEC-080).
const NAVY_950 = "#0b1220";
const NAVY_900 = "#111a2c";

describe("status colour tokens are declared", () => {
  it("globals.css carries all five, as hex literals", () => {
    for (const name of ["color-live", "color-live-bg", "color-live-on-dark", "color-ended", "color-ended-bg"]) {
      expect(token(name), name).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("★ they are NOT in the brand kit's token list (DEC-073)", () => {
    // Adding them would move the parity goldens, widen a `.strict()` schema and
    // let an org recolour what «أُلغيت» means.
    const brand = readFileSync(join(process.cwd(), "packages/designer-runtime/src/brand.ts"), "utf8");
    const list = brand.match(/BRAND_COLOUR_TOKENS[\s\S]*?\]/)?.[0] ?? "";
    expect(list).not.toMatch(/\blive\b/);
    expect(list).not.toMatch(/\bended\b/);
  });
});

describe("status colours meet AA as text on every surface they land on", () => {
  const AA = 4.5;

  it("live on its own background", () => {
    expect(contrast(token("color-live"), token("color-live-bg"))).toBeGreaterThanOrEqual(AA);
  });

  it("live on the two light surfaces", () => {
    expect(contrast(token("color-live"), WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("color-live"), SILVER_100)).toBeGreaterThanOrEqual(AA);
  });

  it("ended on its own background", () => {
    expect(contrast(token("color-ended"), token("color-ended-bg"))).toBeGreaterThanOrEqual(AA);
  });

  it("ended on the two light surfaces", () => {
    expect(contrast(token("color-ended"), WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("color-ended"), SILVER_100)).toBeGreaterThanOrEqual(AA);
  });

  it("★ live-on-dark on the dark band — the event page hero (DEC-080)", () => {
    // `live` itself is far too dark on navy; this is why the pair exists.
    expect(contrast(token("color-live-on-dark"), NAVY_950)).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("color-live-on-dark"), NAVY_900)).toBeGreaterThanOrEqual(AA);
  });

  it("sits in the same register as the error and success pair it extends", () => {
    // Not a contrast rule — a design one. The status set is deliberately
    // desaturated to fit the metallic world; a saturated addition would read as
    // a different product. Both existing pairs land between 5 and 7.
    const live = contrast(token("color-live"), token("color-live-bg"));
    const ended = contrast(token("color-ended"), token("color-ended-bg"));
    expect(live).toBeLessThan(9);
    expect(ended).toBeLessThan(9);
  });
});

describe("the motion and layer tokens exist, because other rules compute from them", () => {
  it("declares the four motion tokens and collapses the durations once", () => {
    expect(CSS).toMatch(/--ease-out:\s*cubic-bezier/);
    for (const d of ["--dur-fast", "--dur-base", "--dur-slow"]) expect(CSS).toContain(d);
    // REQ-UIX-014: collapsed in ONE place, so no component can forget.
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/--dur-fast:\s*0ms/);
    expect(reduced).toMatch(/--dur-base:\s*0ms/);
    expect(reduced).toMatch(/--dur-slow:\s*0ms/);
  });

  it("★ declares the sticky-layer heights and the scroll padding computed from them", () => {
    // SC 2.4.11. Before M9 `scroll-padding` and `scroll-margin` appeared
    // nowhere in src/, and M9 is what adds the sticky layers.
    for (const t of ["--header-h", "--subnav-h", "--tabbar-h"]) expect(CSS).toContain(t);
    expect(CSS).toMatch(/scroll-padding-block-start:\s*calc\(var\(--header-h\)/);
    expect(CSS).toMatch(/scroll-padding-block-end:[\s\S]*?safe-area-inset-bottom/);
    expect(CSS).toMatch(/\[id\]\s*\{[\s\S]*?scroll-margin-block-start/);
  });

  it("★ the bottom scroll padding accounts for the safe area, not just the bar", () => {
    // The standing rule from the mobile pass: anything fixed to the bottom adds
    // env(safe-area-inset-bottom) to its own padding, and so does anything that
    // has to clear it.
    const rule = CSS.match(/scroll-padding-block-end:[^;]+;/)?.[0] ?? "";
    expect(rule).toContain("env(safe-area-inset-bottom");
  });
});
