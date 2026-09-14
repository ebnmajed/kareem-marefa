/**
 * QR encoding — D68, REQ-DSG-023, REQ-CRT-010, 06 §8.2.
 *
 * «The QR is emitted as inline SVG by OUR OWN RUNTIME, which is why it stays
 * vector and crisp at A3 despite DEC-009's no-SVG-upload rule. That rule is
 * about UPLOADED files; generated markup from our own code is a different
 * thing entirely, and saying so prevents a future session from
 * "consistently" rasterising the QR and softening it at print size.»
 *
 * Written here rather than taken from a package for the reason every other
 * file in this package is: it has no dependencies, and it is consumed by the
 * app, the worker image and the parity harness. A QR library would be a
 * dependency in the one place a dependency costs the most.
 *
 * BYTE MODE ONLY, VERSIONS 1-10. Both QRs in the product encode an absolute
 * URL (a phone camera needs a URL, not raw text), and a URL is bytes. Ten
 * versions carry 213 bytes at level M, against the ~75 a session URL needs —
 * so the ceiling is far away, and refusing past it is better than silently
 * encoding something a scanner will not read.
 *
 * HOW CORRECTNESS IS ESTABLISHED, stated plainly because a wrong QR is worse
 * than no QR — it prints, it is handed over, and it fails in someone's hand
 * months later.
 *
 * There is no independent implementation available to diff against (none may
 * be added; this package has no dependencies) and this Chromium exposes no
 * `BarcodeDetector`, so a scan-back test is not available either. The tests
 * therefore check PROPERTIES THE SPECIFICATION FIXES, each by a route this
 * file does not use: Reed-Solomon syndromes vanishing over GF(256) computed
 * from the field alone, the published generator rows, the thirty-two format
 * strings forming a BCH code of minimum distance seven, and a hand-worked
 * byte-mode stream. That found two real bugs on the first run — a reversed
 * generator polynomial and a dark module cleared by its own reservation —
 * which is the argument for doing it this way.
 *
 * ★ STILL OWED: one scan with a real phone, on paper, at print size. Nothing
 * above substitutes for it, and it is an owner check at Launch alongside the
 * ICS-in-Outlook one (docs/plan/notes/designer.md §3).
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H'

/* ── GF(256), the field Reed-Solomon works in ───────────────────────────── */
// Primitive polynomial 0x11d, as the QR specification fixes it.
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : (EXP[((LOG[a] as number) + (LOG[b] as number)) % 255] as number))

/**
 * The generator polynomial for `degree` error-correction codewords,
 * HIGHEST DEGREE FIRST so `gen[0]` is the leading 1.
 *
 * The construction below accumulates lowest-degree-first, which is the
 * natural way to write it and the opposite of what the division loop wants.
 * Reversing here rather than there keeps one convention at the boundary:
 * `generator(7)` is [1, 127, 122, 154, 164, 11, 68, 117], which is the
 * published table's row, and a test asserts exactly that.
 */
function generator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] as number) ^ mul(poly[j] as number, EXP[i] as number)
      next[j + 1] = (next[j + 1] as number) ^ (poly[j] as number)
    }
    poly = next
  }
  return poly.reverse()
}

function ecCodewords(data: readonly number[], count: number): number[] {
  const gen = generator(count)
  const out = new Array<number>(count).fill(0)
  for (const byte of data) {
    const factor = byte ^ (out[0] as number)
    out.shift()
    out.push(0)
    for (let i = 0; i < count; i++) out[i] = (out[i] as number) ^ mul(gen[i + 1] as number, factor)
  }
  return out
}

/* ── capacity tables, versions 1-10 ─────────────────────────────────────── */
// [total codewords, [ecPerBlock, group1Blocks, group1Words, group2Blocks, group2Words]] per level.
type Spec = [number, number, number, number, number]
const SPECS: Record<EcLevel, Spec[]> = {
  L: [
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  ],
  Q: [
    [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20],
  ],
  H: [
    [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0], [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16],
  ],
}

/** Where the alignment patterns sit, per version (v1 has none). */
const ALIGNMENT: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]

const dataCapacity = (version: number, level: EcLevel): number => {
  const [, g1, w1, g2, w2] = SPECS[level][version - 1] as Spec
  return g1 * w1 + g2 * w2
}

/* ── bit stream ─────────────────────────────────────────────────────────── */
class Bits {
  readonly bits: number[] = []
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1)
  }
}

function encodeData(bytes: Uint8Array, version: number, level: EcLevel): number[] {
  const capacity = dataCapacity(version, level)
  const bits = new Bits()
  bits.push(0b0100, 4) // byte mode
  // The character-count indicator is 8 bits for byte mode below version 10
  // and 16 from version 10 up. Getting this wrong produces a QR that scans
  // as garbage rather than one that fails to scan.
  bits.push(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) bits.push(b, 8)

  const total = capacity * 8
  if (bits.bits.length > total) throw new Error('qr: data does not fit')
  // Terminator, up to four zero bits.
  for (let i = 0; i < 4 && bits.bits.length < total; i++) bits.bits.push(0)
  while (bits.bits.length % 8 !== 0) bits.bits.push(0)

  const words: number[] = []
  for (let i = 0; i < bits.bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits.bits[i + j] as number)
    words.push(byte)
  }
  // Pad bytes alternate 0xEC / 0x11, as the specification fixes them.
  const PAD = [0xec, 0x11]
  while (words.length < capacity) words.push(PAD[(words.length - bits.bits.length / 8) % 2] as number)
  return words
}

