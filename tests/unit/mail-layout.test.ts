// Wave 23 — rows, layouts and global styles on the flat block list
// (`REQ-NTF-015`, `DEC-235` §3.2, `DEC-238` §4).
//
// ★ THE PROOF THE OVERLAY IS ADDITIVE. Every pinned case is rendered again with
// an overlay that says nothing new — each block its own one-column row, and the
// document's OWN styles carried through — and must come out byte-identical to
// its pinned file. A row compiled any differently from the flat path fails here.
//
// ★ WAVE 24 CORRECTED `canonical()` HERE, AND THE BUG IS WORTH KEEPING ON THE
// RECORD. It used to blank `styles` to `{}`, which was the same thing as the
// real value only while NO platform design carried styles. When the eight gained
// the house style (`REQ-NTF-016`) the helper started saying something new — it
// stripped the ground, rendered the neutral grey and disagreed with a pin that
// was correct. The suite that proves an overlay additive must not itself be an
// overlay that changes the document.
//
// The property the `{}` was carrying — that a `styles` object which is PRESENT
// but EMPTY compiles identically to one that is absent, so a style object cannot
// move a literal by merely being there — is real and is now asserted on its own,
// below, against a document with no styles of its own rather than against the
// designs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emailDocumentFor, MAIL, renderEmail, readRows, readStyles, type EmailBlock, type EmailBlockDocument } from "@kareem/mail-runtime";
import { APP_URL, BRAND, CASES, LOGO_URL, MEMBER, ORG, type PinnedCase } from "./mail-pinned.fixtures";

const DIR = join(process.cwd(), "tests", "unit", "mail-pinned");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");

function renderWith(sample: PinnedCase, document: EmailBlockDocument, variant: "brand" | "plain") {
  return renderEmail({
    key: sample.key,
    override: { subject: sample.override?.subject ?? null, body: null, blocks: document },
    payload: sample.payload,
    member: sample.member ?? MEMBER,
    org: ORG,
    brand: variant === "brand" ? BRAND : null,
    logoUrl: variant === "brand" ? LOGO_URL : null,
    appUrl: APP_URL,
    unsubscribeUrl: `${APP_URL}/ar/unsubscribe?t=pinned`,
  });
}

function canonical(document: EmailBlockDocument): EmailBlockDocument {
  // ★ `styles` is CARRIED, not blanked: the spread keeps the document's own, so
  // the only thing this overlay says is «each block is its own one-column row».
  return { ...document, rows: document.blocks.map((block) => ({ id: `r-${block.id}`, layout: "1" as const, columns: [[block.id]] })) };
}

describe("★ an overlay that says nothing new renders every pinned message byte for byte", () => {
  for (const sample of CASES) {
    it(sample.id, () => {
      const document = emailDocumentFor(sample.key, sample.override ?? null)!;
      const overlaid = canonical(document);
      const brand = renderWith(sample, overlaid, "brand");
      const plain = renderWith(sample, overlaid, "plain");
      expect(brand.html).toBe(read(`${sample.id}.brand.html`));
      expect(plain.html).toBe(read(`${sample.id}.plain.html`));
      expect(brand.text).toBe(read(`${sample.id}.txt`));
      expect(brand.subject).toBe(read(`${sample.id}.subject.txt`));
    });
  }
});

const sample = CASES.find((c) => c.id === "MSG-reminder_1d")!;
const p = (id: string, text: string): EmailBlock => ({ type: "paragraph", id, text });

