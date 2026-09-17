// The brand-kit Zod schema and the WCAG contrast check — src/lib/brand/{schema,contrast}.ts.
import { describe, expect, it } from "vitest";
import { AA_THRESHOLD, checkContrast, contrastRatio } from "@/lib/brand/contrast";
import { brandColourSet, hexColour, saveBrandKitInput } from "@/lib/brand/schema";

const FULL_LIGHT = {
  canvas: "#ffffff",
  surface: "#ffffff",
  fgHeading: "#0b1220",
  fgBody: "#33415c",
  fgMuted: "#5b6780",
  edge: "#e6eaf0",
  edgeStrong: "#767f8c",
  spine: "#d7dce3",
  node: "#0b1220",
  // DEC-127, contract 1 — canvasRaise is now required by BrandColourSet.
  canvasRaise: "#f1f3f7",
};

describe("hexColour", () => {
  it("accepts #rrggbb and lowercases it", () => {
    expect(hexColour.parse("#ABCDEF")).toBe("#abcdef");
  });

  it("refuses shorthand, alpha, and non-hex", () => {
    expect(hexColour.safeParse("#fff").success).toBe(false);
    expect(hexColour.safeParse("#ffffffff").success).toBe(false);
    expect(hexColour.safeParse("ffffff").success).toBe(false);
    expect(hexColour.safeParse("#gggggg").success).toBe(false);
  });
});

describe("brandColourSet", () => {
  it("★ requires every BRAND_COLOUR_TOKENS key — a partial set is refused", () => {
    expect(brandColourSet.safeParse(FULL_LIGHT).success).toBe(true);
    const { canvas: _canvas, ...missingOne } = FULL_LIGHT;
    expect(brandColourSet.safeParse(missingOne).success).toBe(false);
  });

  it("refuses an unknown key (.strict())", () => {
    expect(brandColourSet.safeParse({ ...FULL_LIGHT, notAToken: "#000000" }).success).toBe(false);
  });
});

describe("saveBrandKitInput", () => {
  it("accepts null logo and font references — the platform default for anything unset", () => {
    const result = saveBrandKitInput.safeParse({
      light: FULL_LIGHT,
      dark: FULL_LIGHT,
      logoAssetId: null,
      headingFontId: null,
      bodyFontId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("contrastRatio", () => {
  it("black on white is 21:1, the maximum", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("a colour against itself is 1:1, the minimum", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0b1220", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#0b1220"), 5);
  });
});

describe("checkContrast — WCAG 2.2 AA", () => {
  it("the shipped platform heading colour passes body text on its own canvas", () => {
    const result = checkContrast("#0b1220", "#ffffff", "body");
    expect(result.threshold).toBe(AA_THRESHOLD.body);
    expect(result.passes).toBe(true);
  });

  it("★ a low-contrast pair is refused at the body threshold (4.5:1) but may still clear the UI threshold (3:1)", () => {
    // #777777 on #ffffff ≈ 4.48:1 — just under body, just over UI/large.
    const body = checkContrast("#777777", "#ffffff", "body");
    const ui = checkContrast("#777777", "#ffffff", "ui");
    expect(body.passes).toBe(false);
    expect(ui.passes).toBe(true);
  });
});
