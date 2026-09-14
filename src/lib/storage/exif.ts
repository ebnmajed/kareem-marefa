// Byte-level EXIF/XMP/ICC stripping — REQ-EVT-011, DEC-005, amended DEC-047.
//
// "The stored object contains no EXIF block; verified by a test asserting
// on the stored bytes. Stripping happens before the object is retrievable,
// not as a later cleanup job." (01 §REQ-EVT-011). DEC-047 settles HOW: byte-
// level segment/chunk removal, without decoding the image, with no image
// library — pure functions over a `Uint8Array`, portable to the worker
// (worker/src/content/exif.ts is the same logic, ported for the same reason
// paths.ts is: a separate TypeScript project with no import back into
// `src/`, docs/plan/notes/content.md §1.3).
//
// This module never decodes pixels, never re-encodes, and never resizes —
// DEC-047 is explicit that re-encoding to WebP is a later size
// optimisation, not part of the correctness requirement. It only removes
// whole marker/chunk structures that are already self-delimiting in each
// format's own container, which is why no codec is needed at all.

export type ImageKind = "jpeg" | "png" | "webp";

export interface StripResult {
  bytes: Uint8Array;
  /** Which metadata segments/chunks were actually removed — for logging, never user-facing. */
  removed: string[];
  width: number | null;
  height: number | null;
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}
function readU32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
}
function readU32LE(buf: Uint8Array, offset: number): number {
  return (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
}
function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}
function asciiAt(buf: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(buf[offset + i]!);
  return s;
}

// ── JPEG ─────────────────────────────────────────────────────────────────
// SOI (0xFFD8) then a run of markers (0xFF, marker-byte, [u16 length incl.
// itself], [payload]) up to SOS (0xFFDA); everything from SOS onward
// (the header plus the entropy-coded scan data, which may itself contain
// 0xFF bytes stuffed with a following 0x00 — not real markers) is copied
// verbatim, since it is never metadata and must never be reparsed as one.
// APP1 (0xFFE1: EXIF, or XMP under the "http://ns.adobe.com/xap/1.0/" GUID),
// APP2 (0xFFE2: ICC profile, sometimes chunked) and APP13 (0xFFED:
// Photoshop IRB/IPTC) are the segments removed; APP0 (JFIF) and every
// non-APPn marker (DQT, DHT, SOF, DRI, …) are kept untouched.
const JPEG_STRIP_MARKERS = new Set([0xe1, 0xe2, 0xed]);
const JPEG_STANDALONE_MARKERS = new Set([0xd8, 0xd9, 0x01]); // SOI, EOI, TEM — no length field
function isRstMarker(marker: number): boolean {
  return marker >= 0xd0 && marker <= 0xd7;
}

function stripJpeg(buf: Uint8Array): StripResult {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error("not a JPEG: missing SOI");
  }
  const removed: string[] = [];
  const kept: Uint8Array[] = [buf.subarray(0, 2)]; // SOI
  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;

  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      // Malformed or already at scan data without a clean SOS handoff — copy the rest verbatim.
      kept.push(buf.subarray(offset));
      break;
    }
    const marker = buf[offset + 1]!;
    if (marker === 0xd9) {
      // EOI with nothing else — copy it and stop.
      kept.push(buf.subarray(offset, offset + 2));
      offset += 2;
      break;
    }
    if (JPEG_STANDALONE_MARKERS.has(marker) || isRstMarker(marker)) {
      kept.push(buf.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > buf.length) {
      kept.push(buf.subarray(offset));
      break;
    }
    const segmentLength = readU16BE(buf, offset + 2); // includes the 2 length bytes, excludes the marker
    const segmentEnd = offset + 2 + segmentLength;

    // SOF0..SOF3/SOF5..SOF15 carry width/height at a fixed offset (skip 1 precision byte).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = readU16BE(buf, offset + 5);
      width = readU16BE(buf, offset + 7);
    }

    if (JPEG_STRIP_MARKERS.has(marker)) {
      removed.push(`APP${(marker & 0x0f).toString()}`);
    } else {
      kept.push(buf.subarray(offset, segmentEnd));
    }

    if (marker === 0xda) {
      // Start Of Scan: this segment's header was already kept above; everything after it
      // (entropy-coded data, possibly more scans for progressive JPEGs) is copied as-is.
      kept.push(buf.subarray(segmentEnd));
      offset = buf.length;
      break;
    }
    offset = segmentEnd;
  }

  return { bytes: concat(kept), removed, width, height };
}

// ── PNG ──────────────────────────────────────────────────────────────────
// 8-byte signature, then a run of chunks: u32 length (payload only) + 4-byte
// ASCII type + payload + u32 CRC. Ancillary metadata chunks are simply
// omitted — every other chunk (critical: IHDR/PLTE/IDAT/IEND; visual
// ancillary: pHYs/gAMA/sRGB/bKGD/tRNS/…) is copied byte-for-byte, so its own
// CRC stays valid without recomputation.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIP_TYPES = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "iCCP"]);