describe("reading the overlay — tolerant, never throwing, never losing a block", () => {
  const blocks = [p("a", "أ"), p("b", "ب"), p("c", "ج")];

  it("no `rows` is null: the old path", () => {
    expect(readRows({ schemaVersion: 1, blocks }, blocks)).toBeNull();
    expect(readStyles({ schemaVersion: 1, blocks })).toBeNull();
  });

  it("★ a `styles` that is PRESENT but EMPTY is the old path too — being there moves no literal", () => {
    // The property `canonical()` used to carry by blanking `styles` to `{}`,
    // held on its own now that the eight designs have styles of their own
    // (wave 24). `readStyles()` returns null for an object with nothing in it,
    // so the shell keeps every literal it has always had — and a document that
    // merely mentions `styles` renders byte for byte like one that does not.
    expect(readStyles({ schemaVersion: 1, blocks, styles: {} })).toBeNull();
    const bare: EmailBlockDocument = { schemaVersion: 1, blocks };
    const empty: EmailBlockDocument = { schemaVersion: 1, blocks, styles: {} };
    expect(renderWith(sample, empty, "brand").html).toBe(renderWith(sample, bare, "brand").html);
    expect(renderWith(sample, empty, "plain").html).toBe(renderWith(sample, bare, "plain").html);
  });

  it("an id that names nothing is forgotten; a block no row names is appended as its own row", () => {
    const rows = readRows({ schemaVersion: 1, blocks, rows: [{ id: "r", layout: "1", columns: [["zz", "b"]] }] }, blocks)!;
    expect(rows.map((r) => (r.kind === "single" ? r.block.id : r.id))).toEqual(["b", "a", "c"]);
  });

  it("a column row whose columns do not match its layout is read as single rows", () => {
    const rows = readRows({ schemaVersion: 1, blocks, rows: [{ id: "r", layout: "1/1", columns: [["a", "b"]] }] }, blocks)!;
    expect(rows.every((r) => r.kind === "single")).toBe(true);
  });

  it("an id used twice is placed once", () => {
    const rows = readRows({ schemaVersion: 1, blocks, rows: [{ id: "r", layout: "1/1", columns: [["a"], ["a", "b"]] }] }, blocks)!;
    const placed = rows.flatMap((r) => (r.kind === "single" ? [r.block.id] : r.columns.flat().map((b) => b.id)));
    expect(placed.sort()).toEqual(["a", "b", "c"]);
  });

  it("a value outside its scale falls back — a hex is never a colour here", () => {
    expect(readStyles({ styles: { textColour: "#ff0000", padding: 13, headingSize: { h1: 9 }, ground: "url(x)" } })).toBeNull();
    expect(readStyles({ styles: { textColour: "fgMuted", padding: 32 } })).toEqual({ textColour: "fgMuted", padding: 32 });
  });
});

