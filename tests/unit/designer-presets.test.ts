// Presets, derivation, safe areas and auto-fit — REQ-DSG-009, REQ-DSG-010,
// REQ-DSG-025, A12, A30, 06 §5.
//
// «Every variant derives from the master with no manual step» is the claim
// these tests hold to account. The interesting cases are the ones where a
// naive scale would be wrong: a QR that must stay 25 mm, a footer that must
// stay at the bottom, a layer that should not survive a crop at all, and a
// title that must not shrink below the size its template insisted on.
import { describe, expect, it } from "vitest";
import {
  allSafeAreaViolations,
  computeAutoFit,
  derive,
  PRESETS,
  presetsFor,
  presetsForDocument,
  safeAreaViolations,
  safeBox,
  snap,
  snapTargets,
  snapTargetsBlock,
  type DesignDocument,
  type Layer,
  type TextMeasurer,
} from "@kareem/designer-runtime";

const layer = (over: Partial<Layer> & { id: string }): Layer =>
  ({
    kind: "text",
    frame: { x: 80, y: 300, w: 920, h: 320 },
    text: { literal: "عنوان الجلسة" },
    font: { family: "IBM Plex Sans Arabic", size: 96 },
    ...over,
  }) as Layer;

const master = (layers: Layer[]): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers,
});

