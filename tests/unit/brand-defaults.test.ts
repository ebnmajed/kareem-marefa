// fillBrandDefaults() — src/lib/brand/defaults.ts. The fix for the window
// contract 1 opened: `canvasRaise` became a required `BrandColourSet` key
// before its SQL column exists, so `getBrandKit()` must not throw on a
// `brand_kit()` result that predates the new token (wave-8 sync, the lead).
import { describe, expect, it } from "vitest";
import { BRAND_COLOUR_TOKENS, platformBrand } from "@kareem/designer-runtime";
import { fillBrandDefaults } from "@/lib/brand/defaults";

const NINE_LIGHT = {
  canvas: "#111111",
  surface: "#222222",
  fgHeading: "#333333",
  fgBody: "#444444",
  fgMuted: "#555555",
  edge: "#666666",
  edgeStrong: "#777777",
  spine: "#888888",
  node: "#999999",
};

describe("fillBrandDefaults()", () => {
  it("★ a nine-token RPC result becomes a ten-token kit — canvasRaise filled from the platform default", () => {
    const filled = fillBrandDefaults(NINE_LIGHT, "light");
    expect(Object.keys(filled)).toHaveLength(BRAND_COLOUR_TOKENS.length);
    expect(filled.canvasRaise).toBe(platformBrand("light")["brand.canvasRaise"]);
  });

  it("every token the caller already set survives untouched", () => {
    const filled = fillBrandDefaults(NINE_LIGHT, "light");
    for (const [token, value] of Object.entries(NINE_LIGHT)) {
      expect(filled[token as keyof typeof NINE_LIGHT]).toBe(value);
    }
  });

  it("the dark scheme fills from platformBrand('dark'), not 'light'", () => {
    const filled = fillBrandDefaults({}, "dark");
    expect(filled.canvasRaise).toBe(platformBrand("dark")["brand.canvasRaise"]);
    expect(filled.canvasRaise).not.toBe(platformBrand("light")["brand.canvasRaise"]);
  });

  it("an empty override resolves to exactly platformBrand() — the identity default, per token", () => {
    const expected = Object.fromEntries(BRAND_COLOUR_TOKENS.map((t) => [t, platformBrand("dark")[`brand.${t}`]]));
    expect(fillBrandDefaults({}, "dark")).toEqual(expected);
  });
});
