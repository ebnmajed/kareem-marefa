// N2 — the block-to-table compiler (REQ-NTF-009, REQ-NTF-013, 16 §11.3).
//
// The cases below are `designer`'s D3a review list turned into assertions,
// because it was published before the compiler was written so that it could
// shape it rather than audit it. Each one has a mail client that breaks
// without it, and none of them can be checked by looking at the mail in one's
// own inbox.
import { describe, expect, it } from "vitest";
import { compileBlocks, isolate, readBlocks, renderEmail, type CompileContext, type EmailBlock } from "@kareem/mail-runtime";

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

const PALETTE = { fgBody: "#2b3a55", fgMuted: "#6f7d93", fgHeading: "#0b1220", surface: "#fffdf7", edge: "#e6eaf0", accent: "#0b1220" };

const ctx = (over: Partial<CompileContext> = {}): CompileContext => ({
  payload: { title: "الذكاء الاصطناعي في العمل", startsAt: "الخميس 6:00 م", venue: "قاعة الابتكار", day: "", url: "https://kareem.pp.sa/ar/app/sessions/x" },
  palette: PALETTE,
  logoUrl: "https://kareem.pp.sa/api/brand/org-1/logo",
  preferencesUrl: "https://kareem.pp.sa/ar/app/me/notifications",
  org: "كريم معرفة",
  ...over,
});

const doc = (...blocks: EmailBlock[]) => ({ schemaVersion: 1, blocks });
const html = (out: { rows: string[] }) => out.rows.join("\n");

/** A document's OWN lines. The composed footer contributes one of its own to
 *  every document — that is the point of it — and it is asserted on its own
 *  below rather than repeated in every case. */
const lines = (out: { text: string[] }) => out.text.filter((line) => !line.startsWith("تفضيلات الإشعارات"));

describe("each block compiles to one table row and to its own text", () => {
  it("a heading is a row and a line", () => {
    const out = compileBlocks(doc({ type: "heading", id: "h1", text: "جلستك غدًا", level: 1 }), ctx());
    expect(html(out)).toContain("جلستك غدًا");
    expect(out.text[0]).toBe("جلستك غدًا");
    // 10 §2: headings at 1.4, never letter-spaced.
    expect(html(out)).toContain("line-height:1.4");
    expect(html(out)).not.toContain("letter-spacing");
  });

  it("a paragraph keeps 1.7 and never clips a text line", () => {
    const out = compileBlocks(doc({ type: "paragraph", id: "p1", text: "نراك في {{venue}}." }), ctx());
    expect(html(out)).toContain("line-height:1.7");
    expect(html(out)).not.toContain("overflow:hidden");
    expect(out.text[0]).toBe(`نراك في ${FSI}قاعة الابتكار${PDI}.`);
  });

  it("REQ-NTF-013 — a button becomes `label: url`, and carries a VML fallback so Outlook draws it", () => {
    const out = compileBlocks(doc({ type: "button", id: "b1", label: "افتح الجلسة", urlBinding: "url", style: "primary" }), ctx());
    expect(html(out)).toContain("v:roundrect");
    expect(html(out)).toContain("<![endif]-->");
    expect(out.text[0]).toBe(`افتح الجلسة: ${FSI}https://kareem.pp.sa/ar/app/sessions/x${PDI}`);
  });

  it("REQ-NTF-013 — a session card becomes its lines, and a detail list becomes `label: value`", () => {
    const card = compileBlocks(doc({ type: "session_card", id: "c1" }), ctx());
    expect(lines(card)).toEqual([isolate("الذكاء الاصطناعي في العمل"), isolate("الخميس 6:00 م"), isolate("قاعة الابتكار")]);

    const list = compileBlocks(doc({ type: "detail_list", id: "d1", items: [{ label: "الموعد", value: "{{startsAt}}" }] }), ctx());
    expect(list.text[0]).toBe(`الموعد: ${FSI}الخميس 6:00 م${PDI}`);
  });

  it("a divider and a spacer render a row and no text of their own", () => {
    const out = compileBlocks(doc({ type: "divider", id: "r1" }, { type: "spacer", id: "s1", height: "lg" }), ctx());
    expect(out.rows.length).toBeGreaterThanOrEqual(2);
    expect(lines(out)).toEqual([]);
    expect(html(out)).toContain('height="32"');
  });
});