describe("06 §5 — the preset table", () => {
  it("carries A12's nine presets at the stated sizes", () => {
    expect(PRESETS.master).toMatchObject({ width: 1080, height: 1350 });
    expect(PRESETS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(PRESETS.story).toMatchObject({ width: 1080, height: 1920 });
    expect(PRESETS.landscape).toMatchObject({ width: 1920, height: 1080 });
    expect(PRESETS.og).toMatchObject({ width: 1200, height: 630 });
    expect(PRESETS.a4).toMatchObject({ width: 2480, height: 3508, dpi: 300 });
    expect(PRESETS.a3).toMatchObject({ width: 3508, height: 4961, dpi: 300 });
    expect(PRESETS.cert_landscape).toMatchObject({ width: 3508, height: 2480, dpi: 300 });
    expect(PRESETS.cert_portrait).toMatchObject({ width: 2480, height: 3508, dpi: 300 });
  });

  it("states print margins in millimetres, so changing the dpi cannot move them", () => {
    // 5 mm safe and 3 mm bleed at 300 dpi.
    expect(PRESETS.a3.safe.blockStart).toBe(Math.round((5 * 300) / 25.4));
    expect(PRESETS.a3.bleed).toBe(Math.round((3 * 300) / 25.4));
    // A screen preset bleeds nothing: there is nothing to trim.
    expect(PRESETS.og.bleed).toBe(0);
  });

  it("offers seven poster presets and two certificate presets", () => {
    expect(presetsFor("poster")).toHaveLength(7);
    expect(presetsFor("certificate")).toEqual(["cert_landscape", "cert_portrait"]);
  });

  it("★ a certificate is exported at the ONE page its master is composed for (DEC-148)", () => {
    // Derived into portrait, a landscape certificate put every line into the
    // top 29% of the page over a 157 mm empty band. A portrait certificate is
    // its own composition now, never a derivation.
    const certificate = (width: number, height: number) => ({ purpose: "certificate" as const, master: { width, height, unit: "px" as const } });
    expect(presetsForDocument(certificate(3508, 2480))).toEqual(["cert_landscape"]);
    expect(presetsForDocument(certificate(2480, 3508))).toEqual(["cert_portrait"]);
    expect(presetsForDocument({ purpose: "poster", master: { width: 1080, height: 1350, unit: "px" } })).toHaveLength(7);
  });
});

describe("REQ-DSG-009 — one master becomes every variant with no manual step", () => {
  it("resizes the canvas to the preset and carries its dpi", () => {
    const derived = derive(master([layer({ id: "t" })]), "a3");
    expect(derived.master).toEqual({ width: 3508, height: 4961, unit: "px", dpi: 300 });
  });

  it("★ a `fixed` layer keeps its size — a 25 mm QR is 25 mm on every preset", () => {
    // Scaling a QR with the page is how a certificate ends up with one too
    // small to scan on the smaller variant (REQ-CRT-010).
    const qr = layer({ id: "qr", kind: "qr", frame: { x: 80, y: 1150, w: 140, h: 140 }, qr: { binding: "session.eventUrl" }, presets: { default: { scale: "fixed" } } } as never);
    for (const preset of ["og", "a3", "story"] as const) {
      const out = derive(master([qr]), preset).layers[0];
      expect(out?.frame.w, preset).toBe(140);
      expect(out?.frame.h, preset).toBe(140);
    }
  });

  it("★ a `block-end` layer holds its distance from the safe BOTTOM, not from the top", () => {
    // The master's safe box is 80…1270 vertically; a footer 80…1270 tall box
    // ending at 1270 sits 0 from the bottom and must still sit 0 from the
    // bottom on a 1920-tall story.
    const footer = layer({ id: "f", frame: { x: 80, y: 1170, w: 920, h: 100 }, presets: { default: { anchor: "block-end" } } });
    const out = derive(master([footer]), "story").layers[0];
    const box = safeBox(PRESETS.story);
    expect(out).toBeDefined();
    expect(out!.frame.y + out!.frame.h).toBe(box.y + box.h);
  });

  it("★ `hideAt` DROPS a layer rather than shrinking it — declared, not discovered", () => {
    const doc = master([layer({ id: "title" }), layer({ id: "abstract", hideAt: ["og", "square"] })]);
    expect(derive(doc, "og").layers.map((l) => l.id)).toEqual(["title"]);
    expect(derive(doc, "square").layers.map((l) => l.id)).toEqual(["title"]);
    expect(derive(doc, "a3").layers.map((l) => l.id)).toEqual(["title", "abstract"]);
  });

  it("★ text RE-FITS per preset — the og title is genuinely smaller, not a downscaled raster", () => {
    const title = layer({ id: "t", font: { family: "X", size: 96, minSize: 56 } });
    const og = derive(master([title]), "og").layers[0];
    const a3 = derive(master([title]), "a3").layers[0];
    expect(og && "font" in og ? og.font.size : 0).toBeLessThan(96);
    expect(a3 && "font" in a3 ? a3.font.size : 0).toBeGreaterThan(96);
    // The template's stated minimum scales with it: a minimum in master
    // pixels would be meaningless on a 300-dpi page.
    expect(a3 && "font" in a3 ? a3.font.minSize : 0).toBeGreaterThan(56);
  });

  it("anchors to the SAFE BOX, not to the page — story's 120 inset, not master's 80", () => {
    const top = layer({ id: "t", frame: { x: 80, y: 80, w: 920, h: 100 } });
    const out = derive(master([top]), "story").layers[0];
    // Sitting at the top of the master's safe area means sitting at the top
    // of story's, which is 120 down rather than 80.
    expect(out?.frame.y).toBe(safeBox(PRESETS.story).y);
  });

  it("is pure — the same document and preset give the same numbers, and the source is untouched", () => {
    const doc = master([layer({ id: "t" })]);
    const before = JSON.stringify(doc);
    expect(derive(doc, "landscape")).toEqual(derive(doc, "landscape"));
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("REQ-DSG-010 — content crossing a safe area is flagged BEFORE export", () => {
  it("constrains what it can and reports what it cannot, naming the layer and the edge", () => {
    // Too tall for og's safe box at any anchor: 630 − 144 = 486 px of room.
    const tall = layer({ id: "tall", frame: { x: 80, y: 100, w: 400, h: 1100 }, presets: { default: { scale: "fixed" } } });
    const violations = safeAreaViolations(master([tall]), "og");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.layerId).toBe("tall");
    expect(violations[0]?.edges.map((e) => e.edge)).toContain("blockEnd");
    expect(violations[0]?.edges[0]?.overflowPx).toBeGreaterThan(0);
  });

  it("a layer that fits raises nothing, on any preset", () => {
    expect(allSafeAreaViolations(master([layer({ id: "t" })]))).toEqual([]);
  });

  it("a hidden layer is not flagged — it is not exported", () => {
    const hidden = layer({ id: "h", hidden: true, frame: { x: 80, y: 100, w: 400, h: 1100 }, presets: { default: { scale: "fixed" } } });
    expect(safeAreaViolations(master([hidden]), "og")).toEqual([]);
  });

  it("checks every preset the document will be exported at, in one call", () => {
    const tall = layer({ id: "tall", frame: { x: 80, y: 100, w: 400, h: 1200 }, presets: { default: { scale: "fixed" } } });
    const presets = new Set(allSafeAreaViolations(master([tall])).map((v) => v.preset));
    // og and landscape are the short ones; a3 has room to spare.
    expect(presets.has("og")).toBe(true);
    expect(presets.has("a3")).toBe(false);
  });
});

describe("REQ-DSG-025 — shrink, then wrap, then warn", () => {
  /** A deterministic stand-in for a text engine: every glyph is half an em
   *  wide, and the box wraps on whole glyphs. Enough to exercise the search;
   *  the real shaping is the parity harness's job. */
  const fake: TextMeasurer = ({ text, size, lineHeight, maxWidth }) => {
    const glyph = size * 0.5;
    const perLine = Math.max(1, Math.floor(maxWidth / glyph));
    const lines = Math.max(1, Math.ceil(text.length / perLine));
    return { lines, height: lines * size * lineHeight, width: Math.min(text.length, perLine) * glyph };
  };

  const spec = (over: Record<string, unknown> = {}) => ({
    text: "كيف نقرأ لوغاريتمًا في دقيقتين",
    // Deep enough that SOME size in 40…96 fits: at 40 the fake needs 136 px
    // for two lines, so a 120-px box could never fit and the test would be
    // asserting the floor rather than the search.
    frame: { w: 400, h: 180 },
    font: { family: "X", size: 96, minSize: 40, lineHeight: 1.7 },
    autoFit: { mode: "shrink-then-wrap" as const, maxLines: 2 },
    ...over,
  });

  it("shrinks until it fits and stops there", () => {
    const result = computeAutoFit(spec(), fake);
    expect(result.fits).toBe(true);
    expect(result.size).toBeLessThan(96);
    expect(result.size).toBeGreaterThanOrEqual(40);
    expect(result.lines).toBeLessThanOrEqual(2);
  });

  it("★ never goes below the template's minimum — it warns instead", () => {
    // A minimum of 90 in a box that needs far less: the template's word wins,
    // and the export is flagged rather than made unreadable.
    const result = computeAutoFit(spec({ font: { family: "X", size: 96, minSize: 90, lineHeight: 1.7 } }), fake);
    expect(result.size).toBe(90);
    expect(result.fits).toBe(false);
    expect(result.warning).toBe("min_size_reached");
  });

  it("distinguishes «it will not get smaller» from «it wrapped onto another line»", () => {
    // Room in the box, but one line too many: a different fix entirely.
    const result = computeAutoFit(spec({ frame: { w: 60, h: 4000 }, autoFit: { mode: "shrink-then-wrap", maxLines: 1 } }), fake);
    expect(result.warning).toBe("max_lines_exceeded");
  });

  it("with no autoFit the template's size stands, and the overflow is still reported", () => {
    const result = computeAutoFit(spec({ autoFit: undefined }), fake);
    expect(result.size).toBe(96);
    expect(result.fits).toBe(false);
  });

  it("searches in integer steps, so two renderers agree on the number", () => {
    // 06 §9.3 compares the FITTED SIZE exactly; a fractional search would make
    // that a coincidence rather than a property.
    expect(Number.isInteger(computeAutoFit(spec(), fake).size)).toBe(true);
  });
});

describe("REQ-DSG-022 / 06 §10 — alignment guides are LOGICAL", () => {
  const doc: DesignDocument = {
    schemaVersion: 1,
    purpose: "poster",
    master: { width: 1080, height: 1350, unit: "px" },
    direction: "rtl",
    layers: [layer({ id: "a", frame: { x: 80, y: 300, w: 400, h: 100 } }), layer({ id: "b", frame: { x: 600, y: 800, w: 300, h: 100 } })],
  };

  it("offers the safe box's edges and centre, and every other layer's edges", () => {
    const targets = snapTargets(doc, "b");
    // The master's safe box is 80…1000 on the inline axis.
    expect(targets).toContain(80);
    expect(targets).toContain(1000);
    expect(targets).toContain(540);
    // Layer `a` runs 80…480.
    expect(targets).toContain(480);
    // ...and never the layer being moved, which would snap it to itself.
    expect(snapTargets(doc, "a")).not.toContain(480);
  });

  it("★ the targets are DOCUMENT coordinates, so they mirror with direction", () => {
    // A guide computed from a rendered position would jump to the other
    // side when the template is mirrored for English (A27). The same
    // document in LTR yields the same numbers.
    expect(snapTargets({ ...doc, direction: "ltr" }, "b")).toEqual(snapTargets(doc, "b"));
  });

  it("snaps within tolerance and leaves anything further alone", () => {
    expect(snap(83, [80, 540, 1000])).toBe(80);
    expect(snap(97, [80, 540, 1000])).toBe(97);
    // The nearest wins when two are in range.
    expect(snap(84, [80, 88])).toBe(84 - 4 === 80 ? 80 : 88);
  });

  it("the block axis has its own targets — a vertical guide is not a horizontal one", () => {
    const targets = snapTargetsBlock(doc, "b");
    expect(targets).toContain(80);
    expect(targets).toContain(1270);
    expect(targets).toContain(400);
  });
});
