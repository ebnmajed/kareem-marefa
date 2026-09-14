// A port of src/lib/storage/exif.ts's byte-level EXIF/XMP/ICC stripping —
// same reason worker/src/content/paths.ts exists (a separate TypeScript
// project with no import path back into `src/`, flagged to the lead as an
// open question, docs/plan/notes/content.md §3). Every function here MUST
// stay byte-for-byte identical to its src/lib/storage/exif.ts counterpart;
// tests/unit/storage-exif.test.ts imports both and asserts parity on the
// same fixtures.
//
// REQ-EVT-011 / DEC-047: this is the ONLY place the strip actually runs.
// process_photo.ts is the sole caller — the Route Handler (src/lib/dal/
// photos.ts) never reads the raw bytes back itself, because it cannot:
// `photos_storage_read` (03 §6, 0037) denies everyone, including the
// uploader, until a matching `public.photos` row exists, and that row
// cannot exist unstripped (`check (exif_stripped)`) — so the only process
// that can ever see the raw bytes is one holding `service_role`, which
// CLAUDE.md invariant 7 keeps off Vercel entirely. Also carries
// `sniffImageKind` — the worker's own DEC-009 gate (SVG rejected here too,
// not just in src/lib/storage/sniff.ts, since this is the only sniff a
// photo ever goes through).

export type ImageKind = "jpeg" | "png" | "webp";

export interface StripResult {
  bytes: Uint8Array;
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

const JPEG_STRIP_MARKERS = new Set([0xe1, 0xe2, 0xed]);
const JPEG_STANDALONE_MARKERS = new Set([0xd8, 0xd9, 0x01]);
function isRstMarker(marker: number): boolean {
  return marker >= 0xd0 && marker <= 0xd7;
}

function stripJpeg(buf: Uint8Array): StripResult {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error("not a JPEG: missing SOI");
  }
  const removed: string[] = [];
  const kept: Uint8Array[] = [buf.subarray(0, 2)];
  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;

  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      kept.push(buf.subarray(offset));
      break;
    }
    const marker = buf[offset + 1]!;
    if (marker === 0xd9) {
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
    const segmentLength = readU16BE(buf, offset + 2);
    const segmentEnd = offset + 2 + segmentLength;

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
      kept.push(buf.subarray(segmentEnd));
      offset = buf.length;
      break;
    }
    offset = segmentEnd;
  }

  return { bytes: concat(kept), removed, width, height };
}

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
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buf.length) break;

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

const WEBP_STRIP_FOURCC = new Set(["EXIF", "XMP "]);

function stripWebp(buf: Uint8Array): StripResult {
  if (buf.length < 12 || asciiAt(buf, 0, 4) !== "RIFF" || asciiAt(buf, 8, 4) !== "WEBP") {
    throw new Error("not a WebP: bad RIFF/WEBP header");
  }
  const removed: string[] = [];
  const kept: Uint8Array[] = [buf.subarray(0, 12)];
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

export function stripImageMetadata(buf: Uint8Array, kind: ImageKind): StripResult {
  if (kind === "jpeg") return stripJpeg(buf);
  if (kind === "png") return stripPng(buf);
  return stripWebp(buf);
}

const EXIF_MARKERS = ["Exif\0\0", "http://ns.adobe.com/xap/", "Photoshop 3.0"];

export function assertsNoExifRemains(buf: Uint8Array): boolean {
  const text = Buffer.from(buf.buffer, buf.byteOffset, buf.length).toString("latin1");
  if (EXIF_MARKERS.some((m) => text.includes(m))) return false;
  for (const type of PNG_STRIP_TYPES) if (text.includes(type)) return false;
  for (const fourCc of WEBP_STRIP_FOURCC) if (text.includes(fourCc)) return false;
  return true;
}

/** DEC-009 — "no SVG uploads, anywhere": this is the only sniff a photo
 *  passes through (the app-side src/lib/storage/sniff.ts never sees a
 *  photo's bytes, only the worker does — see this file's header). Looks at
 *  magic bytes only, first-checking for `<svg` the same way
 *  src/lib/storage/sniff.ts's `looksLikeSvg` does, so an SVG named `.jpg`
 *  or `.png` is rejected on content exactly like every other upload path. */
export function sniffImageKind(buf: Uint8Array): ImageKind | "svg" | "unknown" {
  const head = asciiAt(buf, 0, Math.min(buf.length, 4096)).toLowerCase();
  if (head.includes("<svg")) return "svg";
  if (buf.length >= 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b)) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (asciiAt(buf, 0, 4) === "RIFF" && asciiAt(buf, 8, 4) === "WEBP") return "webp";
  return "unknown";
}
