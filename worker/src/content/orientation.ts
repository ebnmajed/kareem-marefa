import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withTempDir } from "./pdf.js";
import { assertsNoExifRemains, sniffImageKind, stripImageMetadata } from "./exif.js";
import { runTool } from "./video.js";

// A phone photograph's EXIF Orientation, honoured BEFORE it is thrown away (REQ-EVT-011, REQ-STO-012).
//
// A phone writes the sensor's pixels as they came off the sensor and records how to turn them in EXIF tag 0x0112.
// exif.ts strips the whole APP1 — GPS with it, which is the point (REQ-EVT-011, DEC-047) — and so the tag that said
// «rotate me» goes too: the stored original, the `story` derivative cwebp makes from it, and the width and height the
// row records were all the sensor's, and every portrait photograph showed on its side.
//
// So the tag is READ from the raw bytes first, and when it is not 1 the STRIPPED bytes are turned upright with
// `ffmpeg` (Debian's, already in worker/Dockerfile for story videos — DEC-181, DEC-248 §6; no npm package touches
// media). The turned file is stripped again and checked, so no metadata survives the round trip either. A rotation
// that fails never blocks the album: the photograph keeps its stripped, unturned bytes, as before this file existed.
//
// ★ This file is the worker's own and has no counterpart in src/lib/storage/: exif.ts's byte-for-byte parity with
// src/lib/storage/exif.ts (tests/unit/storage-exif.test.ts) is untouched.

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;
const TYPE_SHORT = 3;
const ROTATE_TIMEOUT_MS = 30_000;

/** EXIF Orientation from a JPEG's APP1, in either TIFF byte order. 1 — «as stored» — when there is no APP1, no
 *  TIFF header, no tag, or anything malformed or out of range: a wrong guess would turn an upright photograph. */
export function readJpegOrientation(buf: Uint8Array): Orientation {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return 1;
    const marker = buf[offset + 1]!;
    // Fill bytes, standalone markers and restart markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan or end of image: the metadata segments are all before it.
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = (buf[offset + 2]! << 8) | buf[offset + 3]!;
    if (length < 2) return 1;
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + length;
    if (segmentEnd > buf.length) return 1;
    if (marker === 0xe1 && isExifHeader(buf, segmentStart)) {
      return orientationFromTiff(buf.subarray(segmentStart + 6, segmentEnd));
    }
    offset = segmentEnd;
  }
  return 1;
}

function isExifHeader(buf: Uint8Array, at: number): boolean {
  // "Exif\0\0"
  return (
    at + 6 <= buf.length &&
    buf[at] === 0x45 &&
    buf[at + 1] === 0x78 &&
    buf[at + 2] === 0x69 &&
    buf[at + 3] === 0x66 &&
    buf[at + 4] === 0 &&
    buf[at + 5] === 0
  );
}

function orientationFromTiff(tiff: Uint8Array): Orientation {
  if (tiff.length < 8) return 1;
  let little: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) little = true; // "II"
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) little = false; // "MM"
  else return 1;
  const u16 = (at: number) => (little ? tiff[at]! | (tiff[at + 1]! << 8) : (tiff[at]! << 8) | tiff[at + 1]!);
  const u32 = (at: number) =>
    (little
      ? tiff[at]! | (tiff[at + 1]! << 8) | (tiff[at + 2]! << 16) | (tiff[at + 3]! << 24)
      : (tiff[at]! << 24) | (tiff[at + 1]! << 16) | (tiff[at + 2]! << 8) | tiff[at + 3]!) >>> 0;
  if (u16(2) !== 42) return 1;
  const ifd0 = u32(4);
  if (ifd0 < 8 || ifd0 + 2 > tiff.length) return 1;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) return 1;
    if (u16(entry) !== ORIENTATION_TAG) continue;
    if (u16(entry + 2) !== TYPE_SHORT || u32(entry + 4) !== 1) return 1;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? (value as Orientation) : 1;
  }
  return 1;
}

/** The ffmpeg filter that turns an orientation's stored pixels upright, or null for 1. `transpose=0` is the
 *  main-diagonal flip (EXIF 5), `1` a quarter turn clockwise (6), `2` anticlockwise (8), `3` the anti-diagonal
 *  flip (7) — the same table libjpeg-turbo's `jpegtran` and every image viewer use. */
export function orientationFilter(orientation: Orientation): string | null {
  switch (orientation) {
    case 1:
      return null;
    case 2:
      return "hflip";
    case 3:
      return "hflip,vflip";
    case 4:
      return "vflip";
    case 5:
      return "transpose=0";
    case 6:
      return "transpose=1";
    case 7:
      return "transpose=3";
    case 8:
      return "transpose=2";
  }
}

/** Orientations 5 – 8 turn the picture a quarter: what was its width is its height. */
export function swapsAxes(orientation: Orientation): boolean {
  return orientation >= 5;
}

/** One JPEG frame in, one JPEG frame out, no metadata of any kind, at high quality. `-f image2` with the file
 *  protocol only, as the story-video arguments pin their demuxer: the input is a stranger's bytes. */
export function uprightFfmpegArgs(input: string, output: string, filter: string): string[] {
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-protocol_whitelist", "file",
    "-f", "image2",
    "-i", input,
    "-vf", filter,
    "-frames:v", "1",
    "-q:v", "2",
    "-map_metadata", "-1",
    "-fflags", "+bitexact", "-flags:v", "+bitexact",
    "-f", "image2", "-c:v", "mjpeg",
    output,
  ];
}

export interface Upright {
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
}

/** The stripped JPEG turned upright, or null when it needs no turn or the turn failed — the caller then keeps the
 *  stripped bytes as they are. The result is stripped again and must pass `assertsNoExifRemains`. */
export async function uprightJpeg(stripped: Uint8Array, orientation: Orientation): Promise<Upright | null> {
  const filter = orientationFilter(orientation);
  if (!filter) return null;
  try {
    return await withTempDir("photo-upright-", async (dir) => {
      const input = join(dir, "source.jpg");
      const output = join(dir, "upright.jpg");
      await writeFile(input, stripped);
      await runTool("ffmpeg", uprightFfmpegArgs(input, output, filter), ROTATE_TIMEOUT_MS);
      const turned = new Uint8Array(await readFile(output));
      if (sniffImageKind(turned) !== "jpeg") return null;
      const clean = stripImageMetadata(turned, "jpeg");
      if (!assertsNoExifRemains(clean.bytes)) return null;
      return { bytes: clean.bytes, width: clean.width, height: clean.height };
    });
  } catch {
    return null;
  }
}