describe("★ bidi isolation — and the two paths diverge here on purpose", () => {
  // `<bdi>` is not supported by Outlook's Word engine (D3a item 3), so a bound
  // value is wrapped in U+2068 … U+2069 — in the HTML and in the text part,
  // which reorders without them.
  it("a bound value is isolated in BOTH parts, and a literal is not", () => {
    const out = compileBlocks(doc({ type: "paragraph", id: "p1", text: "جلسة {{title}} اليوم" }), ctx());
    expect(out.text[0]).toBe(`جلسة ${FSI}الذكاء الاصطناعي في العمل${PDI} اليوم`);
    expect(html(out)).toContain(FSI);
    // The words the admin typed are not isolated — only what was substituted.
    expect(out.text[0].startsWith("جلسة ")).toBe(true);
  });

  it("an empty value produces NO isolates — two invisible characters around nothing help nobody", () => {
    const out = compileBlocks(doc({ type: "paragraph", id: "p1", text: "قبل {{day}} بعد" }), ctx());
    expect(out.text[0]).toBe("قبل  بعد");
    expect(out.text[0]).not.toContain(FSI);
  });

  it("★ the STRING path does not isolate — `interpolate()` is shared, and isolating there would move all 116 pinned files", () => {
    const out = renderEmail({
      key: "MSG-badge_earned",
      override: { subject: "شارة {{badge}}", body: "حصلت على {{badge}}." },
      payload: { badge: "أول جلسة" },
      member: { name: "سارة", email: "s@k.example" },
      org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
    });
    expect(out.text).toContain("حصلت على أول جلسة.");
    expect(out.text).not.toContain(FSI);
    expect(out.html).not.toContain(FSI);
  });
});

describe("the footer is composed, not typed — REQ-NTF-005 cannot be forgotten", () => {
  it("every document ends with the preference link, even one with no blocks at all", () => {
    const empty = compileBlocks(doc(), ctx());
    expect(html(empty)).toContain("تفضيلات الإشعارات");
    expect(empty.text.at(-1)).toContain("تفضيلات الإشعارات");

    const some = compileBlocks(doc({ type: "heading", id: "h1", text: "عنوان", level: 1 }), ctx());
    expect(html(some)).toContain("تفضيلات الإشعارات");
  });

  it("there is no `footer` block type to add or delete", () => {
    // It is not in the union, so a document cannot carry one — and
    // `readBlocks()` drops it rather than trusting a stored document.
    expect(readBlocks({ schemaVersion: 1, blocks: [{ type: "footer", id: "f1" }] })).toEqual([]);
  });
});

describe("images — contract 8, and every design correct with none", () => {
  it("an org with no PUBLIC logo renders no image row rather than a broken one", () => {
    const out = compileBlocks(doc({ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "شعار المؤسسة", width: 160 }), ctx({ logoUrl: null }));
    expect(html(out)).not.toContain("<img");
  });

  it("a logo that IS public renders with alt and an explicit width, and never as SVG", () => {
    const out = compileBlocks(doc({ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "شعار المؤسسة", width: 160 }), ctx());
    expect(html(out)).toContain('alt="شعار المؤسسة"');
    expect(html(out)).toContain('width="160"');
    expect(html(out)).not.toContain("<svg");
  });

  it("★ a session card carries NO image unless the design asks for one — /api/s/{id}/og 404s for a cancelled session", () => {
    const withoutImage = compileBlocks(doc({ type: "session_card", id: "c1" }), ctx());
    expect(html(withoutImage)).not.toContain("<img");

    const asked = compileBlocks(doc({ type: "session_card", id: "c1", withImage: true }), ctx({ payload: { ...ctx().payload, session_card_image_url: "https://kareem.pp.sa/api/s/x/og" } }));
    expect(html(asked)).toContain("<img");
  });
});