function stripPng(buf: Uint8Array): StripResult {
  if (buf.length < 8 || !PNG_SIGNATURE.every((b, i) => buf[i] === b)) {
    throw new Error("not a PNG: bad signature");
  }
  const removed: string[] = [];
  const kept: Uint8Array[] = [buf.subarray(0, 8)];
  let offset = 8;
  let width: number | null = null;
  let height: number | null = null;

  while (offset + 8 <= buf.length) {
    const length = readU32BE(buf, offset);
    const type = asciiAt(buf, offset + 4, 4);
    const chunkEnd = offset + 12 + length; // length + type(4) + data(length) + crc(4)
    if (chunkEnd > buf.length) break; // truncated — stop rather than read past the buffer

    if (type === "IHDR") {
      width = readU32BE(buf, offset + 8);
      height = readU32BE(buf, offset + 12);
    }

    if (PNG_STRIP_TYPES.has(type)) {
      removed.push(type);
    } else {
      kept.push(buf.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return { bytes: concat(kept), removed, width, height };
}

// ── WebP ─────────────────────────────────────────────────────────────────
// 'RIFF' + u32 file size (little-endian, total size − 8) + 'WEBP', then a
// run of chunks: 4-byte FourCC + u32 size (little-endian) + payload, padded
// to an even byte count. 'EXIF' and 'XMP ' chunks are removed; the RIFF
// size field is rewritten to match (the one place this module edits a
// kept byte rather than only omitting spans, since WebP's outer size field
// would otherwise describe a file that no longer exists).
const WEBP_STRIP_FOURCC = new Set(["EXIF", "XMP "]);

function stripWebp(buf: Uint8Array): StripResult {
  if (buf.length < 12 || asciiAt(buf, 0, 4) !== "RIFF" || asciiAt(buf, 8, 4) !== "WEBP") {
    throw new Error("not a WebP: bad RIFF/WEBP header");
  }
  const removed: string[] = [];
  const kept: Uint8Array[] = [buf.subarray(0, 12)]; // RIFF + size (rewritten below) + WEBP
  let offset = 12;
  let width: number | null = null;
  let height: number | null = null;

  while (offset + 8 <= buf.length) {
    const fourCc = asciiAt(buf, offset, 4);
    const size = readU32LE(buf, offset + 4);
    const padded = size + (size % 2);
    const chunkEnd = offset + 8 + padded;
    if (chunkEnd > buf.length) break;

    if ((fourCc === "VP8 " || fourCc === "VP8L" || fourCc === "VP8X") && width === null) {
      const dims = readWebpDimensions(buf, offset, fourCc);
      if (dims) ({ width, height } = dims);
    }

    if (WEBP_STRIP_FOURCC.has(fourCc)) {
      removed.push(fourCc.trim());
    } else {
      kept.push(buf.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
  }

  const bytes = concat(kept);
  writeU32LE(bytes, 4, bytes.length - 8);
  return { bytes, removed, width, height };
}

function readWebpDimensions(buf: Uint8Array, chunkOffset: number, fourCc: string): { width: number; height: number } | null {
  const dataOffset = chunkOffset + 8;
  try {
    if (fourCc === "VP8X" && dataOffset + 10 <= buf.length) {
      // 24-bit little-endian width-minus-1 / height-minus-1 at a fixed offset.
      const w = (buf[dataOffset + 4]! | (buf[dataOffset + 5]! << 8) | (buf[dataOffset + 6]! << 16)) + 1;
      const h = (buf[dataOffset + 7]! | (buf[dataOffset + 8]! << 8) | (buf[dataOffset + 9]! << 16)) + 1;
      return { width: w, height: h };
    }
    if (fourCc === "VP8 " && dataOffset + 10 <= buf.length) {
      const w = readU16BE(buf, dataOffset + 6) & 0x3fff;
      const h = readU16BE(buf, dataOffset + 8) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  } catch {
    return null;
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Strips EXIF/XMP/ICC (and PNG's tIME/text chunks) from a JPEG, PNG or WebP buffer, byte-level,
 *  without decoding a single pixel (DEC-047). Throws on a buffer that does not start with the
 *  given kind's own container signature — callers sniff first (`sniffContent`) and never call
 *  this speculatively. */
export function stripImageMetadata(buf: Uint8Array, kind: ImageKind): StripResult {
  if (kind === "jpeg") return stripJpeg(buf);
  if (kind === "png") return stripPng(buf);
  return stripWebp(buf);
}

const EXIF_MARKERS = ["Exif\0\0", "http://ns.adobe.com/xap/", "Photoshop 3.0"];

/** The e2e/RLS-facing assertion REQ-EVT-011 names: "verified by a test asserting on the stored
 *  bytes." Scans for the byte signatures a surviving EXIF/XMP/IPTC block would leave, plus the
 *  PNG/WebP chunk type strings themselves — true means the buffer is clean. */
export function assertsNoExifRemains(buf: Uint8Array): boolean {
  const text = Buffer.from(buf.buffer, buf.byteOffset, buf.length).toString("latin1");
  if (EXIF_MARKERS.some((m) => text.includes(m))) return false;
  for (const type of PNG_STRIP_TYPES) if (text.includes(type)) return false;
  for (const fourCc of WEBP_STRIP_FOURCC) if (text.includes(fourCc)) return false;
  return true;
}
