// Wave 23 — the five new block types (`REQ-NTF-015`, `DEC-235` §3.2, `DEC-238`
// §4): الملصق · رمز QR · الشعار · شهادة · اجتماعي. نقاطك is drawn, not built.
//
// Each through the four places a type lives: the reader, the compiler's HTML,
// the text alternative it writes in the same walk, and the template text the
// row stores. ★ And none emits SVG (invariant 11).
import { describe, expect, it } from "vitest";
import { ALL_BLOCK_TYPES, BLOCK_TYPES, blocksToTemplateText, compileBlocks, readDocument, renderEmail, type CompileContext, type EmailBlock } from "@kareem/mail-runtime";

const ORIGIN = "https://app.kareem.example";
// The isolates by code point — the characters themselves are invisible in a diff.
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const SESSION = "11111111-1111-4111-8111-111111111111";

function ctx(payload: Record<string, unknown> = {}, extra: Partial<CompileContext> = {}): CompileContext {
  return {
    payload,
    palette: { fgBody: "#111111", fgMuted: "#666666", fgHeading: "#000000", surface: "#ffffff", edge: "#eeeeee", accent: "#000000" },
    logoUrl: null,
    preferencesUrl: null,
    appOrigin: ORIGIN,
    org: "كريم معرفة",
    ...extra,
  };
}
const compile = (block: EmailBlock, payload: Record<string, unknown> = {}, extra: Partial<CompileContext> = {}) => {
  const out = compileBlocks({ schemaVersion: 1, blocks: [block] }, ctx(payload, extra));
  // The composed footer's rule is appended to every document; `rows` here is
  // what the BLOCK wrote.
  return { ...out, rows: out.rows.slice(0, -1) };
};

describe("the union", () => {
  it("adds five types and leaves the wave-10 list of eight as it was", () => {
    expect(BLOCK_TYPES).toHaveLength(8);
    expect(ALL_BLOCK_TYPES.slice(8)).toEqual(["poster", "qr", "logo", "certificate", "social"]);
    expect(ALL_BLOCK_TYPES).not.toContain("points");
  });

  it("a malformed new block is dropped as MALFORMED (not unknown), and named", () => {
    const { blocks, dropped } = readDocument({ schemaVersion: 1, blocks: [{ type: "qr", id: "q", label: "x" }] });
    expect(blocks).toEqual([]);
    expect(dropped).toEqual([{ id: "q", type: "qr", reason: "malformed" }]);
  });
});

describe("الملصق — the poster card", () => {
  const block: EmailBlock = { type: "poster", id: "p", alt: "{{title}}" };
  it("draws the card the worker hands over, full width", () => {
    const out = compile(block, { title: "جلسة", session_card_image_url: `${ORIGIN}/api/s/${SESSION}/og` });
    expect(out.rows.join("")).toContain(`src="${ORIGIN}/api/s/${SESSION}/og"`);
    expect(out.rows.join("")).toContain('width="512"');
    expect(out.text).toEqual([]);
  });
  it("no card (draft, cancelled, none) drops the row — never a broken image", () => {
    expect(compile(block, { title: "جلسة" }).rows).toEqual([]);
  });
});

describe("رمز QR", () => {
  const block: EmailBlock = { type: "qr", id: "q", label: "امسح للفتح", urlBinding: "url", alt: "رمز الجلسة", size: "md" };
  it("is a PNG from OUR route, encoding a path on our origin, and writes `label: url`", () => {
    const url = `${ORIGIN}/ar/app/sessions/${SESSION}`;
    const out = compile(block, { url });
    const html = out.rows.join("");
    expect(html).toContain(`src="${ORIGIN}/api/mail/qr?p=${encodeURIComponent(`/ar/app/sessions/${SESSION}`)}"`);
    expect(html).toContain('width="160" height="160"');
    expect(out.text).toHaveLength(1);
    expect(out.text[0]).toContain("امسح للفتح: ");
    expect(out.text[0]).toContain(url);
  });
  it("★ a URL that is not ours, or not a page the route draws, is dropped LOUDLY", () => {
    for (const url of ["https://evil.example/x", `${ORIGIN}/ar/app/admin/members`, `${ORIGIN}/ar/app/sessions/${SESSION}?x=1`]) {
      const out = compile(block, { url });
      expect(out.rows, url).toEqual([]);
      expect(out.dropped, url).toEqual([{ id: "q", type: "qr", reason: "malformed" }]);
    }
  });
  it("no origin (a unit render with none) draws nothing and says so", () => {
    expect(compile(block, { url: `${ORIGIN}/ar/app/sessions/${SESSION}` }, { appOrigin: null }).dropped).toHaveLength(1);
  });
  it("an empty binding is the check's, not a drop", () => {
    expect(compile(block, {}).dropped).toEqual([]);
  });
});

