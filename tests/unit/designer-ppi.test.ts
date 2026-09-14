// Image layers, the PPI guard and the per-variant crop — REQ-DSG-018,
// REQ-DSG-019, REQ-DSG-020, DEC-009, A31, A32.
//
// The guard is the price DEC-009 charges for dropping SVG: «org logos are now
// raster, so an org must supply a high-resolution PNG or the PPI guard blocks
// A3». These tests are what make sure it actually collects it — at design
// time, naming the layer and the preset, rather than at the print shop.
import { describe, expect, it } from "vitest";
import {
  blocksExport,
  imageSize,
  layerPpi,
  PPI_BLOCK_BELOW,
  PPI_WARN_BELOW,
  ppiFindings,
  PRESETS,
  derive,
  type DesignDocument,
  type Layer,
} from "@kareem/designer-runtime";

/* ── the three formats, as real headers ─────────────────────────────────── */

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x00, 0x00, 0x00, 0x0d], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** With a JFIF APP0 segment in front of the SOF0, because a real JPEG never
 *  puts its dimensions at a fixed offset — EXIF, ICC and comments come first
 *  and their sizes vary with whatever wrote the file. */
function jpegBytes(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...new Array(16).fill(0)]);
}

function webpLossyBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  b[26] = width & 0xff;
  b[27] = (width >> 8) & 0x3f;
  b[28] = height & 0xff;
  b[29] = (height >> 8) & 0x3f;
  return b;
}

