import { deflateSync } from "node:zlib";
import type { QrMatrix } from "@kareem/designer-runtime";

// A QR matrix as a 1-bit greyscale PNG — the one image format every mail client
// draws (wave 23, `REQ-NTF-015`).
//
// ★ WHY PNG AND WHY HERE. The certificate's QR is inline SVG, because it is our
// own markup rendered by our own Chromium (`qr.ts`'s header). A MAIL cannot do
// that: Gmail strips SVG, Outlook's Word engine draws nothing, and invariant 11
// keeps SVG out of every image a client fetches. So the mail's QR is a raster
// — written by hand on `node:zlib`, because `sharp` and a QR or PNG package
// would each be a dependency for ~50 lines of a format the specification fixes.
//
// The format, in the order the file holds it: the signature; IHDR (width,
// height, bit depth 1, colour type 0 = greyscale); IDAT (each scanline a
// filter byte 0 and the row's bits, 1 = white, deflated); IEND. Every chunk is
// length · type · data · CRC-32 over type and data.

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * The PNG for one matrix: `scale` pixels per module and a quiet zone of
 * `quiet` modules on every side — four is the specification's minimum, and a
 * thin quiet zone is a QR that scans on one phone and not another.
 */
export function qrPng(matrix: QrMatrix, scale = 8, quiet = 4): Uint8Array {
  const modules = matrix.size + quiet * 2;
  const side = modules * scale;
  const stride = Math.ceil(side / 8);
  const raw = new Uint8Array((stride + 1) * side);

  for (let y = 0; y < side; y++) {
    const my = Math.floor(y / scale) - quiet;
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const inside = mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size;
      const dark = inside && matrix.dark[my * matrix.size + mx] === true;
      // Bit set = white in a 1-bit greyscale image.
      if (!dark) raw[rowStart + 1 + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // greyscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
