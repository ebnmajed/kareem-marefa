// Content sniffing — 07-content-pipeline.md §2.1, REQ-MAT-002, REQ-MAT-012, DEC-009.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sniffContent, sniffedKindMatchesDeclared } from "@/lib/storage/sniff";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe("sniffContent", () => {
  it("recognises a PDF by its magic bytes, whatever the filename claimed", () => {
    expect(sniffContent(ascii("%PDF-1.7\n rest of the file")).kind).toBe("pdf");
  });

  it("recognises an OOXML PowerPoint (zip containing ppt/presentation.xml)", () => {
    const zip = concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii("some header junk ppt/presentation.xml more bytes"));
    expect(sniffContent(zip).kind).toBe("powerpoint_ooxml");
  });

  it("recognises a Keynote package (zip containing index.apxl or Index.zip) — DEC-006", () => {
    const withApxl = concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii("junk index.apxl junk"));
    expect(sniffContent(withApxl).kind).toBe("keynote");
    const withIndexZip = concat(bytes(0x50, 0x4b, 0x05, 0x06), ascii("junk Index.zip junk"));
    expect(sniffContent(withIndexZip).kind).toBe("keynote");
  });

  it("a zip that names neither PowerPoint's nor Keynote's marker entry sniffs as unknown — not silently accepted as either", () => {
    const docx = concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii("word/document.xml"));
    expect(sniffContent(docx).kind).toBe("unknown");
  });

  it("recognises legacy .ppt (OLE2/CFBF)", () => {
    expect(sniffContent(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0)).kind).toBe("powerpoint_legacy");
  });

  it("recognises PNG, JPEG and WebP", () => {
    expect(sniffContent(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).kind).toBe("png");
    expect(sniffContent(bytes(0xff, 0xd8, 0xff, 0xe0)).kind).toBe("jpeg");
    const webp = concat(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WEBP"));
    expect(sniffContent(webp).kind).toBe("webp");
  });

  it("recognises MP3 (ID3 tag or a frame sync), WAV, M4A and OGG", () => {
    expect(sniffContent(ascii("ID3\x03\x00")).kind).toBe("mp3");
    expect(sniffContent(bytes(0xff, 0xfb, 0x90, 0x00)).kind).toBe("mp3");
    const wav = concat(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WAVE"));
    expect(sniffContent(wav).kind).toBe("wav");
    const m4a = concat(bytes(0, 0, 0, 0x20), ascii("ftypM4A "));
    expect(sniffContent(m4a).kind).toBe("m4a");
    expect(sniffContent(ascii("OggS\x00\x02")).kind).toBe("ogg");
  });

  it("★ an SVG is rejected on content, however it is named or declared (DEC-009)", () => {
    expect(sniffContent(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).kind).toBe("svg");
    expect(sniffContent(ascii('<?xml version="1.0"?>\n<svg><script>evil()</script></svg>')).kind).toBe("svg");
  });

  it("unrecognised bytes sniff as unknown, never coerced into a guess", () => {
    expect(sniffContent(bytes(1, 2, 3, 4, 5)).kind).toBe("unknown");
  });
});

describe("sniffedKindMatchesDeclared — the SVG-as-.png case DEC-009 names explicitly", () => {
  it("★ an SVG renamed .png is rejected: it never matches the declared kind 'image'", () => {
    const sniffed = sniffContent(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).kind;
    expect(sniffedKindMatchesDeclared(sniffed, "image")).toBe(false);
  });

  it("a real PNG matches 'image'; a real PDF does not", () => {
    const png = sniffContent(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).kind;
    expect(sniffedKindMatchesDeclared(png, "image")).toBe(true);
    const pdf = sniffContent(ascii("%PDF-1.4")).kind;
    expect(sniffedKindMatchesDeclared(pdf, "image")).toBe(false);
  });

  it("both OOXML and legacy PowerPoint match the declared kind 'powerpoint'", () => {
    const ooxml = sniffContent(concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii("ppt/presentation.xml"))).kind;
    expect(sniffedKindMatchesDeclared(ooxml, "powerpoint")).toBe(true);
    const legacy = sniffContent(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)).kind;
    expect(sniffedKindMatchesDeclared(legacy, "powerpoint")).toBe(true);
  });

  it("an unknown sniff never matches any declared kind", () => {
    const unknown = sniffContent(bytes(9, 9, 9)).kind;
    for (const kind of ["pdf", "powerpoint", "keynote", "image", "audio"] as const) {
      expect(sniffedKindMatchesDeclared(unknown, kind)).toBe(false);
    }
  });
});
