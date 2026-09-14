// The gate a newly materialised font must pass — REQ-DSG-017, A39, 06 §7.2.
//
// «A font with partial GSUB or mark coverage renders Latin perfectly and
// SILENTLY breaks lam-alef and stacked tashkeel. A Latin smoke test passes
// it.» So the checks are COMPARATIVE rather than golden-based: a new font
// has never been rendered, so there is nothing to compare it against except
// properties every correct Arabic face has.
//
// Verified against the real font set in a browser as well as here: IBM Plex
// Sans Arabic, Amiri and Reem Kufi all pass, and IBM Plex Sans — Latin only,
// the exact font this gate exists to reject — fails on Arabic coverage.
import { describe, expect, it } from "vitest";
import { checkFontShaping, describeFontGate, FONT_GATE_TEXTS } from "@kareem/designer-runtime";

/** Indices into FONT_GATE_TEXTS: لا · ل · ا · محمد · مُحَمَّدٌ · mixed. */
const GOOD = [21, 19, 12, 88, 88, 260];
const FALLBACK = [30, 19, 12, 76, 84, 250];

describe("REQ-DSG-017 — a font is selectable only when it SHAPES", () => {
  it("names six strings, because every check is a comparison between two of them", () => {
    expect(FONT_GATE_TEXTS).toHaveLength(6);
  });

  it("a correct Arabic face passes every check", () => {
    const result = checkFontShaping(GOOD, FALLBACK);
    expect(result.passed).toBe(true);
    expect(describeFontGate(result)).toBe("every shaping check passed");
  });

  it("★ catches a face with no rlig — «لا» as wide as its letters apart", () => {
    // The failure that renders Latin perfectly: the ligature simply is not
    // substituted, so the two letters are drawn side by side.
    const noLigature = [...GOOD];
    noLigature[0] = GOOD[1]! + GOOD[2]!;
    const result = checkFontShaping(noLigature, FALLBACK);
    expect(result.passed).toBe(false);
    expect(result.findings.find((f) => f.check === "lam_alef_ligature")?.passed).toBe(false);
    expect(describeFontGate(result)).toContain("rlig");
  });

  it("★ catches a face with no mark positioning — the diacritics take width", () => {
    // «مُحَمَّدٌ» wider than «محمد» means the marks were laid out as spacing
    // glyphs, which also stacks them beside the letters rather than above.
    const spacingMarks = [...GOOD];
    spacingMarks[4] = GOOD[3]! + 30;
    const result = checkFontShaping(spacingMarks, FALLBACK);
    expect(result.passed).toBe(false);
    expect(describeFontGate(result)).toContain("mark/mkmk");
  });

  it("★ catches a Latin-only face — the Arabic run measures as the fallback", () => {
    const latinOnly = [...FALLBACK];
    latinOnly[5] = 260; // its Latin is fine, which is the whole trap
    const result = checkFontShaping(latinOnly, FALLBACK);
    expect(result.passed).toBe(false);
    expect(result.findings.find((f) => f.check === "arabic_coverage")?.passed).toBe(false);
  });

  it("catches a face that never loaded at all", () => {
    const result = checkFontShaping(FALLBACK, FALLBACK);
    expect(result.findings.find((f) => f.check === "face_loaded")?.passed).toBe(false);
  });

  it("reports WHICH checks failed — 06 §7.2 wants a refusal with an answer", () => {
    const broken = [...GOOD];
    broken[0] = GOOD[1]! + GOOD[2]!;
    broken[4] = GOOD[3]! + 30;
    const described = describeFontGate(checkFontShaping(broken, FALLBACK));
    expect(described).toContain("lam_alef_ligature");
    expect(described).toContain("mark_positioning");
    // And not the ones that passed.
    expect(described).not.toContain("face_loaded");
  });
});
