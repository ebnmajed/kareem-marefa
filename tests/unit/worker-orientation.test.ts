import { describe, expect, it } from "vitest";
import {
  orientationFilter,
  readJpegOrientation,
  swapsAxes,
  uprightFfmpegArgs,
  uprightJpeg,
  type Orientation,
} from "../../worker/src/content/orientation";

// REQ-EVT-011, REQ-STO-012 — a phone photograph's EXIF Orientation, read before exif.ts strips the APP1 that carries
// it, and the ffmpeg filter that turns its pixels upright. No binary here: what the worker hands ffmpeg is pinned,
// and the reader is driven over hand-built JPEG headers in both TIFF byte orders.

function u16(v: number, little: boolean): number[] {
  return little ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff];
}
function u32(v: number, little: boolean): number[] {
  const b = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return little ? b.reverse() : b;
}

/** A TIFF block: header, IFD0 with the given entries (tag, type, count, value as a SHORT), no next IFD. */
function tiff(little: boolean, entries: Array<{ tag: number; type?: number; count?: number; value: number }>): number[] {
  const out = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little), ...u32(8, little), ...u16(entries.length, little)];
  for (const e of entries) {
    out.push(...u16(e.tag, little), ...u16(e.type ?? 3, little), ...u32(e.count ?? 1, little), ...u16(e.value, little), 0, 0);
  }
  out.push(...u32(0, little));
  return out;
}

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0];
const JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const SOS = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9];

function jpeg(...segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SOS]);
}

describe("readJpegOrientation — before the strip throws the tag away", () => {
  for (const little of [true, false]) {
    const order = little ? "II (little-endian)" : "MM (big-endian)";
    it(`reads every value 1 – 8 in ${order}`, () => {
      for (let v = 1; v <= 8; v++) {
        expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(little, [{ tag: 0x0112, value: v }])])))).toBe(v);
      }
    });
    it(`finds the tag among other IFD0 entries in ${order}, after a JFIF APP0`, () => {
      const app1 = segment(0xe1, [
        ...EXIF,
        ...tiff(little, [
          { tag: 0x010f, type: 2, count: 4, value: 0 },
          { tag: 0x0110, type: 2, count: 4, value: 0 },
          { tag: 0x0112, value: 6 },
        ]),
      ]);
      expect(readJpegOrientation(jpeg(JFIF, app1))).toBe(6);
    });
  }

  it("is 1 when the IFD carries no Orientation tag", () => {
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x010f, value: 0 }])])))).toBe(1);
  });
  it("is 1 when there is no APP1, or the APP1 is XMP rather than Exif", () => {
    expect(readJpegOrientation(jpeg(JFIF))).toBe(1);
    const xmp = [..."http://ns.adobe.com/xap/1.0/\0"].map((c) => c.charCodeAt(0));
    expect(readJpegOrientation(jpeg(segment(0xe1, xmp)))).toBe(1);
  });
  it("is 1 for anything malformed — a wrong guess would turn an upright photograph", () => {
    // Not a JPEG at all.
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array([]))).toBe(1);
    // A byte order that is neither II nor MM.
    const badOrder = tiff(true, [{ tag: 0x0112, value: 6 }]);
    badOrder[0] = 0x58;
    badOrder[1] = 0x58;
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...badOrder])))).toBe(1);
    // The TIFF magic is not 42.
    const badMagic = tiff(false, [{ tag: 0x0112, value: 6 }]);
    badMagic[3] = 43;
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...badMagic])))).toBe(1);
    // The IFD's entry count runs past the segment.
    const truncated = tiff(true, [{ tag: 0x0112, value: 6 }]).slice(0, 14);
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...truncated])))).toBe(1);
    // The IFD0 offset points outside the block.
    const farIfd = tiff(true, [{ tag: 0x0112, value: 6 }]);
    farIfd.splice(4, 4, ...u32(0xffff, true));
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...farIfd])))).toBe(1);
    // Out of range, the wrong type, the wrong count.
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x0112, value: 9 }])])))).toBe(1);
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x0112, value: 0 }])])))).toBe(1);
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x0112, type: 4, value: 6 }])])))).toBe(1);
    expect(readJpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x0112, count: 2, value: 6 }])])))).toBe(1);
    // A segment length that runs past the file.
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00, ...EXIF]))).toBe(1);
  });
  it("stops at the start of scan — a tag-shaped run of entropy-coded bytes is never read", () => {
    const app1AfterScan = new Uint8Array([0xff, 0xd8, ...SOS.slice(0, -2), ...segment(0xe1, [...EXIF, ...tiff(true, [{ tag: 0x0112, value: 6 }])])]);
    expect(readJpegOrientation(app1AfterScan)).toBe(1);
  });
});

describe("orientationFilter — the turn each orientation needs", () => {
  it("maps the eight orientations as jpegtran and every viewer do", () => {
    const table: Record<Orientation, string | null> = {
      1: null,
      2: "hflip",
      3: "hflip,vflip",
      4: "vflip",
      5: "transpose=0",
      6: "transpose=1",
      7: "transpose=3",
      8: "transpose=2",
    };
    for (const [o, f] of Object.entries(table)) expect(orientationFilter(Number(o) as Orientation)).toBe(f);
  });
  it("swaps width and height for the quarter turns only (5 – 8)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((o) => swapsAxes(o as Orientation))).toEqual([false, false, false, false, true, true, true, true]);
  });
});

describe("uprightFfmpegArgs — one frame, no metadata", () => {
  const args = uprightFfmpegArgs("/tmp/x/source.jpg", "/tmp/x/upright.jpg", "transpose=1");
  it("pins the demuxer and the file protocol, as the story-video arguments do", () => {
    expect(args.join(" ")).toContain("-protocol_whitelist file -f image2 -i /tmp/x/source.jpg");
  });
  it("applies the filter, writes one frame at high quality, and drops every piece of metadata", () => {
    expect(args.join(" ")).toContain("-vf transpose=1");
    expect(args.join(" ")).toContain("-frames:v 1");
    expect(args.join(" ")).toContain("-q:v 2");
    expect(args.join(" ")).toContain("-map_metadata -1");
    expect(args.at(-1)).toBe("/tmp/x/upright.jpg");
  });
});

describe("uprightJpeg", () => {
  it("does nothing for orientation 1 — no process is started", async () => {
    expect(await uprightJpeg(jpeg(JFIF), 1)).toBeNull();
  });
});
