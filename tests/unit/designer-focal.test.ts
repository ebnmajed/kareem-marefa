// The focal point — REQ-DSG-030, A32, DEC-093 path 3, DEC-178.
//
// ★ «The default is the geometric centre, so an untouched document derives
// identically.» The centre is the ABSENCE of a value: choosing it where nothing
// is set writes nothing — no byte, no fingerprint, no export cache miss.
import { describe, expect, it } from "vitest";
import { FOCAL_GRID, focalOf, setFocal, validateDocument, type DesignDocument, type ImageLayer, type Layer } from "@kareem/designer-runtime";

const image = (extra: Partial<ImageLayer> = {}): Layer =>
  ({ id: "img", kind: "image", frame: { x: 0, y: 0, w: 1080, h: 1350 }, image: { assetId: "a", fit: "cover" }, ...extra }) as Layer;
const doc = (layers: Layer[]): DesignDocument => ({ schemaVersion: 1, purpose: "poster", master: { width: 1080, height: 1350, unit: "px" }, direction: "rtl", layers });

describe("setFocal", () => {
  it("★ the centre on an untouched layer is a no-op — the SAME document back", () => {
    const d = doc([image()]);
    expect(setFocal(d, "img", { x: 0.5, y: 0.5 })).toBe(d);
    expect(setFocal(d, "img", { x: 0.5, y: 0.5 }, "og")).toBe(d);
  });

  it("writes the layer's own point, two decimals, clamped to 0…1", () => {
    const next = setFocal(doc([image()]), "img", { x: 0.123, y: 1.4 });
    expect((next.layers[0] as ImageLayer).image.focal).toEqual({ x: 0.12, y: 1 });
  });

  it("★ A32: a preset's override leaves the layer's own point and every other preset alone", () => {
    const d = doc([image({ image: { assetId: "a", fit: "cover", focal: { x: 0.2, y: 0.2 } }, presets: { square: { scale: "fill" } } } as Partial<ImageLayer>)]);
    const next = setFocal(d, "img", { x: 0.5, y: 0.85 }, "og");
    const layer = next.layers[0] as ImageLayer;
    expect(layer.presets?.og?.focal).toEqual({ x: 0.5, y: 0.85 });
    expect(layer.presets?.square).toEqual({ scale: "fill" });
    expect(layer.image.focal).toEqual({ x: 0.2, y: 0.2 });
    expect(focalOf(layer, "og")).toEqual({ x: 0.5, y: 0.85 });
    expect(focalOf(layer, "story")).toEqual({ x: 0.2, y: 0.2 });
  });

  it("an explicit centre on a layer that HAS a point is written — the uploaded poster starts at {0.5, 0.5}", () => {
    const d = doc([image({ image: { assetId: "a", fit: "cover", focal: { x: 0.1, y: 0.1 } } } as Partial<ImageLayer>)]);
    expect((setFocal(d, "img", { x: 0.5, y: 0.5 }).layers[0] as ImageLayer).image.focal).toEqual({ x: 0.5, y: 0.5 });
  });

  it("a non-image layer or an unknown id is untouched", () => {
    const d = doc([{ id: "t", kind: "shape", frame: { x: 0, y: 0, w: 1, h: 1 }, shape: { type: "rect" } } as Layer]);
    expect(setFocal(d, "t", { x: 0, y: 0 })).toBe(d);
    expect(setFocal(d, "nope", { x: 0, y: 0 })).toBe(d);
  });
});

describe("the nine-point grid", () => {
  it("is nine PHYSICAL points, rows from the top, each left to right — object-position is not mirrored by dir", () => {
    expect(FOCAL_GRID).toHaveLength(9);
    expect(FOCAL_GRID[0]).toEqual({ x: 0, y: 0 });
    expect(FOCAL_GRID[4]).toEqual({ x: 0.5, y: 0.5 });
    expect(FOCAL_GRID[8]).toEqual({ x: 1, y: 1 });
  });
});

describe("validation of a preset's focal point (wave 13 — it was never checked)", () => {
  it("accepts 0…1 and refuses anything else, naming the preset", () => {
    const ok = validateDocument(doc([image({ presets: { og: { focal: { x: 0.5, y: 1 } } } } as Partial<ImageLayer>)]));
    expect(ok.ok).toBe(true);
    const bad = validateDocument(doc([image({ presets: { og: { focal: { x: 2, y: 0.5 } } } } as Partial<ImageLayer>)]));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]).toMatchObject({ path: "layers[0].presets.og.focal", code: "image_focal" });
  });
});
