// REQ-EVT-011 — byte-level EXIF/XMP/ICC stripping, no image library, no
// pixel decode (DEC-047). Every fixture here is hand-built at the
// container level (JPEG markers / PNG chunks / WebP RIFF chunks) — none is
// a decodable image, because stripJpeg/stripPng/stripWebp never look past
// each container's own structure, so a fixture only needs to be a
// well-formed container, never a well-formed picture.
import { describe, expect, it } from "vitest";
import { assertsNoExifRemains, stripImageMetadata } from "@/lib/storage/exif";
import { stripImageMetadata as workerStripImageMetadata, sniffImageKind } from "../../worker/src/content/exif";

function bytes(...parts: (number[] | Uint8Array | string)[]): Uint8Array {
  const arrays = parts.map((p) => {
    if (typeof p === "string") return Uint8Array.from(p, (c) => c.charCodeAt(0));
    if (p instanceof Uint8Array) return p;
    return Uint8Array.from(p);
  });
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}
function u16be(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}
function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// ── JPEG fixture: SOI, APP0 (JFIF, kept), APP1 (EXIF, stripped), APP2 (ICC,
// stripped), SOF0 (1×1, kept — width/height read from here), SOS + two
// bytes of "entropy data" that deliberately contain 0xFF 0xE1 (what would
// be an EXIF marker if this were re-parsed as markers — proving scan data
// is copied verbatim, never re-scanned), EOI.
function jpegFixture(): Uint8Array {
  const app0 = bytes([0xff, 0xe0], u16be(16), "JFIF\0", [1, 1, 0], u16be(1), u16be(1), [0, 0]);
  const app1Exif = bytes([0xff, 0xe1], u16be(2 + 6 + 8), "Exif\0\0", [0, 0, 0, 0, 0, 0, 0, 0]);
  const app2Icc = bytes([0xff, 0xe2], u16be(2 + 12), "ICC_PROFILE\0");
  const sof0 = bytes(
    [0xff, 0xc0],
    u16be(17),
    [8], // precision
    u16be(1), // height
    u16be(1), // width
    [3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1], // 3 components
  );
  const sosHeaderLen = 2 + 1 + 2 * 3 + 3; // length field + numComp + 3*(id,huff) + 3 spectral bytes
  const sos = bytes([0xff, 0xda], u16be(sosHeaderLen), [3, 1, 0, 2, 17, 3, 17, 0, 63, 0]);
  const scanData = bytes([0xaa, 0xbb, 0xff, 0x00, 0xcc, 0xff, 0xe1, 0xdd]); // 0xFF00 stuffing + a fake "marker" that must survive untouched
  const eoi = bytes([0xff, 0xd9]);
  return bytes([0xff, 0xd8], app0, app1Exif, app2Icc, sof0, sos, scanData, eoi);
}

// ── PNG fixture: signature, IHDR (2×3, kept), tEXt (stripped), eXIf
// (stripped), an unrelated ancillary chunk pHYs (kept), IDAT (kept, garbage
// payload — never decoded), IEND.
function pngChunk(type: string, payload: number[]): Uint8Array {
  return bytes(u32be(payload.length), type, payload, [0, 0, 0, 0]); // CRC left as zero — never validated by the stripper
}
function pngFixture(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [...u32be(2), ...u32be(3), 8, 6, 0, 0, 0]);
  const text = pngChunk("tEXt", [...Uint8Array.from("Author\0Someone", (c) => c.charCodeAt(0))]);
  const exif = pngChunk("eXIf", [1, 2, 3, 4, 5]);
  const phys = pngChunk("pHYs", [...u32be(2835), ...u32be(2835), 1]);
  const idat = pngChunk("IDAT", [1, 2, 3, 4, 5, 6]);
  const iend = pngChunk("IEND", []);
  return bytes(sig, ihdr, text, exif, phys, idat, iend);
}

// ── WebP fixture: RIFF/WEBP, a VP8X chunk (4×5, kept), an EXIF chunk
// (stripped, odd length to prove padding is handled), an ANIM-unrelated
// placeholder chunk kept as-is.
function riffChunk(fourCc: string, payload: number[]): Uint8Array {
  const padded = payload.length % 2 === 1 ? [...payload, 0] : payload;
  return bytes(fourCc, u32le(payload.length), padded);
}
function webpFixture(): Uint8Array {
  const vp8x = riffChunk("VP8X", [0, 0, 0, 0, ...[3, 0, 0], ...[4, 0, 0]]); // width-1=3 → 4, height-1=4 → 5
  const exif = riffChunk("EXIF", [1, 2, 3]); // odd length → padded
  const other = riffChunk("ALPH", [9, 9]);
  const body = bytes("WEBP", vp8x, exif, other);
  return bytes("RIFF", u32le(body.length), body);
}

