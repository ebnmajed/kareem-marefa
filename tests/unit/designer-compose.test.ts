// Adding, duplicating and removing layers — D1b, DEC-178 («add images, logos,
// text, format the text»), REQ-DSG-021 (tokens, never a hex), REQ-DSG-024.
import { describe, expect, it } from "vitest";
import {
  addLayer,
  brandViolations,
  duplicateLayer,
  newLayer,
  nextLayerId,
  removeLayer,
  validateDocument,
  type DesignDocument,
  type Layer,
} from "@kareem/designer-runtime";

const doc = (direction: "rtl" | "ltr" = "rtl", layers: Layer[] = []): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction,
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers,
});

describe("newLayer", () => {
  it.each(["text", "shape", "logo"] as const)("★ a new %s is valid, brand-bound (no hex), on top, inside the safe area", (kind) => {
    const base = doc("rtl", [{ id: "bg", kind: "shape", z: 4, frame: { x: 0, y: 0, w: 10, h: 10 }, shape: { type: "rect", fill: "{{brand.surface}}" } } as Layer]);
    const layer = newLayer(base, kind, { literal: "نص جديد", fontFamily: "IBM Plex Sans Arabic" });
    const next = addLayer(base, layer);
    expect(validateDocument(next).ok).toBe(true);
    expect(brandViolations(next)).toEqual([]);
    expect(layer.z).toBe(5);
    expect(layer.frame.x).toBeGreaterThanOrEqual(80);
    expect(layer.frame.x + layer.frame.w).toBeLessThanOrEqual(1000);
    expect(layer.frame.y).toBeGreaterThanOrEqual(80);
  });

  it("the same call writes the same bytes on an RTL and an LTR page — x is the start offset, nothing reads a direction", () => {
    expect(JSON.stringify(newLayer(doc("rtl"), "text", { literal: "x" }))).toBe(JSON.stringify(newLayer(doc("ltr"), "text", { literal: "x" })));
  });

  it("the logo is BOUND to the brand kit, never embedded — replacing it updates this layer too", () => {
    const logo = newLayer(doc(), "logo");
    expect(logo.kind === "image" ? logo.image : null).toEqual({ binding: "brand.logoAssetId", fit: "contain" });
  });

  it("ids never collide", () => {
    const d = addLayer(doc(), newLayer(doc(), "text"));
    expect(nextLayerId(d, "text")).toBe("l_text_2");
  });
});

describe("duplicate and remove", () => {
  const qr = { id: "l_qr", kind: "qr", locked: true, z: 2, frame: { x: 100, y: 100, w: 200, h: 200 }, qr: { binding: "session.url" } } as Layer;

  it("a copy sits above, 20 px along, under a new id — and its lock does not travel", () => {
    const next = duplicateLayer(doc("rtl", [qr]), "l_qr");
    const copy = next.layers[1] as Layer;
    expect(copy.id).toBe("l_qr_1");
    expect(copy.frame).toMatchObject({ x: 120, y: 120 });
    expect(copy.z).toBe(3);
    expect(copy.locked).toBeUndefined();
    expect(next.layers[0]).toBe(qr);
  });

  it("remove drops exactly the layer; an unknown id is a no-op", () => {
    const d = doc("rtl", [qr]);
    expect(removeLayer(d, "l_qr").layers).toEqual([]);
    expect(removeLayer(d, "nope")).toBe(d);
  });
});
