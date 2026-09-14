// The Arabic-first RTL email renderer — worker/src/mail/render.ts, 08 §3.
//
// Each constraint below has a mail client that breaks without it, and none of
// them can be checked by looking at the mail in one's own inbox.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changeBlock, interpolate, renderEmail, TemplateMissingError, type RenderInput } from "../../worker/src/mail/render";
import { DEFAULT_TEMPLATES } from "../../worker/src/mail/templates";

const ORG: RenderInput["org"] = { name: "كريم معرفة", numerals: "western", timeZone: "Asia/Riyadh" };
const MEMBER = { name: "سارة العتيبي", email: "sara@kareem.example" };

const render = (key: string, payload: Record<string, unknown> = {}, org = ORG) =>
  renderEmail({ key, payload, member: MEMBER, org });

describe("REQ-NTF-002 — every email row of the matrix has an Arabic template", () => {
  // The matrix is read out of the promoted migration rather than restated
  // here: a message added to 08 §1 with an email channel and no template would
  // otherwise be found by a member receiving nothing.
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0026_notification_contract.sql"), "utf8");
  const matrix = [...sql.matchAll(/\('(MSG-[a-z0-9_]+)',\s*'[a-z_]+',\s*(true|false),\s*(true|false),\s*(true|false)\s*\)/g)].map((m) => ({
    key: m[1],
    inApp: m[2] === "true",
    email: m[3] === "true",
  }));

  it("parsed the matrix out of the migration at all", () => {
    expect(matrix).toHaveLength(38);
  });

  it("has a subject and a body for every message with an email channel", () => {
    const missing = matrix.filter((m) => m.email && !DEFAULT_TEMPLATES[m.key]).map((m) => m.key);
    expect(missing).toEqual([]);
  });

  it("has no template for a message that has no email channel", () => {
    const stray = Object.keys(DEFAULT_TEMPLATES).filter((key) => !matrix.some((m) => m.key === key && m.email));
    expect(stray).toEqual([]);
  });

  it("every template renders without leaving a placeholder behind", () => {
    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      const out = render(key, { title: "جلسة", reason: "سبب", url: "https://kareem.pp.sa/ar/app", serial: "KM-000001" });
      expect(out.subject, key).not.toContain("{{");
      expect(out.text, key).not.toContain("{{");
      expect(out.subject.length, key).toBeGreaterThan(0);
    }
  });
});

describe("08 §3.1 — the constraints email clients impose", () => {
  const out = render("MSG-session_published", { title: "الذكاء الاصطناعي في العمل", startsAt: "الأحد ٦:٠٠ م", venue: "قاعة الابتكار", url: "https://kareem.pp.sa/x" });

  it("puts dir=rtl on <html> and on every table cell", () => {
    expect(out.html).toContain('<html dir="rtl" lang="ar">');
    const cells = out.html.match(/<td[^>]*>/g) ?? [];
    expect(cells.length).toBeGreaterThan(1);
    // Outlook ignores inherited direction more often than it honours it, so
    // every cell states it rather than relying on the <html> attribute.
    for (const cell of cells) expect(cell).toContain('dir="rtl"');
  });

  it("uses tables for layout and inline CSS only", () => {
    expect(out.html).toContain("<table");
    expect(out.html).not.toMatch(/<style[\s>]/);
    expect(out.html).not.toContain("class=");
  });

  it("declares a fallback font stack and loads no web font", () => {
    expect(out.html).toContain("Tahoma");
    expect(out.html).not.toContain("@font-face");
    expect(out.html).not.toContain("fonts.googleapis");
  });

  it("never clips a text line and never letter-spaces Arabic", () => {
    expect(out.html).not.toContain("overflow:hidden");
    expect(out.html).not.toContain("letter-spacing");
    expect(out.html).toContain("line-height:1.7");
  });

  it("carries a plain-text alternative that stands on its own", () => {
    expect(out.text).toContain("الذكاء الاصطناعي في العمل");
    expect(out.text).toContain("كريم معرفة");
    expect(out.text).not.toContain("<");
  });

  it("escapes payload text rather than letting it close a tag", () => {
    const hostile = render("MSG-badge_earned", { badge: '<script>alert(1)</script>' });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });
});

describe("REQ-INT-006 — numerals follow the org setting", () => {
  it("renders a count in Arabic-Indic digits when the org asks for them", () => {
    const western = render("MSG-level_reached", { level: 7 });
    const arabic = render("MSG-level_reached", { level: 7 }, { ...ORG, numerals: "arabic_indic" as const });
    expect(western.subject).toContain("7");
    expect(arabic.subject).toContain("٧");
    expect(arabic.subject).not.toContain("7");
  });
});

describe("interpolate", () => {
  it("resolves a dotted path and blanks an unresolved one", () => {
    expect(interpolate("{{a.b}} · {{missing}}", { a: { b: "قيمة" } }, "western")).toBe("قيمة · ");
  });

  it("leaves no template variable visible to a member", () => {
    expect(interpolate("مرحبًا {{member.name}}", {}, "western")).toBe("مرحبًا ");
  });
});

describe("REQ-SES-009 / 08 §3.3 — the old value and the new one, side by side", () => {
  it("prints both values for a field that moved", () => {
    const block = changeBlock([{ label: "الموعد", from: "الأحد ٦:٠٠ م", to: "الاثنين ٧:٠٠ م" }]);
    expect(block).toBe("الموعد: الأحد ٦:٠٠ م ← الاثنين ٧:٠٠ م");
  });

  it("renders ONLY changed lines — a venue change prints no unchanged time", () => {
    const block = changeBlock([
      { label: "الموعد", from: "الأحد ٦:٠٠ م", to: "الأحد ٦:٠٠ م" },
      { label: "المكان", from: "قاعة أ", to: "قاعة ب" },
    ]);
    expect(block).toBe("المكان: قاعة أ ← قاعة ب");
  });

  it("reaches the rendered mail through the session_changed template", () => {
    const out = render("MSG-session_changed", {
      title: "جلسة",
      changes: changeBlock([{ label: "المكان", from: "قاعة أ", to: "قاعة ب" }]),
    });
    expect(out.subject).toBe("تغيّرت تفاصيل جلسة «جلسة»");
    expect(out.text).toContain("المكان: قاعة أ ← قاعة ب");
  });
});

describe("REQ-NTF-007 — the org's template wins", () => {
  it("uses the admin's subject and body instead of the default", () => {
    const out = renderEmail({
      key: "MSG-badge_earned",
      override: { subject: "مبروك يا {{member.name}}", body: "حصلت على {{badge}}." },
      payload: { badge: "أول جلسة" },
      member: MEMBER,
      org: ORG,
    });
    expect(out.subject).toBe("مبروك يا سارة العتيبي");
    expect(out.text).toContain("حصلت على أول جلسة.");
  });

  it("raises rather than sending a blank when a key has no template at all", () => {
    expect(() => render("MSG-rsvp_confirmed")).toThrow(TemplateMissingError);
  });
});