describe("stripImageMetadata — JPEG", () => {
  it("★ removes APP1 (EXIF) and APP2 (ICC), keeps APP0/SOF0/scan data byte-for-byte, and never re-parses scan data as markers", () => {
    const result = stripImageMetadata(jpegFixture(), "jpeg");
    expect(result.removed.sort()).toEqual(["APP1", "APP2"]);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text).not.toContain("Exif\0\0");
    expect(text).not.toContain("ICC_PROFILE");
    expect(text).toContain("JFIF");
    // The fake in-scan-data "marker" (0xFF 0xE1) survived untouched — proof the scan is copied verbatim.
    expect(Array.from(result.bytes)).toEqual(
      expect.arrayContaining([0xaa, 0xbb, 0xff, 0x00, 0xcc, 0xff, 0xe1, 0xdd]),
    );
    expect(result.bytes[0]).toBe(0xff);
    expect(result.bytes[1]).toBe(0xd8);
    expect(result.bytes.at(-2)).toBe(0xff);
    expect(result.bytes.at(-1)).toBe(0xd9);
  });

  it("rejects a buffer with no JPEG SOI", () => {
    expect(() => stripImageMetadata(new Uint8Array([1, 2, 3]), "jpeg")).toThrow();
  });
});

describe("stripImageMetadata — PNG", () => {
  it("★ removes tEXt and eXIf, keeps IHDR/pHYs/IDAT/IEND intact, reads width/height from IHDR", () => {
    const result = stripImageMetadata(pngFixture(), "png");
    expect(result.removed.sort()).toEqual(["eXIf", "tEXt"]);
    expect(result.width).toBe(2);
    expect(result.height).toBe(3);
    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text).not.toContain("Author");
    expect(text).toContain("pHYs");
    expect(text).toContain("IDAT");
    expect(text.slice(-8, -4)).toBe("IEND");
  });

  it("rejects a buffer with no PNG signature", () => {
    expect(() => stripImageMetadata(new Uint8Array(8), "png")).toThrow();
  });
});

describe("stripImageMetadata — WebP", () => {
  it("★ removes the EXIF chunk (odd-length, padded), rewrites the RIFF size, keeps other chunks", () => {
    const original = webpFixture();
    const result = stripImageMetadata(original, "webp");
    expect(result.removed).toEqual(["EXIF"]);
    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text).toContain("ALPH");
    expect(text).toContain("VP8X");
    // RIFF size field (bytes 4-7, little-endian) matches the new total length minus 8.
    const riffSize = result.bytes[4]! | (result.bytes[5]! << 8) | (result.bytes[6]! << 16) | (result.bytes[7]! << 24);
    expect(riffSize).toBe(result.bytes.length - 8);
    expect(result.bytes.length).toBeLessThan(original.length);
  });

  it("rejects a buffer with no RIFF/WEBP header", () => {
    expect(() => stripImageMetadata(new Uint8Array(12), "webp")).toThrow();
  });
});

describe("assertsNoExifRemains", () => {
  it("★ is false on the raw fixtures and true once each has been stripped — the same assertion the e2e makes on stored bytes", () => {
    expect(assertsNoExifRemains(jpegFixture())).toBe(false);
    expect(assertsNoExifRemains(stripImageMetadata(jpegFixture(), "jpeg").bytes)).toBe(true);

    expect(assertsNoExifRemains(pngFixture())).toBe(false);
    expect(assertsNoExifRemains(stripImageMetadata(pngFixture(), "png").bytes)).toBe(true);

    expect(assertsNoExifRemains(webpFixture())).toBe(false);
    expect(assertsNoExifRemains(stripImageMetadata(webpFixture(), "webp").bytes)).toBe(true);
  });
});

describe("worker/src/content/exif.ts — parity with src/lib/storage/exif.ts", () => {
  // worker/src/content/exif.ts is a port (that file's own header explains
  // why: a separate TypeScript project with no import back into `src/`,
  // the same reason the wave-2 path-builder port existed). Every fixture
  // above, run through BOTH copies, must come out byte-for-byte identical —
  // a mismatch here would mean the worker strips differently from what its
  // own unit tests would lead a reviewer to believe.
  it("★ strips identically on JPEG, PNG and WebP", () => {
    for (const [fixture, kind] of [
      [jpegFixture(), "jpeg"],
      [pngFixture(), "png"],
      [webpFixture(), "webp"],
    ] as const) {
      const a = stripImageMetadata(fixture, kind);
      const b = workerStripImageMetadata(fixture, kind);
      expect(Array.from(b.bytes)).toEqual(Array.from(a.bytes));
      expect(b.removed.sort()).toEqual(a.removed.sort());
      expect(b.width).toBe(a.width);
      expect(b.height).toBe(a.height);
    }
  });

  it("★ sniffImageKind rejects SVG and matches each fixture's real kind (DEC-009, the worker's own gate)", () => {
    expect(sniffImageKind(jpegFixture())).toBe("jpeg");
    expect(sniffImageKind(pngFixture())).toBe("png");
    expect(sniffImageKind(webpFixture())).toBe("webp");
    expect(sniffImageKind(Uint8Array.from(Buffer.from('<svg xmlns="x"><script>alert(1)</script></svg>')))).toBe("svg");
    expect(sniffImageKind(new Uint8Array([1, 2, 3]))).toBe("unknown");
  });
});