describe("الشعار", () => {
  const block: EmailBlock = { type: "logo", id: "l", width: 160 };
  it("with a PNG/JPEG logo: the image, alt the org's name", () => {
    const html = compile(block, {}, { logoUrl: `${ORIGIN}/api/brand/o/logo` }).rows.join("");
    expect(html).toContain(`src="${ORIGIN}/api/brand/o/logo" alt="كريم معرفة" width="160"`);
  });
  it("without one: the org's NAME — and ★ the text part is the same in both branches (empty)", () => {
    const withLogo = compile(block, {}, { logoUrl: `${ORIGIN}/api/brand/o/logo` });
    const without = compile(block);
    expect(without.rows.join("")).toContain("كريم معرفة");
    expect(without.rows.join("")).not.toContain("<img");
    expect(withLogo.text).toEqual([]);
    expect(without.text).toEqual([]);
  });
});

describe("شهادة", () => {
  const block: EmailBlock = { type: "certificate", id: "c", label: "اعرض الشهادة" };
  const payload = { kind: "attendance", title: "أساسيات التصميم", serial: "KM-000001", url: `${ORIGIN}/ar/app/me/certificates` };
  it("the kind in Arabic, the title, the serial isolated, and a button", () => {
    const out = compile(block, payload);
    const html = out.rows.join("");
    expect(html).toContain("شهادة حضور");
    expect(html).toContain(`${FSI}KM-000001${PDI}`);
    expect(html).toContain(`href="${payload.url}"`);
    expect(out.text[0]).toContain("KM-000001");
    expect(out.text[1]).toContain("اعرض الشهادة: ");
  });
  it("a message with no certificate data renders nothing", () => {
    expect(compile(block, {}).rows).toEqual([]);
  });
});

describe("اجتماعي", () => {
  const block: EmailBlock = {
    type: "social",
    id: "s",
    items: [
      { label: "لينكدإن", value: "https://linkedin.example/kareem" },
      { label: "خطر", value: "javascript:alert(1)" },
    ],
  };
  it("text links joined by « · », a link we would not send dropped loudly", () => {
    const out = compile(block);
    const html = out.rows.join("");
    expect(html).toContain('href="https://linkedin.example/kareem"');
    expect(html).not.toContain("javascript:");
    expect(out.dropped).toEqual([{ id: "s", type: "social", reason: "malformed" }]);
    expect(out.text[0]).toContain("لينكدإن: ");
  });
});

describe("the stored template text (REQ-NTF-013), bindings intact", () => {
  it("each new type writes its lines in template form", () => {
    const text = blocksToTemplateText({
      schemaVersion: 1,
      blocks: [
        { type: "poster", id: "p", alt: "{{title}}" },
        { type: "qr", id: "q", label: "امسح", urlBinding: "url", alt: "x", size: "sm" },
        { type: "logo", id: "l", width: 120 },
        { type: "certificate", id: "c", label: "اعرض" },
        { type: "social", id: "s", items: [{ label: "X", value: "https://x.example" }] },
      ],
    });
    expect(text).toBe("امسح: {{url}}\n\n{{title}}\n{{serial}}\n\nاعرض: {{url}}\n\nX: https://x.example");
  });
});

describe("★ no SVG, anywhere a new type can reach (invariant 11)", () => {
  it("a mail carrying all five, with every image present", () => {
    const html = renderEmail({
      key: "MSG-certificate_issued",
      override: {
        subject: "s",
        body: null,
        blocks: {
          schemaVersion: 1,
          blocks: [
            { type: "logo", id: "l", width: 160 },
            { type: "poster", id: "p", alt: "x" },
            { type: "qr", id: "q", label: "x", urlBinding: "url", alt: "x", size: "md" },
            { type: "certificate", id: "c", label: "x" },
            { type: "social", id: "s", items: [{ label: "x", value: "https://x.example" }] },
          ],
        },
      },
      payload: { kind: "attendance", serial: "KM-1", session_card_image_url: `${ORIGIN}/api/s/${SESSION}/og` },
      member: { name: "سارة", email: "s@x.example" },
      org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
      logoUrl: `${ORIGIN}/api/brand/o/logo`,
      appUrl: ORIGIN,
    }).html;
    expect(html.toLowerCase()).not.toContain("<svg");
    expect(html.toLowerCase()).not.toContain(".svg");
    expect(html).toContain("/api/mail/qr?p=");
  });
});
