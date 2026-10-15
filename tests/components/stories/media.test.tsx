// The capture's media helpers (REQ-STO-011, REQ-STO-016, DEC-248 §6, DEC-293): the container read from the bytes and
// the picker's labels, a photograph's size.
import { describe, expect, it } from "vitest";
import { fitWithin, readHead, sniffVideoExt, videoExtFromName, videoExtFromType } from "@/components/stories/media";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

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