describe("REQ-DSG-018 — the three formats, measured from their bytes", () => {
  it("reads PNG, JPEG and WebP dimensions", () => {
    expect(imageSize(pngBytes(1080, 1350))).toEqual({ kind: "png", width: 1080, height: 1350 });
    expect(imageSize(jpegBytes(4000, 3000))).toEqual({ kind: "jpeg", width: 4000, height: 3000 });
    expect(imageSize(webpLossyBytes(800, 600))).toEqual({ kind: "webp", width: 800, height: 600 });
  });

  it("★ walks the JPEG segment chain rather than trusting an offset", () => {
    // The APP0 above sits between the SOI and the SOF; a fixed-offset reader
    // would return the JFIF version bytes as a size and be confidently wrong.
    expect(imageSize(jpegBytes(1920, 1080))?.width).toBe(1920);
  });

  it("returns null for anything else, and a caller treats that as a rejection", () => {
    // An SVG is text. It has no size to read, and DEC-009 rejects it on the
    // sniff before this is ever reached — but null is the honest answer, not
    // an assumed default, because the PPI guard exists precisely because
    // nobody checks by eye.
    expect(imageSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="99"/>'))).toBeNull();
    expect(imageSize(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBeNull();
    expect(imageSize(new Uint8Array(4))).toBeNull();
  });
});

describe("REQ-DSG-019 — the PPI guard", () => {
  it("computes the effective resolution from the frame's physical size", () => {
    // A 1000-px asset in a frame 1181 px wide at 300 dpi is 1181/300 inches
    // across, so ~254 PPI.
    expect(layerPpi({ width: 1000, height: 1000 }, { w: 1181, h: 1181 }, 300)).toBe(254);
    // Twice the pixels in the same frame is twice the resolution.
    expect(layerPpi({ width: 2000, height: 2000 }, { w: 1181, h: 1181 }, 300)).toBe(508);
  });

  it("`contain` is bound by the roomier axis and `cover` by the tighter one", () => {
    const asset = { width: 1000, height: 4000 };
    const frame = { w: 1000, h: 1000 };
    // Letterboxed, the whole asset fits, so the width is what stretches.
    expect(layerPpi(asset, frame, 300, "contain")).toBe(300);
    // Cropped, the asset fills, so the tall axis carries the resolution.
    expect(layerPpi(asset, frame, 300, "cover")).toBe(1200);
  });

  const logoDocument = (w: number, h: number): { doc: DesignDocument; sizes: Record<string, { width: number; height: number }> } => ({
    doc: {
      schemaVersion: 1,
      purpose: "poster",
      master: { width: 1080, height: 1350, unit: "px" },
      direction: "rtl",
      layers: [{ id: "l_logo", kind: "image", frame: { x: 860, y: 80, w: 140, h: 140 }, image: { assetId: "a", fit: "contain" } } as Layer],
    },
    sizes: { l_logo: { width: w, height: h } },
  });

  it("★ blocks below 200 PPI and names the layer AND the preset", () => {
    // A 140-px logo on the master becomes ~455 px on A3; a 200-px asset in
    // it is far under the floor.
    const { doc, sizes } = logoDocument(200, 200);
    const findings = ppiFindings(doc, sizes);
    const a3 = findings.find((f) => f.preset === "a3");
    expect(a3).toBeDefined();
    expect(a3!.severity).toBe("block");
    expect(a3!.layerId).toBe("l_logo");
    expect(a3!.ppi).toBeLessThan(PPI_BLOCK_BELOW);
    expect(blocksExport(findings)).toBe(true);
  });

  it("warns between 200 and 300, which is soft rather than refused", () => {
    // A 140-px logo frame becomes ~516 px on A3, so ~430 real pixels lands
    // at ~250 PPI: under what print wants, over what it refuses.
    const { doc, sizes } = logoDocument(430, 430);
    const a3 = ppiFindings(doc, sizes).find((f) => f.preset === "a3");
    expect(a3?.severity).toBe("warn");
    expect(a3!.ppi).toBeGreaterThanOrEqual(PPI_BLOCK_BELOW);
    expect(a3!.ppi).toBeLessThan(PPI_WARN_BELOW);
  });

  it("a high-resolution asset raises nothing at all", () => {
    const { doc, sizes } = logoDocument(4000, 4000);
    expect(ppiFindings(doc, sizes)).toEqual([]);
  });

  it("★ never fires on a SCREEN preset — an exact-pixel export has no inch to be per", () => {
    const { doc, sizes } = logoDocument(60, 60);
    const presets = new Set(ppiFindings(doc, sizes).map((f) => f.preset));
    expect(presets.has("og")).toBe(false);
    expect(presets.has("master")).toBe(false);
    expect(presets.has("a3")).toBe(true);
    expect(PRESETS.og.bleed).toBe(0);
  });

  it("says nothing about a layer whose asset is unbound — that is the placeholder's job", () => {
    const { doc } = logoDocument(10, 10);
    expect(ppiFindings(doc, {})).toEqual([]);
  });

  it("skips a hidden layer, which is not exported", () => {
    const { doc, sizes } = logoDocument(50, 50);
    const hidden = { ...doc, layers: doc.layers.map((l) => ({ ...l, hidden: true })) };
    expect(ppiFindings(hidden, sizes)).toEqual([]);
  });
});

describe("REQ-DSG-020 / A32 — the per-variant crop", () => {
  const uploaded: DesignDocument = {
    schemaVersion: 1,
    purpose: "poster",
    master: { width: 1080, height: 1350, unit: "px" },
    direction: "rtl",
    layers: [
      {
        id: "uploaded",
        kind: "image",
        locked: true,
        frame: { x: 0, y: 0, w: 1080, h: 1350 },
        image: { assetId: "a", fit: "cover", focal: { x: 0.5, y: 0.5 } },
        presets: {
          default: { scale: "fill", anchor: "center" },
          // The escape hatch: this poster's subject is at the bottom, and a
          // 16:9 crop centred on the geometry would cut it off.
          og: { scale: "fill", anchor: "center", focal: { x: 0.5, y: 0.85 } },
        },
      } as Layer,
    ],
  };

  it("★ an override applies to ITS preset and leaves the others centred", () => {
    const og = derive(uploaded, "og").layers[0];
    const square = derive(uploaded, "square").layers[0];
    expect(og && og.kind === "image" ? og.image.focal : null).toEqual({ x: 0.5, y: 0.85 });
    expect(square && square.kind === "image" ? square.image.focal : null).toEqual({ x: 0.5, y: 0.5 });
  });

  it("★ a per-preset entry overrides `default` FIELD BY FIELD", () => {
    // Declaring a crop for `og` must not silently drop the `scale` and
    // `anchor` that `default` set — which is how an override quietly re-tops
    // a centred layer while looking like it only changed the crop.
    const og = derive(uploaded, "og").layers[0];
    expect(og).toBeDefined();
    const safeW = PRESETS.og.width - PRESETS.og.safe.inlineStart - PRESETS.og.safe.inlineEnd;
    const safeH = PRESETS.og.height - PRESETS.og.safe.blockStart - PRESETS.og.safe.blockEnd;
    // `scale: fill` survived: the layer spans the safe width.
    expect(og!.frame.w).toBe(safeW);
    // `anchor: center` survived: its midline is the safe box's midline.
    expect(og!.frame.y + og!.frame.h / 2).toBeCloseTo(PRESETS.og.safe.blockStart + safeH / 2, 0);
  });

  it("every poster variant exists after an upload — nothing is hidden or dropped", () => {
    for (const preset of ["master", "square", "story", "landscape", "og", "a4", "a3"] as const) {
      expect(derive(uploaded, preset).layers, preset).toHaveLength(1);
    }
  });
});
