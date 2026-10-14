// The capture's media helpers (REQ-STO-011, REQ-STO-016, DEC-248 §6): the recorder's container chosen by feature
// detection for an iOS-like and a Chrome-like browser, the container read from the bytes, a photograph's size.
import { describe, expect, it } from "vitest";
import { fitWithin, pickRecorderType, readHead, sniffVideoExt, videoExtFromName, videoExtFromType } from "@/components/stories/media";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("pickRecorderType — feature-detected, never guessed", () => {
  it("iOS Safari records MP4 only: it gets MP4", () => {
    expect(pickRecorderType((t) => t === "video/mp4")).toBe("video/mp4");
  });

  it("Chrome with H.264/AAC MP4 gets it first — the worker's own rendition", () => {
    const chrome = new Set(["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]);
    expect(pickRecorderType((t) => chrome.has(t))).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  });

  it("an older Chrome (WebM, and a bare MP4 that means Opus-in-MP4) gets WebM VP9", () => {
    const chrome = new Set(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]);
    expect(pickRecorderType((t) => chrome.has(t))).toBe("video/webm;codecs=vp9,opus");
  });

  it("a browser that throws on a codec string skips it; one with no recorder gets nothing", () => {
    expect(
      pickRecorderType((t) => {
        if (t.includes("codecs")) throw new Error("bad codec string");
        return t === "video/webm";
      }),
    ).toBe("video/webm");
    expect(pickRecorderType(undefined)).toBeUndefined();
    expect(pickRecorderType(() => false)).toBeUndefined();
  });
});

describe("the container from the bytes", () => {
  it("EBML is WebM; ftyp is MP4; ftyp `qt  ` is QuickTime; anything else is nothing", () => {
    expect(sniffVideoExt(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0))).toBe("webm");
    expect(sniffVideoExt(bytes(0, 0, 0, 0x18, "ftypisom"))).toBe("mp4");
    expect(sniffVideoExt(bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe("mov");
    expect(sniffVideoExt(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("mp4");
    expect(sniffVideoExt(bytes("GIF89a......"))).toBeNull();
    expect(sniffVideoExt(new Uint8Array())).toBeNull();
  });

  it("reads a Blob's head", async () => {
    const head = await readHead(new Blob([bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3)]), 4);
    expect([...head]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });

  it("a type with codecs, an empty type with a name", () => {
    expect(videoExtFromType("video/webm;codecs=vp8,opus")).toBe("webm");
    expect(videoExtFromType("video/quicktime")).toBe("mov");
    expect(videoExtFromType("video/x-matroska")).toBe("webm");
    expect(videoExtFromType("video/3gpp")).toBe("mp4");
    expect(videoExtFromType("")).toBeNull();
    expect(videoExtFromName("IMG_0042.MOV")).toBe("mov");
    expect(videoExtFromName("clip.m4v")).toBe("mp4");
    expect(videoExtFromName("notes.txt")).toBeNull();
  });
});

describe("fitWithin — a phone's size, never enlarged", () => {
  it("a 12 MP photograph comes down to a 2048 px long edge, in proportion", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  });
  it("a small one stays as it is", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
