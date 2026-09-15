// resolveBrand() — DEC-052, 06 §8.3. The identity-override property at the
// TypeScript layer: tests/rls/brand-kits.test.ts proves the same property
// through the two SQL doors (brand_kit(), export_render_context()); this
// file proves the merge function itself, in isolation from the database.
import { describe, expect, it } from "vitest";
import { BRAND_COLOUR_TOKENS, platformBrand, resolveBrand } from "@kareem/designer-runtime";

describe("resolveBrand()", () => {
  it("★ with no overrides, resolves to exactly platformBrand() — the identity override", () => {
    expect(resolveBrand(undefined, "light")).toEqual(platformBrand("light"));
    expect(resolveBrand(null, "dark")).toEqual(platformBrand("dark"));
    expect(resolveBrand({}, "light")).toEqual(platformBrand("light"));
  });

  it("a full scheme override replaces every colour token for that scheme only", () => {
    const light: Record<string, string> = {};
    for (const token of BRAND_COLOUR_TOKENS) light[token] = "#123456";
    const resolved = resolveBrand({ light: light as never }, "light");
    for (const token of BRAND_COLOUR_TOKENS) expect(resolved[`brand.${token}`]).toBe("#123456");

    // The dark scheme, asked for separately, is untouched by a light-only override.
    expect(resolveBrand({ light: light as never }, "dark")).toEqual(platformBrand("dark"));
  });

  it("logoAssetId is added as brand.logoAssetId and omitted from the platform default", () => {
    expect(resolveBrand(null, "light")["brand.logoAssetId"]).toBeUndefined();
    expect(resolveBrand({ logoAssetId: "11111111-1111-1111-1111-111111111111" }, "light")["brand.logoAssetId"]).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("a partial scheme override only replaces the tokens it names, falling back per-token", () => {
    const resolved = resolveBrand({ light: { canvas: "#abcdef" } }, "light");
    expect(resolved["brand.canvas"]).toBe("#abcdef");
    expect(resolved["brand.surface"]).toBe(platformBrand("light")["brand.surface"]);
  });
});
