// Group align, distribute, tap-to-place, rotate and fill-width by a tap —
// REQ-DSG-028, DEC-093 (every dragged operation has a tap), DEC-096 (the
// DOCUMENT's axis), DEC-178. Added beside `alignLayer()` / `fitLayerToSafeArea()`
// / `reorderLayer()`, whose own suite is unchanged.
import { describe, expect, it } from "vitest";
import {
  alignLayer,
  alignLayers,
  distributeLayers,
  fillSafeWidth,
  placeLayerCentre,
  rotateLayer,
  selectionBox,
  type DesignDocument,
  type Frame,
  type Layer,
} from "@kareem/designer-runtime";

const box = (id: string, frame: Frame): Layer => ({ id, kind: "shape", frame, shape: { type: "rect", fill: "{{brand.surface}}" } }) as Layer;
const doc = (layers: Layer[], direction: "rtl" | "ltr" = "rtl"): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction,
  layers,
});
const frames = (d: DesignDocument) => Object.fromEntries(d.layers.map((l) => [l.id, l.frame]));

describe("alignLayers", () => {
  it("★ to the safe area or the page it IS alignLayer() for each — a group and one layer cannot disagree", () => {
    const d = doc([box("a", { x: 300, y: 100, w: 100, h: 50 }), box("b", { x: 500, y: 400, w: 200, h: 50 })]);
    const one = alignLayer(alignLayer(d, "a", "inline", "start", "safe"), "b", "inline", "start", "safe");
    expect(alignLayers(d, ["a", "b"], "inline", "start", "safe")).toEqual(one);
  });

  it("to the SELECTION: each against the group's own bounds, on the document's axis", () => {
    const d = doc([box("a", { x: 300, y: 100, w: 100, h: 50 }), box("b", { x: 500, y: 400, w: 200, h: 50 }), box("c", { x: 0, y: 0, w: 10, h: 10 })]);
    expect(selectionBox(d, ["a", "b"])).toEqual({ x: 300, y: 100, w: 400, h: 350 });
    const end = frames(alignLayers(d, ["a", "b"], "inline", "end", "selection"));
    expect(end.a?.x).toBe(600);
    expect(end.b?.x).toBe(500);
    expect(end.c).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    const middle = frames(alignLayers(d, ["a", "b"], "block", "center", "selection"));
    expect(middle.a?.y).toBe(250);
    expect(middle.b?.y).toBe(250);
  });

  it("★ DEC-096: the same group align writes the same bytes on an RTL and an LTR page — x is the start offset", () => {
    const layers = [box("a", { x: 300, y: 100, w: 100, h: 50 }), box("b", { x: 500, y: 400, w: 200, h: 50 })];
    const rtl = alignLayers(doc(layers, "rtl"), ["a", "b"], "inline", "start", "selection");
    const ltr = alignLayers(doc(layers, "ltr"), ["a", "b"], "inline", "start", "selection");
    expect(JSON.stringify(rtl.layers)).toBe(JSON.stringify(ltr.layers));
  });
});

describe("distributeLayers", () => {
  it("equal gaps between three, the outermost two where they were", () => {
    const d = doc([box("a", { x: 100, y: 0, w: 100, h: 10 }), box("b", { x: 220, y: 0, w: 50, h: 10 }), box("c", { x: 600, y: 0, w: 100, h: 10 })]);
    const f = frames(distributeLayers(d, ["c", "a", "b"], "inline"));
    expect(f.a?.x).toBe(100);
    expect(f.c?.x).toBe(600);
    // span 600, sizes 250, two gaps of 175: b starts at 100 + 100 + 175.
    expect(f.b?.x).toBe(375);
  });

  it("fewer than three is a no-op, and the input is untouched", () => {
    const d = doc([box("a", { x: 100, y: 0, w: 100, h: 10 }), box("b", { x: 220, y: 0, w: 50, h: 10 })]);
    const before = JSON.stringify(d);
    expect(distributeLayers(d, ["a", "b"], "inline")).toBe(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("the tap paths for move, rotate and resize", () => {
  it("tap-to-place puts the layer's CENTRE on the tapped logical point, in whole pixels", () => {
    const f = frames(placeLayerCentre(doc([box("a", { x: 0, y: 0, w: 101, h: 50 })]), "a", { x: 540, y: 675 }));
    expect(f.a).toEqual({ x: 490, y: 650, w: 101, h: 50 });
  });

  it("±15° by a tap wraps into (−180, 180]; «صفّر» sets 0", () => {
    let d = doc([box("a", { x: 0, y: 0, w: 10, h: 10, rotation: 175 })]);
    d = rotateLayer(d, "a", 15);
    expect(d.layers[0]?.frame.rotation).toBe(-170);
    expect(rotateLayer(d, "a", 0, "to").layers[0]?.frame.rotation).toBe(0);
  });

  it("«املأ المنطقة الآمنة عرضًا» spans the safe width and keeps the height", () => {
    const f = frames(fillSafeWidth(doc([box("a", { x: 300, y: 200, w: 100, h: 60 })]), "a"));
    expect(f.a).toEqual({ x: 80, y: 200, w: 920, h: 60 });
  });
});