describe("the constraints every client imposes (D3a)", () => {
  const out = compileBlocks(
    doc(
      { type: "heading", id: "h1", text: "جلستك غدًا", level: 1 },
      { type: "paragraph", id: "p1", text: "نراك في {{venue}}." },
      { type: "button", id: "b1", label: "افتح", urlBinding: "url", style: "primary" },
      { type: "detail_list", id: "d1", items: [{ label: "الموعد", value: "{{startsAt}}" }] },
    ),
    ctx(),
  );

  it("every text-bearing cell states dir=rtl AND align=right", () => {
    const cells = html(out).match(/<td[^>]*>/g) ?? [];
    expect(cells.length).toBeGreaterThan(3);
    for (const cell of cells) {
      expect(cell).toContain('dir="rtl"');
      expect(cell).toContain('align="right"');
    }
  });

  it("inline CSS only, one declared font stack, and no web font", () => {
    expect(html(out)).not.toMatch(/<style[\s>]/);
    expect(html(out)).not.toContain("class=");
    expect(html(out)).toContain("Tahoma");
    expect(html(out)).not.toContain("@font-face");
  });

  it("payload text is escaped rather than allowed to close a tag", () => {
    const hostile = compileBlocks(doc({ type: "paragraph", id: "p1", text: "{{title}}" }), ctx({ payload: { title: "<script>alert(1)</script>" } }));
    expect(html(hostile)).not.toContain("<script>");
    expect(html(hostile)).toContain("&lt;script&gt;");
  });
});

describe("a reader must survive a document a newer build wrote", () => {
  it("an unrecognised block is skipped, never fatal — the mail arrives missing a row rather than not arriving", () => {
    const out = compileBlocks(
      { schemaVersion: 99, blocks: [{ type: "carousel", id: "x1" }, { type: "heading", id: "h1", text: "عنوان", level: 1 }] },
      ctx(),
    );
    expect(out.text[0]).toBe("عنوان");
  });

  it("a malformed document compiles to the footer alone rather than throwing", () => {
    expect(() => compileBlocks({ schemaVersion: 1 }, ctx())).not.toThrow();
    expect(() => compileBlocks(null, ctx())).not.toThrow();
  });
});

describe("renderEmail's one branch", () => {
  const base = {
    key: "MSG-reminder_1d",
    payload: { title: "جلسة", startsAt: "الخميس 6:00 م", venue: "قاعة الابتكار", url: "https://kareem.pp.sa/x" },
    member: { name: "سارة", email: "s@k.example" },
    org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
  } as const;

  it("★ blocks: null is a STRING template — byte-identical to sending no blocks key at all", () => {
    const without = renderEmail({ ...base, override: { subject: "غدًا: {{title}}", body: "مرحبًا {{member.name}}." } });
    const withNull = renderEmail({ ...base, override: { subject: "غدًا: {{title}}", body: "مرحبًا {{member.name}}.", blocks: null } });
    expect(withNull.html).toBe(without.html);
    expect(withNull.text).toBe(without.text);
    expect(withNull.subject).toBe(without.subject);
  });

  it("a document takes the block path, and the subject still comes from the row", () => {
    const out = renderEmail({
      ...base,
      override: {
        subject: "غدًا: {{title}}",
        body: "النص البديل",
        blocks: doc({ type: "heading", id: "h1", text: "جلستك غدًا", level: 1 }),
      },
      appUrl: "https://kareem.pp.sa",
    });
    expect(out.subject).toBe("غدًا: جلسة");
    expect(out.html).toContain("جلستك غدًا");
    // The row's `body` is what `main`'s OLD worker renders down the string
    // path; the block path does not use it.
    expect(out.html).not.toContain("النص البديل");
    // The footer's link is built from `appUrl`.
    expect(out.html).toContain("/ar/app/me/notifications");
    // And the shell's sign-off is the one the string path writes.
    expect(out.text).toContain("كريم معرفة · كريم معرفة · شارك المعرفة.. واصنع الأثر");
  });

  it("with no appUrl there is no preference link — never a relative or a localhost one", () => {
    const out = renderEmail({ ...base, override: { subject: "غدًا", body: "نص", blocks: doc({ type: "heading", id: "h1", text: "عنوان", level: 1 }) } });
    expect(out.html).not.toContain("href=\"/");
    expect(out.html).not.toContain("localhost");
  });
});