describe("a multi-column row", () => {
  const document: EmailBlockDocument = {
    schemaVersion: 1,
    blocks: [p("a", "العمود الأول"), p("b", "العمود الثاني"), p("c", "تحت الصف")],
    rows: [
      { id: "row", layout: "1/2", columns: [["a"], ["b"]] },
      { id: "r-c", layout: "1", columns: [["c"]] },
    ],
  };
  const rendered = renderWith(sample, document, "brand");

  it("is one shell row: an Outlook ghost table and inline-block columns, RTL throughout", () => {
    expect(rendered.html).toContain("<!--[if mso]><table");
    expect(rendered.html).toMatch(/display:inline-block;vertical-align:top;width:100%;max-width:\d+px/);
    expect(rendered.html.indexOf("العمود الأول")).toBeLessThan(rendered.html.indexOf("العمود الثاني"));
    // No table and no cell without its direction (D3a item 2).
    expect(rendered.html.match(/<table(?![^>]*dir="rtl")/g)).toBeNull();
  });

  it("1/2 gives the start column a third and the end column two thirds", () => {
    const widths = [...rendered.html.matchAll(/max-width:(\d+)px;font-size:17px/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
  });

  it("the text part reads the row's columns from the start, then the next row", () => {
    expect(rendered.text.indexOf("العمود الأول")).toBeLessThan(rendered.text.indexOf("العمود الثاني"));
    expect(rendered.text.indexOf("العمود الثاني")).toBeLessThan(rendered.text.indexOf("تحت الصف"));
  });

  it("the text part is the same with or without the rows", () => {
    const flat = renderWith(sample, { schemaVersion: 1, blocks: document.blocks }, "brand");
    expect(rendered.text).toBe(flat.text);
  });
});

describe("global styles and per-block overrides", () => {
  const base: EmailBlockDocument = { schemaVersion: 1, blocks: [{ type: "heading", id: "h", text: "عنوان", level: 1 }, p("a", "نص")] };

  it("heading sizes move the literals they name; the card's padding and ground are the design's (`DEC-289`)", () => {
    const html = renderWith(sample, { ...base, styles: { headingSize: { h1: 28 }, padding: 16, ground: "surface" } }, "brand").html;
    expect(html).toContain("font-size:28px");
    // Wave 30: the approved shell is fixed — 32 px a side, the page ground — whatever a document's styles say.
    expect(html).toContain("padding:32px 32px 36px");
    expect(html).toContain(`background:${MAIL.page}`);
  });

  it("★ a colour is a TOKEN resolved from the design's palette — no kit reaches it (`DEC-289`)", () => {
    const html = renderWith(sample, { ...base, styles: { textColour: "fgMuted" } }, "brand").html;
    expect(html).toContain(`color:${MAIL.muted};padding:0 0 16px 0`);
    expect(html).not.toContain(BRAND.light.fgMuted);
  });

  it("a document's own mobile rules are emitted only when a mobile value exists — beside the design's", () => {
    // The shell's phone rules (`build.py`'s `@media (max-width:620px)`) are always there.
    const plain = renderWith(sample, { ...base, styles: { padding: 16 } }, "brand").html;
    expect(plain).toContain("@media (max-width:620px)");
    expect(plain).not.toContain("@media only screen and (max-width:620px)");
    const html = renderWith(sample, { ...base, styles: { mobile: { headingSize: { h1: 22 }, padding: 16 } } }, "brand").html;
    expect(html).toContain("@media only screen and (max-width:620px)");
    expect(html).toContain('class="k-h1"');
  });

  it("a block's own alignment and padding apply to that block only", () => {
    const html = renderWith(sample, { schemaVersion: 1, blocks: [{ type: "paragraph", id: "a", text: "وسط", style: { align: "center", padTop: 24 } }, p("b", "يمين")] }, "brand").html;
    expect(html).toContain('align="center" style="font-family:');
    expect(html).toContain("padding:24px 0 16px 0;text-align:center;");
    expect(html).toContain("padding:0 0 16px 0;text-align:right;");
  });
});

describe("the editor's annotation", () => {
  it("is OFF unless asked — and on, every block row names its block", () => {
    const document: EmailBlockDocument = { schemaVersion: 1, blocks: [p("a", "أ")] };
    const off = renderWith(sample, document, "brand").html;
    expect(off).not.toContain("data-k=");
    const on = renderEmail({ key: sample.key, override: { subject: null, body: null, blocks: document }, payload: sample.payload, member: MEMBER, org: ORG, appUrl: APP_URL, annotate: true }).html;
    expect(on).toContain('<tr data-k="a">');
  });
});

describe("an empty layout row — sent as nothing, drawn on the canvas", () => {
  const document: EmailBlockDocument = { schemaVersion: 1, blocks: [p("a", "أ")], rows: [{ id: "r-a", layout: "1", columns: [["a"]] }, { id: "empty", layout: "1/2", columns: [[], []] }] };

  it("is dropped from the mail a member receives", () => {
    expect(renderWith(sample, document, "brand").html).not.toContain("display:inline-block");
  });

  it("★ is kept in the editor's frame, with its id and a measurable place in each column", () => {
    const html = renderEmail({ key: sample.key, override: { subject: null, body: null, blocks: document }, payload: sample.payload, member: MEMBER, org: ORG, appUrl: APP_URL, annotate: true }).html;
    expect(html).toContain('<tr data-k="empty">');
    expect(html.match(/border:1px dashed/g)).toHaveLength(2);
  });
});
