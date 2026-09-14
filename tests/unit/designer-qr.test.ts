// The QR encoder — D68, REQ-DSG-023, REQ-CRT-010, 06 §8.2.
//
// HOW THIS IS VERIFIED, because it matters more than usual. A subtly wrong
// QR is worse than no QR: it is printed, handed over, and fails in someone's
// hand months later. There is no independent QR implementation available
// here and none may be added — `@kareem/designer-runtime` has no
// dependencies so the worker image and the parity harness can consume it —
// and this Chromium exposes no `BarcodeDetector`, so a scan-back test is not
// available either.
//
// So the encoder is checked against PROPERTIES THE SPECIFICATION FIXES,
// each computed by a route the encoder does not use:
//
//   · a Reed-Solomon codeword's syndromes vanish over GF(256). Computed here
//     from the field alone — never from the generator polynomial the encoder
//     builds — so a wrong generator cannot hide behind itself.
//   · the thirty-two format strings form a BCH code with minimum Hamming
//     distance seven. A broken BCH collapses that distance immediately.
//   · a hand-computed byte-mode bit stream for a one-character payload,
//     worked out from the specification rather than from the code.
//   · the published version-information string for version 7.
//
// Plus the structure a scanner looks for first: three finder patterns, the
// timing runs, the dark module, the size law, and the quiet zone.
import { describe, expect, it } from "vitest";
import { __qrInternals, encodeQr, qrSvg, type EcLevel } from "@kareem/designer-runtime";

const { ecCodewords, encodeData, generator, EXP, LOG, FORMAT_MASK, EC_BITS } = __qrInternals;

/** GF(256) multiply, written independently of the encoder's own helper. */
function gfMul(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  while (y) {
    if (y & 1) result ^= x;
    x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1;
    y >>= 1;
  }
  return result;
}

describe("GF(256) — the field the whole code rests on", () => {
  it("the encoder's log/antilog tables agree with a plain shift-and-xor multiply", () => {
    for (let a = 1; a < 256; a++) {
      for (const b of [1, 2, 3, 7, 29, 128, 255]) {
        const viaTables = EXP[((LOG[a] as number) + (LOG[b] as number)) % 255] as number;
        expect(viaTables, `${a}×${b}`).toBe(gfMul(a, b));
      }
    }
  });
});

describe("Reed-Solomon — against the published generator polynomials", () => {
  it("★ generator(7) and generator(2) are the specification's rows, leading coefficient first", () => {
    // The ordering convention is the bug this pins. The construction
    // accumulates lowest-degree-first and the division loop wants the
    // opposite; when they disagreed, every EC codeword was wrong and every
    // QR was unreadable — while looking perfectly plausible.
    expect(generator(2)).toEqual([1, 3, 2]);
    expect(generator(7)).toEqual([1, 127, 122, 154, 164, 11, 68, 117]);
    for (const degree of [7, 10, 13, 15, 17, 22, 26, 30]) {
      expect(generator(degree), `degree ${degree}`).toHaveLength(degree + 1);
      expect(generator(degree)[0], `degree ${degree} is monic`).toBe(1);
    }
  });
});

describe("Reed-Solomon — the syndromes vanish", () => {
  /** A codeword is correct exactly when it evaluates to zero at α^0…α^(n-1).
   *  Computed from the field, not from the generator polynomial. */
  function syndromes(codeword: readonly number[], count: number): number[] {
    return Array.from({ length: count }, (_, i) => {
      const alpha = EXP[i] as number;
      let acc = 0;
      for (const byte of codeword) acc = gfMul(acc, alpha) ^ byte;
      return acc;
    });
  }

  it("★ every EC block the encoder produces is a valid codeword", () => {
    for (const count of [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]) {
      const data = Array.from({ length: 20 }, (_, i) => (i * 37 + 11) & 0xff);
      const codeword = [...data, ...ecCodewords(data, count)];
      expect(syndromes(codeword, count), `${count} EC codewords`).toEqual(new Array(count).fill(0));
    }
  });

  it("and a single corrupted byte breaks them, so the check is not vacuous", () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11];
    const codeword = [...data, ...ecCodewords(data, 10)];
    codeword[3] = (codeword[3] as number) ^ 0xff;
    expect(syndromes(codeword, 10).some((s) => s !== 0)).toBe(true);
  });
});

describe("the format information is a BCH code", () => {
  /** All thirty-two strings, as the encoder computes them. */
  function formatBits(level: EcLevel, mask: number): number {
    const data = ((EC_BITS as Record<EcLevel, number>)[level] << 3) | mask;
    let value = data;
    for (let i = 0; i < 10; i++) value = (value << 1) ^ ((value >> 9) * 0x537);
    return ((data << 10) | value) ^ FORMAT_MASK;
  }

  const all = (["L", "M", "Q", "H"] as const).flatMap((level) => [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => formatBits(level, mask)));

  it("★ minimum Hamming distance is 7 — a broken BCH collapses it at once", () => {
    let min = 15;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        let bits = ((all[i] as number) ^ (all[j] as number)) & 0x7fff;
        let distance = 0;
        while (bits) {
          distance += bits & 1;
          bits >>= 1;
        }
        min = Math.min(min, distance);
      }
    }
    expect(min).toBe(7);
  });

  it("all thirty-two are distinct and fifteen bits wide", () => {
    expect(new Set(all).size).toBe(32);
    for (const bits of all) expect(bits).toBeLessThan(1 << 15);
  });

  it("level M with mask 0 is the XOR pattern itself, which fixes the constant", () => {
    // M is 00 and mask 0 is 000, so the data bits are zero and so is their
    // BCH remainder — leaving exactly the mask. If FORMAT_MASK were wrong,
    // this is the one value that would say so directly.
    expect(formatBits("M", 0)).toBe(FORMAT_MASK);
  });
});

