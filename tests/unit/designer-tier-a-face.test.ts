import { describe, expect, it } from "vitest";
import { checkTierA, faceResolved, type LayerSignature } from "@kareem/designer-runtime";

// REQ-DSG-014, D66 — Tier A's first check, «the face actually loaded», on the
// numbers that broke it.
//
// The lead's real-worker run (wave 8, host worker, macOS Chrome) refused three
// of twelve variants of the talk poster with
//   tier_a: l_kicker: font_never_loaded — advance 92.09 equals the fallback's 92.59
// and 71.38 against 71.77. The kicker is «جلسة», one short word in IBM Plex
// Sans Arabic 500, and the face HAD loaded: the old rule called a face
// «never loaded» whenever a one-line advance sat within 1 px of the same
// string in a face that does not exist — that is, within 1 px of whatever the
// PLATFORM falls back to. The rule now asks the page whether a face of the
// family is loaded, and whether the text measures the same over two different
// generic fallbacks, which it does only when the fallback drew nothing.

const kicker = (over: Partial<LayerSignature>): LayerSignature => ({
  lineCount: 1,
  lineWidths: [92.09],
  totalAdvance: 92.09,
  charRectCount: 4,
  zeroWidthRects: 0,
  fontSize: "40px",
  letterSpacing: "normal",
  fallbackAdvance: 92.59,
  faceLoaded: true,
  coverageAdvances: [92.09, 92.09],
  ...over,
});
const expectation = [{ layerId: "l_kicker", fittedSize: 40, lines: 1 }];

/** The rule this replaces, verbatim from `page-probes.ts` before wave 8. */
const oldRule = (s: LayerSignature) => s.lineWidths.length > 1 || Math.abs(s.totalAdvance - s.fallbackAdvance) > 1;

describe("Tier A · the face loaded — decided without the platform's fallback", () => {
  it.each([
    [92.09, 92.59, "40px", 40],
    [71.38, 71.77, "31px", 31],
  ])("★ «جلسة» at %s px against a fallback of %s px: the old rule refused a loaded face, the new one passes it", (advance, fallback, fontSize, fitted) => {
    const signature = kicker({ lineWidths: [advance], totalAdvance: advance, fallbackAdvance: fallback, fontSize, coverageAdvances: [advance, advance] });
    expect(oldRule(signature)).toBe(false);
    expect(faceResolved(signature)).toBe("resolved");
    expect(checkTierA({ l_kicker: signature }, [{ layerId: "l_kicker", fittedSize: fitted, lines: 1 }])).toEqual([]);
  });

  it("★ still catches a face that truly never loaded — even when its advance happens to differ from the fallback's", () => {
    // The fetch failed; the platform drew «جلسة» in some other face whose
    // advance is nothing like the old control's. The old rule passed this.
    const failed = kicker({ faceLoaded: false, totalAdvance: 97.4, lineWidths: [97.4], coverageAdvances: [97.4, 97.4] });
    expect(oldRule(failed)).toBe(true);
    expect(faceResolved(failed)).toBe("never_loaded");
    expect(checkTierA({ l_kicker: failed }, expectation).map((f) => f.code)).toEqual(["font_never_loaded"]);
  });

  it("★ catches a face that loaded but does not cover its text — some glyphs came from the fallback", () => {
    // A subset missing a glyph: the family is loaded, but the string measures
    // differently over `serif` and over `monospace`, because the fallback drew
    // part of it.
    const partial = kicker({ coverageAdvances: [92.09, 104.6] });
    expect(faceResolved(partial)).toBe("glyph_fallback");
    const failures = checkTierA({ l_kicker: partial }, expectation);
    expect(failures.map((f) => f.code)).toEqual(["glyph_fallback"]);
    expect(failures[0]!.detail).toContain("92.09");
  });

  it("measurement noise under half a pixel is the same glyphs", () => {
    expect(faceResolved(kicker({ coverageAdvances: [92.09, 92.1] }))).toBe("resolved");
    expect(faceResolved(kicker({ coverageAdvances: [92.09, 92.7] }))).toBe("glyph_fallback");
  });

  it("one cause, one failure: a face that never loaded reports nothing below it", () => {
    const failures = checkTierA({ l_kicker: kicker({ faceLoaded: false, fontSize: "31px", lineWidths: [1, 2] }) }, expectation);
    expect(failures).toHaveLength(1);
  });
});
