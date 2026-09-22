// D2b — an uploaded poster crops for real (REQ-DSG-020, REQ-DSG-030, DEC-178).
//
// Until wave 13 an upload's `fill` kept its frame at 4:5 on every preset, so
// nothing was cropped: the master was inset 80 px and `square`, `landscape` and
// `og` spilled off the page (`designer.md` W13.0 item 5). `page` makes the layer
// the whole page, bleed included, so `object-fit: cover` crops around the
// focal point. Three conditions from the lead, each pinned here or beside it:
//   · no golden moves — `fill` and every other branch are byte-identical
//     (`designer-derive-untouched.test.ts`, and the parity harness);
//   · a document using `page` declares schemaVersion 2, so `main`'s worker
//     refuses it (`schema_version_future`) instead of caching a wrong render —
//     and the version is part of the fingerprint, so the retried render after
//     the deploy is the new worker's;
//   · (the owner's order: reconnect Railway before anyone edits — not a test).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BASE_SCHEMA_VERSION,
  derive,
  fingerprintSource,
  PAGE_SCALE_SCHEMA_VERSION,
  PRESETS,
  presetsFor,
  renderDocumentToHtml,
  SCHEMA_VERSION,
  validateDocument,
  type DesignDocument,
  type ImageLayer,
} from "@kareem/designer-runtime";

function uploaded(schemaVersion: number = PAGE_SCALE_SCHEMA_VERSION): DesignDocument {
  const presets: Record<string, { scale: "page"; anchor: "center" }> = {};
  for (const n of presetsFor("poster")) presets[n] = { scale: "page", anchor: "center" };
  return {
    schemaVersion,
    purpose: "poster",
    master: { width: 1080, height: 1350, unit: "px", dpi: 72 },
    direction: "rtl",
    layers: [
      { id: "uploaded", kind: "image", frame: { x: 0, y: 0, w: 1080, h: 1350 }, locked: true, image: { assetId: "a", fit: "cover", focal: { x: 0.5, y: 0.5 } }, presets } as ImageLayer,
    ],
  };
}

describe("scale: 'page'", () => {
  it.each(presetsFor("poster"))("★ %s: the upload is the WHOLE page, so cover crops into the preset's own ratio", (preset) => {
    const layer = derive(uploaded(), preset).layers[0] as ImageLayer;
    expect(layer.frame).toEqual({ x: 0, y: 0, w: PRESETS[preset].width, h: PRESETS[preset].height });
  });

  it("a preset's focal override still reaches its variant, and only its variant", () => {
    const d = uploaded();
    const layer = d.layers[0] as ImageLayer;
    layer.presets = { ...layer.presets, og: { scale: "page", anchor: "center", focal: { x: 0.5, y: 0.85 } } };
    expect((derive(d, "og").layers[0] as ImageLayer).image.focal).toEqual({ x: 0.5, y: 0.85 });
    expect((derive(d, "square").layers[0] as ImageLayer).image.focal).toEqual({ x: 0.5, y: 0.5 });
    expect(renderDocumentToHtml(derive(d, "og"), { fonts: [], bindings: { values: {} } })).toContain("object-fit:cover;object-position:50% 85%");
  });
});

describe("the version guard — main's worker refuses, never renders wrongly", () => {
  it("★ `page` in a version-1 document is refused, naming the layer", () => {
    const result = validateDocument(uploaded(BASE_SCHEMA_VERSION));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: "layers[0].presets", code: "page_scale_needs_v2" }));
  });

  it("a version-2 document using it is valid; version 3 is still the future", () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(validateDocument(uploaded(2)).ok).toBe(true);
    const future = validateDocument(uploaded(3));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.issues.map((i) => i.code)).toContain("schema_version_future");
  });

  it("★ the schema version is part of the fingerprint — the same content at 1 and at 2 are different cache keys", () => {
    const key = (d: DesignDocument) => createHash("sha256").update(fingerprintSource({ document: d, templateVersionId: null, bindings: {}, fontHashes: ["f"] })).digest("hex");
    expect(key(uploaded(1))).not.toBe(key(uploaded(2)));
  });
});