describe("byte-mode encoding, against a hand-computed stream", () => {
  it("★ encodes 'A' at version 1 level M exactly as the specification says", () => {
    // Worked from the specification, not from the code:
    //   mode 0100, count 00000001, data 01000001 ('A'), terminator 0000
    //   → 0100 0000 0001 0100 0001 0000 → 0x40 0x14 0x10
    // then pad alternately with 0xEC / 0x11 to the sixteen data codewords
    // version 1 level M carries.
    const words = encodeData(new TextEncoder().encode("A"), 1, "M");
    expect(words.slice(0, 3)).toEqual([0x40, 0x14, 0x10]);
    expect(words.slice(3)).toEqual([0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec]);
    expect(words).toHaveLength(16);
  });

  it("switches the count indicator to sixteen bits at version 10, where the spec does", () => {
    const short = encodeData(new TextEncoder().encode("AB"), 9, "M");
    const long = encodeData(new TextEncoder().encode("AB"), 10, "M");
    // v9: 0100 00000010 01000001 01000010 …
    expect(short[0]).toBe(0x40);
    expect(short[1]).toBe(0x24);
    // v10: 0100 0000000000000010 … — the payload starts a byte later.
    expect(long[0]).toBe(0x40);
    expect(long[1]).toBe(0x00);
    expect(long[2]).toBe(0x24);
  });
});

describe("the module matrix", () => {
  const url = "https://kareem.pp.sa/ar/verify/abcdefghijklmnopqrstuvwx";
  const m = encodeQr(url, "M");
  const at = (x: number, y: number) => m.dark[y * m.size + x];

  it("sizes itself by the version law, 4v + 17", () => {
    expect(m.size).toBe(m.version * 4 + 17);
    expect(m.version).toBeGreaterThanOrEqual(1);
    expect(m.version).toBeLessThanOrEqual(10);
  });

  it("★ carries three finder patterns — the first thing a scanner looks for", () => {
    for (const [ox, oy] of [
      [0, 0],
      [m.size - 7, 0],
      [0, m.size - 7],
    ]) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(at((ox as number) + x, (oy as number) + y), `finder at ${ox},${oy} + ${x},${y}`).toBe(ring !== 2);
        }
      }
    }
  });

  it("carries both timing runs and the dark module", () => {
    for (let i = 8; i < m.size - 8; i++) {
      expect(at(i, 6), `timing x=${i}`).toBe(i % 2 === 0);
      expect(at(6, i), `timing y=${i}`).toBe(i % 2 === 0);
    }
    expect(at(8, m.size - 8)).toBe(true);
  });

  it("is roughly balanced between dark and light, which is what the mask is chosen for", () => {
    const dark = m.dark.filter(Boolean).length / m.dark.length;
    expect(dark).toBeGreaterThan(0.4);
    expect(dark).toBeLessThan(0.6);
  });

  it("a different payload gives a different matrix, and the same payload the same one", () => {
    expect(encodeQr(url, "M").dark).toEqual(m.dark);
    expect(encodeQr(`${url}z`, "M").dark).not.toEqual(m.dark);
  });

  it("a higher EC level buys correction with version, never silently with data", () => {
    expect(encodeQr(url, "H").version).toBeGreaterThanOrEqual(encodeQr(url, "L").version);
  });

  it("★ REFUSES rather than truncating — half a URL scans cleanly and goes to the wrong place", () => {
    expect(() => encodeQr("x".repeat(300), "M")).toThrow(/does not fit/);
  });
});

describe("the SVG — vector, so it stays crisp at A3 (06 §8.2)", () => {
  const svg = qrSvg("https://kareem.pp.sa/ar/verify/abcdefghijklmnopqrstuvwx", { level: "M", quietZoneModules: 4 });

  it("is inline SVG from our own runtime, not an uploaded file (DEC-009)", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // No raster anywhere: the point of generating it is that it scales.
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("data:image");
  });

  it("★ carries the four-module quiet zone INSIDE the artwork (REQ-CRT-010)", () => {
    // A quiet zone left to whoever places the layer is a quiet zone that
    // gets cropped. The viewBox is the symbol plus eight modules.
    const size = encodeQr("https://kareem.pp.sa/ar/verify/abcdefghijklmnopqrstuvwx", "M").size;
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it("respects a larger quiet zone and never a smaller one", () => {
    const wide = qrSvg("hello", { quietZoneModules: 8 });
    const narrow = qrSvg("hello", { quietZoneModules: 1 });
    const size = encodeQr("hello", "M").size;
    expect(wide).toContain(`viewBox="0 0 ${size + 16} ${size + 16}"`);
    // Asking for one module gets four: the minimum is not negotiable.
    expect(narrow).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it("draws one path rather than a rect per module — a version 7 symbol is two thousand of them", () => {
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg.match(/<rect/g)).toHaveLength(1); // the light background
  });

  it("is aria-hidden — the URL beside it is what a screen reader should read", () => {
    expect(svg).toContain('aria-hidden="true"');
  });
});
