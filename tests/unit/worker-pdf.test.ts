// worker/src/content/pdf.ts — the pure parts: pdffonts' table, the
// substitution rule (REQ-MAT-011 for a PDF, DEC-058) and the magic bytes.
// The tools themselves run in the worker image, where CI's parity job
// exercises pdfinfo/pdftoppm/cwebp on a real PDF (path 4).
import { describe, expect, it } from "vitest";
import { isPdf, parsePdfFonts, substitutedFonts } from "../../worker/src/content/pdf";

const PDFFONTS = [
  "name                                 type              encoding         emb sub uni object ID",
  "------------------------------------ ----------------- ---------------- --- --- --- ---------",
  "AAAAAA+IBMPlexSansArabic-Regular     CID TrueType      Identity-H       yes yes yes     12  0",
  "Cairo-Bold                           TrueType          WinAnsiEncoding  no  no  no      15  0",
  "Amiri-Regular                        Type 1            Custom           no  no  yes     18  0",
  "[none]                               Type 3            Custom           yes no  no      21  0",
  "",
].join("\n");

describe("parsePdfFonts", () => {
  it("reads one row per font with its embedded flag, stripping the subset tag and skipping [none]", () => {
    expect(parsePdfFonts(PDFFONTS)).toEqual([
      { name: "IBMPlexSansArabic-Regular", embedded: true },
      { name: "Cairo-Bold", embedded: false },
      { name: "Amiri-Regular", embedded: false },
    ]);
  });

  it("an empty table (a PDF with no text) yields no fonts", () => {
    expect(parsePdfFonts("name type\n---- ----\n")).toEqual([]);
  });
});

describe("substitutedFonts", () => {
  const installed = new Set(["IBM Plex Sans Arabic", "IBM Plex Sans", "Amiri"]);

  it("★ names a font the PDF does not embed and the image does not have — that is what poppler would substitute", () => {
    expect(substitutedFonts(parsePdfFonts(PDFFONTS), installed)).toEqual(["Cairo-Bold"]);
  });

  it("an embedded font is never a substitution, whatever the image has", () => {
    expect(substitutedFonts([{ name: "Scheherazade-Regular", embedded: true }], installed)).toEqual([]);
  });

  it("a non-embedded font the image DOES have renders faithfully (family match ignores spaces, case and the style suffix)", () => {
    expect(substitutedFonts([{ name: "IBMPlexSansArabic-Bold", embedded: false }, { name: "amiri", embedded: false }], installed)).toEqual([]);
  });
});

describe("isPdf", () => {
  it("accepts %PDF- and nothing else", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.4\n"))).toBe(true);
    expect(isPdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(isPdf(new Uint8Array([0x25, 0x50, 0x44]))).toBe(false);
  });
});
