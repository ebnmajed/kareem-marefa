// Align, fit and reorder — DEC-093 (the single-pointer paths), DEC-096 (the
// document's axis), REQ-DSG-028.
import { describe, expect, it } from "vitest";
import {
  alignLayer,
  fitLayerToSafeArea,
  paintOrder,
  reorderLayer,
  sourceSafeBox,
  type DesignDocument,
  type Layer,
} from "@kareem/designer-runtime";

const text = (id: string, over: Partial<Layer> = {}): Layer =>
  ({
    id,
    kind: "text",
    frame: { x: 300, y: 400, w: 200, h: 100 },
    text: { literal: "نص" },
    font: { family: "IBM Plex Sans Arabic", size: 40 },
    ...over,
  }) as Layer;

const doc = (layers: Layer[], direction: "rtl" | "ltr" = "rtl"): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px", dpi: 72 },
  direction,
  layers,
});

const frameOf = (d: DesignDocument, id: string) => d.layers.find((l) => l.id === id)!.frame;

describe("alignLayer — the document's logical axis", () => {
  it("aligns to the SAFE AREA's start, centre and end on both axes (the master's 80 px inset)", () => {
    const d = doc([text("t")]);
    const box = sourceSafeBox(d);
    expect(box).toEqual({ x: 80, y: 80, w: 920, h: 1190 });
    expect(frameOf(alignLayer(d, "t", "inline", "start", "safe"), "t")).toMatchObject({ x: 80, y: 400 });
    expect(frameOf(alignLayer(d, "t", "inline", "end", "safe"), "t")).toMatchObject({ x: 800 });
    expect(frameOf(alignLayer(d, "t", "inline", "center", "safe"), "t")).toMatchObject({ x: 440 });
    expect(frameOf(alignLayer(d, "t", "block", "start", "safe"), "t")).toMatchObject({ x: 300, y: 80 });
    expect(frameOf(alignLayer(d, "t", "block", "end", "safe"), "t")).toMatchObject({ y: 1170 });
    expect(frameOf(alignLayer(d, "t", "block", "center", "safe"), "t")).toMatchObject({ y: 625 });
  });

  it("aligns to the PAGE when asked, and rounds a half pixel rather than storing one", () => {
    const d = doc([text("t", { frame: { x: 3, y: 3, w: 201, h: 101 } } as Partial<Layer>)]);
    expect(frameOf(alignLayer(d, "t", "inline", "start", "page"), "t").x).toBe(0);
    expect(frameOf(alignLayer(d, "t", "inline", "center", "page"), "t").x).toBe(440);
    expect(Number.isInteger(frameOf(alignLayer(d, "t", "block", "center", "page"), "t").y)).toBe(true);
  });

  it("★ DEC-096: «start» writes the same bytes whatever the document's direction — x IS the inline-start offset", () => {
    // The renderer places x with inset-inline-start, so the stored intent is
    // direction-free; it is the RENDER that mirrors, never the data.
    const rtl = alignLayer(doc([text("t")], "rtl"), "t", "inline", "start", "safe");
    const ltr = alignLayer(doc([text("t")], "ltr"), "t", "inline", "start", "safe");
    expect(JSON.stringify(rtl.layers)).toBe(JSON.stringify(ltr.layers));
  });

  it("leaves every other layer, and the input, untouched", () => {
    const d = doc([text("a"), text("b")]);
    const before = JSON.stringify(d);
    const next = alignLayer(d, "a", "inline", "start", "safe");
    expect(JSON.stringify(d)).toBe(before);
    expect(next.layers[1]).toBe(d.layers[1]);
    expect(alignLayer(d, "missing", "inline", "start", "safe")).toBe(d);
  });
});

describe("fitLayerToSafeArea — «لائم المنطقة الآمنة»", () => {
  it("does not move a layer that already fits", () => {
    const d = doc([text("t")]);
    expect(frameOf(fitLayerToSafeArea(d, "t"), "t")).toEqual(frameOf(d, "t"));
  });

  it("moves a layer back inside, and shrinks one that is wider than the safe area", () => {
    const over = doc([text("t", { frame: { x: 900, y: 1300, w: 200, h: 100 } } as Partial<Layer>)]);
    expect(frameOf(fitLayerToSafeArea(over, "t"), "t")).toEqual({ x: 800, y: 1170, w: 200, h: 100 });
    const wide = doc([text("t", { frame: { x: 0, y: 0, w: 1080, h: 1350, rotation: 5 } } as Partial<Layer>)]);
    expect(frameOf(fitLayerToSafeArea(wide, "t"), "t")).toEqual({ x: 80, y: 80, w: 920, h: 1190, rotation: 5 });
  });
});

describe("reorderLayer — ▲ ▼ and to the front / back (DEC-093's second path)", () => {
  const ids = (d: DesignDocument) => paintOrder(d).map((l) => l.id);

  it("paint order is ascending z, ties in array order — as render.ts paints", () => {
    const d = doc([text("a", { z: 10 }), text("b", { z: 2 }), text("c", { z: 10 }), text("d")]);
    expect(ids(d)).toEqual(["d", "b", "a", "c"]);
  });

  it("forward and backward swap z with the neighbour, and touch nothing else", () => {
    const d = doc([text("a", { z: 1 }), text("b", { z: 2 }), text("c", { z: 3 })]);
    const up = reorderLayer(d, "a", "forward");
    expect(ids(up)).toEqual(["b", "a", "c"]);
    expect(up.layers.find((l) => l.id === "c")).toBe(d.layers[2]);
    expect(ids(reorderLayer(d, "c", "backward"))).toEqual(["a", "c", "b"]);
  });

  it("a tie in z is broken by trading array positions, not by renumbering", () => {
    const d = doc([text("a", { z: 10 }), text("b", { z: 10 })]);
    const up = reorderLayer(d, "a", "forward");
    expect(ids(up)).toEqual(["b", "a"]);
    expect(up.layers.map((l) => l.z)).toEqual([10, 10]);
  });

  it("front and back jump past everything; at the edge already, nothing changes and nothing is written", () => {
    const d = doc([text("a", { z: 1 }), text("b", { z: 5 }), text("c", { z: 3 })]);
    expect(ids(reorderLayer(d, "a", "front"))).toEqual(["c", "b", "a"]);
    expect(reorderLayer(d, "a", "front").layers[0]!.z).toBe(6);
    expect(ids(reorderLayer(d, "b", "back"))).toEqual(["b", "a", "c"]);
    expect(reorderLayer(d, "b", "front")).toBe(d);
    expect(reorderLayer(d, "a", "back")).toBe(d);
    expect(reorderLayer(d, "a", "backward")).toBe(d);
  });
});
