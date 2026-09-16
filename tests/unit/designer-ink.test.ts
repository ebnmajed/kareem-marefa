// The blank-capture guard — DEC-024, and why DEC-125 would have voided it.
//
// `inkedRatio` runs INSIDE a browser page (`page.evaluate`), so it is written
// self-contained and uses `Image` and a 2d canvas. Node has neither, so this
// file stands both in with the smallest fakes that hand the probe real pixel
// arrays: the code under test is the exact function the worker ships to
// Chromium, not a copy of its loop. The real-browser half is the parity
// harness's `ink-on-dark` case.
//
// ★ The property that matters: on a DARK page, a capture whose layers never
// painted must read as blank. Measured against white, every navy pixel is
// «ink» and a blank dark poster reads 100% inked.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inkedRatio, INK_REFERENCE_CSS } from "@kareem/designer-runtime";

interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const registry = new Map<string, Raster>();
let counter = 0;

/** Registers pixels under a fake base64 key the fake `Image` resolves. */
function png(raster: Raster): string {
  const key = `fake-${counter++}`;
  registry.set(key, raster);
  return key;
}

const WIDTH = 60;
const HEIGHT = 40;

/** DEC-127's poster background, `#111a2c` → `#1d2a42`, interpolated along
 *  the diagonal — close enough to a real gradient that no two neighbouring
 *  pixels are equal, which is what defeats a naive «same as the corner» check. */
function darkGradient(): Raster {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const from = [0x11, 0x1a, 0x2c];
  const to = [0x1d, 0x2a, 0x42];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = (x / (WIDTH - 1) + y / (HEIGHT - 1)) / 2;
      const i = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(from[c]! + (to[c]! - from[c]!) * t);
      data[i + 3] = 255;
    }
  }
  return { width: WIDTH, height: HEIGHT, data };
}

/** The same page with a white «title» painted over a block of it. */
function withText(background: Raster, pixels: number): Raster {
  const data = new Uint8ClampedArray(background.data);
  for (let p = 0; p < pixels; p++) {
    data[p * 4] = 255;
    data[p * 4 + 1] = 255;
    data[p * 4 + 2] = 255;
  }
  return { ...background, data };
}

function shifted(background: Raster, by: number): Raster {
  const data = new Uint8ClampedArray(background.data);
  for (let i = 0; i < data.length; i += 4) data[i] = Math.min(255, data[i]! + by);
  return { ...background, data };
}

beforeEach(() => {
  class FakeImage {
    width = 0;
    height = 0;
    raster: Raster | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      const raster = registry.get(value.replace("data:image/png;base64,", ""));
      queueMicrotask(() => {
        if (!raster) return this.onerror?.();
        this.raster = raster;
        this.width = raster.width;
        this.height = raster.height;
        this.onload?.();
      });
    }
  }
  const fakeDocument = {
    createElement: () => {
      let drawn: FakeImage | null = null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (img: FakeImage) => {
            drawn = img;
          },
          getImageData: () => ({ data: drawn!.raster!.data }),
        }),
      };
    },
  };
  Object.assign(globalThis, { Image: FakeImage, document: fakeDocument });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Image;
  delete (globalThis as Record<string, unknown>).document;
  registry.clear();
});

describe("inkedRatio — ink is what differs from the page's own background", () => {
  it("★ a dark gradient page whose layers never painted reads BLANK against its reference", async () => {
    const background = darkGradient();
    const ratio = await inkedRatio({ capture: png(background), reference: png(background) });
    expect(ratio).toBe(0);
    // 0.1% is the worker's floor (variant.ts MIN_INK_RATIO); blank is below it.
    expect(ratio).toBeLessThan(0.001);
  });

  it("★ the same dark page with its text painted reads as inked", async () => {
    const background = darkGradient();
    const ratio = await inkedRatio({ capture: png(withText(background, 120)), reference: png(background) });
    expect(ratio).toBeCloseTo(120 / (WIDTH * HEIGHT), 6);
    expect(ratio).toBeGreaterThan(0.001);
  });

  it("the defect being fixed: measured against WHITE, a blank dark page is 100% «ink»", async () => {
    const background = darkGradient();
    expect(await inkedRatio({ capture: png(background) })).toBe(1);
    expect(await inkedRatio({ capture: png(background), reference: null })).toBe(1);
  });

  it("the tolerance is Tier B's own: a channel 2/255 off is antialiasing, 3/255 is ink", async () => {
    const background = darkGradient();
    expect(await inkedRatio({ capture: png(shifted(background, 2)), reference: png(background) })).toBe(0);
    expect(await inkedRatio({ capture: png(shifted(background, 3)), reference: png(background) })).toBe(1);
  });

  it("a white page with no reference still measures as it always did", async () => {
    const white: Raster = { width: WIDTH, height: HEIGHT, data: new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255) };
    expect(await inkedRatio({ capture: png(white) })).toBe(0);
  });

  it("refuses a reference of a different size rather than comparing misaligned pixels", async () => {
    const background = darkGradient();
    const small: Raster = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
    await expect(inkedRatio({ capture: png(background), reference: png(small) })).rejects.toThrow(/not the size/);
  });

  it("the reference hides layers with visibility, never display — the layout must not move", () => {
    expect(INK_REFERENCE_CSS).toContain("visibility:hidden");
    expect(INK_REFERENCE_CSS).not.toContain("display");
    expect(INK_REFERENCE_CSS.startsWith(".dr-layer")).toBe(true);
  });
});
