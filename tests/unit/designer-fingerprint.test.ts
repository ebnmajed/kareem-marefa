// The cache key and Tier A — REQ-DSG-013, REQ-DSG-014, 06 §6.3 and §9.
//
// The fingerprint's whole job is that «a changed source produces a different
// key rather than requiring someone to remember to clear a cache». Two ways
// that fails: it changes when nothing changed (everything re-renders
// forever), or it holds when something did (a stale poster goes to print).
// Both are tested here.
import { describe, expect, it } from "vitest";
import { checkTierA, compareTierA, fingerprintSource, type DesignDocument, type LayerSignature, type TierASignature } from "@kareem/designer-runtime";

const doc = (title: string): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers: [
    {
      id: "l_title",
      kind: "text",
      frame: { x: 80, y: 300, w: 920, h: 320 },
      text: { literal: title },
      font: { family: "IBM Plex Sans Arabic", size: 96 },
    },
  ],
});

const source = (over: Record<string, unknown> = {}) => ({
  document: doc("عنوان"),
  templateVersionId: "11111111-1111-4111-8111-111111111111",
  bindings: { "session.title": "جلسة" },
  fontHashes: ["a".repeat(64), "b".repeat(64)],
  ...over,
});

describe("REQ-DSG-013 — the fingerprint holds when nothing changed", () => {
  it("is stable across two identical sources", () => {
    expect(fingerprintSource(source())).toBe(fingerprintSource(source()));
  });

  it("★ ignores object key ORDER — JSON.stringify would not", () => {
    // Two documents identical in content but built in a different order
    // would otherwise fingerprint differently and re-render on every save.
    const a = fingerprintSource(source({ bindings: { "session.title": "جلسة", "org.name": "كريم" } }));
    const b = fingerprintSource(source({ bindings: { "org.name": "كريم", "session.title": "جلسة" } }));
    expect(a).toBe(b);
  });

  it("★ ignores font ORDER — two callers listing the same faces must agree", () => {
    const a = fingerprintSource(source({ fontHashes: ["a".repeat(64), "b".repeat(64)] }));
    const b = fingerprintSource(source({ fontHashes: ["b".repeat(64), "a".repeat(64)] }));
    expect(a).toBe(b);
  });

  it("treats an absent key and an undefined one as the same thing", () => {
    // They are the same thing to the renderer, so they must be the same
    // thing here — otherwise a DTO that spells out its optional fields
    // fingerprints differently from one that omits them.
    const a = fingerprintSource(source({ bindings: { "session.title": "جلسة" } }));
    const b = fingerprintSource(source({ bindings: { "session.title": "جلسة", "session.abstract": undefined } }));
    expect(a).toBe(b);
  });

  it("does NOT include the preset or the format — they are their own columns in the key", () => {
    // Folding them in would give one source seven fingerprints and make
    // "has this source been rendered?" a question with seven answers.
    expect(fingerprintSource(source())).not.toContain("a3");
    expect(fingerprintSource(source())).not.toContain("pdf");
  });
});

describe("REQ-DSG-013 — the fingerprint moves when something did", () => {
  it("a changed document, binding, template version or font set each move it", () => {
    const base = fingerprintSource(source());
    expect(fingerprintSource(source({ document: doc("عنوان آخر") }))).not.toBe(base);
    expect(fingerprintSource(source({ bindings: { "session.title": "جلسة أخرى" } }))).not.toBe(base);
    expect(fingerprintSource(source({ templateVersionId: "22222222-2222-4222-8222-222222222222" }))).not.toBe(base);
    expect(fingerprintSource(source({ fontHashes: ["c".repeat(64)] }))).not.toBe(base);
  });

  it("a template version bump invalidates only the artifacts bound to it", () => {
    // Two documents on different template versions never share a key, so
    // bumping one cannot invalidate the other's artifacts.
    const v3 = fingerprintSource(source({ templateVersionId: "33333333-3333-4333-8333-333333333333" }));
    const v4 = fingerprintSource(source({ templateVersionId: "44444444-4444-4444-8444-444444444444" }));
    expect(v3).not.toBe(v4);
  });
});

describe("REQ-DSG-014 — Tier A fails the export, and says why", () => {
  const sig = (over: Partial<LayerSignature> = {}): LayerSignature => ({
    lineCount: 2,
    lineWidths: [400, 320],
    totalAdvance: 720,
    charRectCount: 18,
    zeroWidthRects: 0,
    fontSize: "64px",
    letterSpacing: "normal",
    fallbackAdvance: 500,
    faceLoaded: true,
    coverageAdvances: [720, 720],
    ...over,
  });
  const expectation = [{ layerId: "l_title", fittedSize: 64, lines: 2 }];

  it("passes when the layout matches what auto-fit decided", () => {
    expect(checkTierA({ l_title: sig() }, expectation)).toEqual([]);
  });

  it("★ catches a face that never loaded — the D66 nightmare in one number", () => {
    // A font fetch that fails does not error; it substitutes, and the poster
    // looks fine. No loaded face of the family is what notices
    // (`designer-tier-a-face.test.ts` has the cases that broke the old rule).
    const failures = checkTierA({ l_title: sig({ faceLoaded: false, totalAdvance: 500 }) }, expectation);
    expect(failures.map((f) => f.code)).toEqual(["font_never_loaded"]);
    // One cause, one failure: the rest would be measurements of the fallback.
    expect(failures).toHaveLength(1);
  });

  it("catches letter-spacing, a fitted size that moved, and a line that wrapped", () => {
    expect(checkTierA({ l_title: sig({ letterSpacing: "2px" }) }, expectation).map((f) => f.code)).toContain("letter_spacing");
    expect(checkTierA({ l_title: sig({ fontSize: "58px" }) }, expectation).map((f) => f.code)).toContain("fitted_size");
    expect(checkTierA({ l_title: sig({ lineCount: 3 }) }, expectation).map((f) => f.code)).toContain("line_count");
  });

  it("catches a layer that is not in the rendered page at all", () => {
    expect(checkTierA({}, expectation).map((f) => f.code)).toEqual(["layer_missing"]);
  });

  it("★ catches geometry drift for an UNCHANGED fingerprint", () => {
    // Same document, template version, bound data and font bytes must give
    // the same geometry. A difference means something outside all four moved,
    // and that is exactly the drift D66 is about.
    const before: TierASignature = { l_title: sig() };
    expect(compareTierA(before, { l_title: sig() })).toEqual([]);
    expect(compareTierA(before, { l_title: sig({ totalAdvance: 719 }) }).map((f) => f.code)).toEqual(["geometry_drift"]);
    expect(compareTierA(before, { l_title: sig({ lineWidths: [400, 319] }) }).map((f) => f.code)).toEqual(["geometry_drift"]);
  });

  it("every failure carries a detail a human can act on", () => {
    for (const failure of checkTierA({ l_title: sig({ lineCount: 5, fontSize: "40px" }) }, expectation)) {
      expect(failure.detail.length).toBeGreaterThan(10);
      expect(failure.layerId).toBe("l_title");
    }
  });
});
