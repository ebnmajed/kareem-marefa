// The document model and its validator — REQ-DSG-004, REQ-DSG-005, 06 §2.
//
// `validateDocument()` is what stands between an autosave and a render: the
// Route Handler runs it before the row is written and the worker runs it
// before it drives Chromium. The cases below are the ones where "invalid"
// means something specific rather than merely malformed.
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, validateDocument, type DesignDocument } from "@kareem/designer-runtime";

const textLayer = (over: Record<string, unknown> = {}) => ({
  id: "l_title",
  kind: "text",
  frame: { x: 80, y: 300, w: 920, h: 320 },
  text: { binding: "session.title", fallback: "عنوان الجلسة" },
  font: { family: "IBM Plex Sans Arabic", size: 96, lineHeight: 1.4, weight: 600 },
  align: "start",
  color: "{{brand.fgHeading}}",
  ...over,
});

const doc = (layers: unknown[] = [textLayer()], over: Record<string, unknown> = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers,
  ...over,
});

const codes = (input: unknown) => {
  const result = validateDocument(input);
  return result.ok ? [] : result.issues.map((i) => i.code);
};

describe("validateDocument", () => {
  it("accepts 06 §2.1's own example shape", () => {
    const result = validateDocument(
      doc([
        textLayer(),
        { id: "l_qr", kind: "qr", locked: true, frame: { x: 80, y: 1150, w: 140, h: 140 }, qr: { binding: "session.eventUrl", ecLevel: "M", quietZoneModules: 4 } },
        { id: "l_logo", kind: "image", locked: true, frame: { x: 860, y: 80, w: 140, h: 140 }, image: { binding: "brand.logoAssetId", fit: "contain", focal: { x: 0.5, y: 0.5 } } },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it("★ refuses any letter-spacing but zero — A30, the cursive join", () => {
    // A spaced Arabic word is a BROKEN word, not a loose one, and nothing
    // downstream can recover from it. So it is refused at the door rather
    // than rendered and noticed in print.
    expect(codes(doc([textLayer({ font: { family: "X", size: 40, letterSpacing: 2 } })]))).toContain("letter_spacing");
    expect(codes(doc([textLayer({ font: { family: "X", size: 40, letterSpacing: 0 } })]))).toEqual([]);
  });

  it("★ refuses physical alignment — start/center/end only (06 §2.2)", () => {
    // A template written with left/right has to be redrawn for English; one
    // written logically is a direction flip.
    expect(codes(doc([textLayer({ align: "left" })]))).toContain("align_logical");
    expect(codes(doc([textLayer({ align: "end" })]))).toEqual([]);
  });

  it("★ refuses a QR quiet zone under four modules — REQ-CRT-010, A29", () => {
    // A thin quiet zone scans on a screen and fails on paper, which is the
    // only place a certificate QR is ever used.
    const qr = (quiet: number) => doc([{ id: "q", kind: "qr", frame: { x: 0, y: 0, w: 140, h: 140 }, qr: { binding: "certificate.verifyUrl", quietZoneModules: quiet } }]);
    expect(codes(qr(3))).toContain("qr_quiet_zone");
    expect(codes(qr(4))).toEqual([]);
  });

  it("refuses a duplicate layer id — two layers with one id make the locked-region guard ambiguous", () => {
    expect(codes(doc([textLayer(), textLayer()]))).toContain("layer_id_duplicated");
  });

  it("refuses an unknown layer kind, a zero-size frame and an out-of-range opacity", () => {
    expect(codes(doc([textLayer({ kind: "video" })]))).toContain("layer_kind");
    expect(codes(doc([textLayer({ frame: { x: 0, y: 0, w: 0, h: 10 } })]))).toContain("frame_size");
    expect(codes(doc([textLayer({ opacity: 1.4 })]))).toContain("opacity_range");
  });

  it("refuses a font hash that is not a SHA-256 — REQ-CRT-014 pins bytes, not names", () => {
    expect(codes(doc([textLayer({ font: { family: "X", size: 40, hash: "sha256:nope" } })]))).toContain("font_hash");
    expect(codes(doc([textLayer({ font: { family: "X", size: 40, hash: `sha256:${"a".repeat(64)}` } })]))).toEqual([]);
  });

  it("★ renders an OLDER schema version and refuses a newer one (REQ-DSG-005, REQ-CRT-014)", () => {
    // A certificate issued in 2026 must still regenerate in 2031, so an older
    // document is accepted. A NEWER one cannot be: guessing would silently
    // drop whatever the newer schema added.
    expect(codes(doc([textLayer()], { schemaVersion: 1 }))).toEqual([]);
    expect(codes(doc([textLayer()], { schemaVersion: SCHEMA_VERSION + 1 }))).toContain("schema_version_future");
  });

  it("refuses a master in anything but pixels — presets are declared in pixels (06 §5)", () => {
    expect(codes(doc([textLayer()], { master: { width: 210, height: 297, unit: "mm" } }))).toContain("master_unit");
  });

  it("narrows the type on success, so a caller never re-casts", () => {
    const result = validateDocument(doc());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d: DesignDocument = result.document;
      expect(d.layers[0]?.kind).toBe("text");
    }
  });

  it("refuses something that is not an object at all, without throwing", () => {
    for (const input of [null, undefined, 42, "poster", []]) {
      expect(validateDocument(input).ok).toBe(false);
    }
  });
});
