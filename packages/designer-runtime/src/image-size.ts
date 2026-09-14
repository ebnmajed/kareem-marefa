/**
 * Intrinsic image dimensions, from the bytes — REQ-DSG-019, REQ-DSG-020.
 *
 * Needed by two rules that both only work on the REAL pixel count: the PPI
 * guard (is this logo big enough for an A3 frame?) and the uploaded poster's
 * 1080-px minimum on the short side (A32).
 *
 * Hand-written headers rather than an image library, for the same reason the
 * content sniffer is: this package has no dependencies, and the worker image
 * and the parity harness both import it. Three formats, because three are
 * all that exist here — PNG, JPEG and WebP (DEC-009 dropped SVG, and the
 * sniffer rejects everything else before these bytes are read).
 */

export type ImageKind = 'png' | 'jpeg' | 'webp'

export interface ImageSize {
  kind: ImageKind
  width: number
  height: number
}

const be16 = (b: Uint8Array, at: number) => ((b[at] as number) << 8) | (b[at + 1] as number)
const be32 = (b: Uint8Array, at: number) =>
  (((b[at] as number) << 24) | ((b[at + 1] as number) << 16) | ((b[at + 2] as number) << 8) | (b[at + 3] as number)) >>> 0
const le16 = (b: Uint8Array, at: number) => (b[at] as number) | ((b[at + 1] as number) << 8)
const le24 = (b: Uint8Array, at: number) => (b[at] as number) | ((b[at + 1] as number) << 8) | ((b[at + 2] as number) << 16)
const ascii = (b: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...Array.from(b.subarray(at, at + len)))

function png(b: Uint8Array): ImageSize | null {
  // 8-byte signature, then an IHDR chunk whose data starts at 16.
  if (b.length < 24) return null
  if (ascii(b, 12, 4) !== 'IHDR') return null
  return { kind: 'png', width: be32(b, 16), height: be32(b, 20) }
}

function jpeg(b: Uint8Array): ImageSize | null {
  // Walk the segment chain to the first SOF. A JPEG's dimensions are not at
  // a fixed offset: EXIF, ICC and comment segments come first, and their
  // sizes vary with the camera that wrote them.
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) {
      at++ // fill byte or padding; resync rather than give up
      continue
    }
    const marker = b[at + 1] as number
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    const length = be16(b, at + 2)
    // SOF0…SOF15, excluding the four that are not frame headers.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { kind: 'jpeg', height: be16(b, at + 5), width: be16(b, at + 7) }
    if (length < 2) return null
    at += 2 + length
  }
  return null
}

function webp(b: Uint8Array): ImageSize | null {
  // RIFF container; the fourth chunk tag says which of the three WebP
  // encodings this is, and each stores its size differently.
  if (b.length < 30) return null
  const tag = ascii(b, 12, 4)
  if (tag === 'VP8 ') {
    // Lossy: a 3-byte start code, then 14-bit width and height.
    return { kind: 'webp', width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  }
  if (tag === 'VP8L') {
    // Lossless: 14 bits each, packed across four bytes after the signature.
    const bits = le32(b, 21)
    return { kind: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (tag === 'VP8X') {
    // Extended: 24-bit canvas size minus one.
    return { kind: 'webp', width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
  }
  return null
}

const le32 = (b: Uint8Array, at: number) =>
  ((b[at] as number) | ((b[at + 1] as number) << 8) | ((b[at + 2] as number) << 16) | ((b[at + 3] as number) << 24)) >>> 0

/** `null` when the bytes are not one of the three accepted formats, or are
 *  truncated. A caller treats that as a rejection, never as "assume big
 *  enough" — the PPI guard exists precisely because nobody checks by eye. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 16) return null
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return png(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes)
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webp(bytes)
  return null
}