/** Data and EC codewords, interleaved block by block as the specification
 *  requires — a burst of damage then lands across many blocks rather than
 *  destroying one. */
function interleave(words: readonly number[], version: number, level: EcLevel): number[] {
  const [ec, g1, w1, g2, w2] = SPECS[level][version - 1] as Spec
  const blocks: number[][] = []
  let at = 0
  for (let i = 0; i < g1; i++) blocks.push(words.slice(at, (at += w1)))
  for (let i = 0; i < g2; i++) blocks.push(words.slice(at, (at += w2)))
  const ecBlocks = blocks.map((b) => ecCodewords(b, ec))

  const out: number[] = []
  const longest = Math.max(w1, w2)
  for (let i = 0; i < longest; i++) for (const block of blocks) if (i < block.length) out.push(block[i] as number)
  for (let i = 0; i < ec; i++) for (const block of ecBlocks) out.push(block[i] as number)
  return out
}

/* ── the module matrix ──────────────────────────────────────────────────── */
type Grid = { size: number; modules: Int8Array; reserved: Uint8Array }

const idx = (g: Grid, x: number, y: number) => y * g.size + x
const set = (g: Grid, x: number, y: number, dark: boolean, reserve = true) => {
  g.modules[idx(g, x, y)] = dark ? 1 : 0
  if (reserve) g.reserved[idx(g, x, y)] = 1
}

function placeFunctionPatterns(g: Grid, version: number): void {
  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x
        const py = oy + y
        if (px < 0 || py < 0 || px >= g.size || py >= g.size) continue
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
        set(g, px, py, ring !== 2 && ring <= 3)
      }
    }
  }
  finder(0, 0)
  finder(g.size - 7, 0)
  finder(0, g.size - 7)

  // Timing patterns.
  for (let i = 8; i < g.size - 8; i++) {
    set(g, i, 6, i % 2 === 0)
    set(g, 6, i, i % 2 === 0)
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = ALIGNMENT[version] ?? []
  for (const cy of centres) {
    for (const cx of centres) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === g.size - 7) || (cx === g.size - 7 && cy === 6)) continue
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(g, cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1)
    }
  }

  // Reserve the format-information areas: eight modules along the top-right
  // row and SEVEN down the bottom-left column. Seven, not eight — the eighth
  // position down that column is the dark module, and reserving it here is
  // what silently cleared it before the structural test caught it.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      set(g, i, 8, false)
      set(g, 8, i, false)
    }
  }
  for (let i = 0; i < 8; i++) set(g, g.size - 1 - i, 8, false)
  for (let i = 0; i < 7; i++) set(g, 8, g.size - 1 - i, false)

  // The dark module, always, and after the reservations that surround it.
  set(g, 8, g.size - 8, true)

  // Version information, version 7 and up.
  if (version >= 7) {
    let value = version
    for (let i = 0; i < 12; i++) value = (value << 1) ^ ((value >> 11) * 0x1f25)
    const bits = (version << 12) | value
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1
      set(g, Math.floor(i / 3), g.size - 11 + (i % 3), dark)
      set(g, g.size - 11 + (i % 3), Math.floor(i / 3), dark)
    }
  }
}

const FORMAT_MASK = 0b101010000010010
const EC_BITS: Record<EcLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }

function placeFormat(g: Grid, level: EcLevel, mask: number): void {
  const data = (EC_BITS[level] << 3) | mask
  let value = data
  for (let i = 0; i < 10; i++) value = (value << 1) ^ ((value >> 9) * 0x537)
  const bits = ((data << 10) | value) ^ FORMAT_MASK

  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1
    // Around the top-left finder.
    if (i < 6) set(g, 8, i, dark)
    else if (i < 8) set(g, 8, i + 1, dark)
    else if (i === 8) set(g, 7, 8, dark)
    else set(g, 14 - i, 8, dark)
    // The duplicate copy, so a damaged corner does not lose the format.
    if (i < 8) set(g, g.size - 1 - i, 8, dark)
    else set(g, 8, g.size - 15 + i, dark)
  }
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function placeData(g: Grid, codewords: readonly number[], mask: number): void {
  let bit = 0
  let upward = true
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // the vertical timing column is skipped entirely
    for (let step = 0; step < g.size; step++) {
      const y = upward ? g.size - 1 - step : step
      for (const x of [right, right - 1]) {
        if (g.reserved[idx(g, x, y)]) continue
        const byte = codewords[bit >> 3] ?? 0
        const dark = ((byte >> (7 - (bit & 7))) & 1) === 1
        set(g, x, y, dark !== (MASKS[mask] as (x: number, y: number) => boolean)(x, y), false)
        bit++
      }
    }
    upward = !upward
  }
}

/** The specification's four penalty rules. A scanner reads a badly masked
 *  symbol slowly or not at all, and the phone is held over a printed sheet. */
function penalty(g: Grid): number {
  const at = (x: number, y: number) => g.modules[idx(g, x, y)] === 1
  let score = 0

  for (let y = 0; y < g.size; y++) {
    for (const horizontal of [true, false]) {
      let run = 1
      for (let i = 1; i < g.size; i++) {
        const same = horizontal ? at(i, y) === at(i - 1, y) : at(y, i) === at(y, i - 1)
        if (same) run++
        else {
          if (run >= 5) score += run - 2
          run = 1
        }
      }
      if (run >= 5) score += run - 2
    }
  }

  for (let y = 0; y < g.size - 1; y++) {
    for (let x = 0; x < g.size - 1; x++) {
      const v = at(x, y)
      if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3
    }
  }

  const pattern = [true, false, true, true, true, false, true, false, false, false, false]
  const matches = (read: (i: number) => boolean, start: number) => pattern.every((p, i) => read(start + i) === p)
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x <= g.size - 11; x++) {
      if (matches((i) => at(i, y), x)) score += 40
      if (matches((i) => at(y, i), x)) score += 40
    }
  }

  let dark = 0
  for (let i = 0; i < g.modules.length; i++) if (g.modules[i] === 1) dark++
  score += Math.floor(Math.abs((dark * 100) / g.modules.length - 50) / 5) * 10
  return score
}

/**
 * Internals, exported ONLY so the encoder can be checked against the
 * specification rather than against itself.
 *
 * There is no independent QR implementation available here and none may be
 * added (this package has no dependencies, by design), so the tests verify
 * PROPERTIES the specification fixes: that a Reed-Solomon codeword's
 * syndromes vanish over GF(256) — computed from the field alone, never from
 * the generator polynomial this file uses — and that the thirty-two format
 * strings are a BCH code with minimum distance seven. An encoder checked
 * only against its own expectations is an encoder that agrees with itself.
 */
export const __qrInternals = { ecCodewords, encodeData, interleave, generator, EXP, LOG, FORMAT_MASK, EC_BITS }

export interface QrMatrix {
  /** Modules per side, excluding the quiet zone. */
  size: number
  /** Row-major, `true` is dark. */
  dark: boolean[]
  version: number
  level: EcLevel
}

/** The module matrix for a string. Throws rather than truncating: a QR that
 *  encodes half a URL scans cleanly and goes to the wrong place. */
export function encodeQr(text: string, level: EcLevel = 'M'): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  let version = 0
  for (let v = 1; v <= 10; v++) {
    // The count indicator grows at version 10, so the check is on the whole
    // stream rather than on the payload alone.
    const overhead = 4 + (v < 10 ? 8 : 16)
    if (bytes.length * 8 + overhead <= dataCapacity(v, level) * 8) {
      version = v
      break
    }
  }
  if (!version) throw new Error(`qr: ${bytes.length} bytes does not fit in version 10 at level ${level}`)

  const codewords = interleave(encodeData(bytes, version, level), version, level)
  const size = version * 4 + 17

  let best: Grid | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const g: Grid = { size, modules: new Int8Array(size * size), reserved: new Uint8Array(size * size) }
    placeFunctionPatterns(g, version)
    placeData(g, codewords, mask)
    placeFormat(g, level, mask)
    const score = penalty(g)
    if (score < bestScore) {
      bestScore = score
      best = g
    }
  }

  const grid = best as Grid
  return { size, version, level, dark: Array.from(grid.modules, (m) => m === 1) }
}

/**
 * The QR as inline SVG — vector, so it stays crisp at A3 (06 §8.2).
 *
 * One `<path>` of rectangles rather than one `<rect>` per module: a version-7
 * symbol is 45×45, and two thousand elements is a page a printer struggles
 * with for no benefit.
 *
 * The quiet zone is part of the SVG, not a margin someone has to remember.
 * REQ-CRT-010 requires four modules, and a QR with a thin quiet zone scans on
 * a screen and fails on paper — which is the only place a certificate QR is
 * ever used.
 */
export function qrSvg(text: string, options: { level?: EcLevel; quietZoneModules?: number; dark?: string; light?: string } = {}): string {
  const quiet = Math.max(4, options.quietZoneModules ?? 4)
  const matrix = encodeQr(text, options.level ?? 'M')
  const side = matrix.size + quiet * 2

  let path = ''
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.dark[y * matrix.size + x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`
    }
  }

  const light = options.light ?? '#ffffff'
  const dark = options.dark ?? '#000000'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" ` +
    `width="100%" height="100%" role="img" aria-hidden="true">` +
    `<rect width="${side}" height="${side}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  )
}
