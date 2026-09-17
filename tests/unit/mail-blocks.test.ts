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
  appOrigin: "https://kareem.pp.sa",
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
    // One entry, its lines joined — REQ-NTF-013 says four LINES, and four
    // separate entries would space them apart as unrelated paragraphs.
    expect(lines(card)).toEqual([[isolate("الذكاء الاصطناعي في العمل"), isolate("الخميس 6:00 م"), isolate("قاعة الابتكار")].join("\n")]);

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

// ═══════════════════════════════════════════════════════════════════════════
// designer's D3 review (23cf353), finding by finding.
//
// ★ THE RULE THE LEAD SET: every fix lands on the BLOCK path. The STRING path
// keeps the bytes `tests/unit/mail-pinned/` pins, because F1 and F4 are
// plausible and UNVERIFIED — nobody here can open Apple Mail in dark mode —
// and changing every mail every org already sends on an unverified claim is
// what REQ-NTF-009 forbids this wave. So `shell()` takes what differs as
// arguments, and each case below asserts BOTH halves: the design gains it, and
// the string path does not.
// ═══════════════════════════════════════════════════════════════════════════
describe("D3's findings — on the block path, and not on the string path", () => {
  const base = {
    key: "MSG-reminder_1d",
    payload: { title: "جلسة", startsAt: "الخميس 6:00 م", venue: "قاعة الابتكار", url: "https://kareem.pp.sa/x" },
    member: { name: "سارة", email: "s@k.example" },
    org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
  } as const;

  const designed = (...blocks: EmailBlock[]) =>
    renderEmail({ ...base, override: { subject: "غدًا: {{title}}", body: "نص", blocks: doc(...blocks) }, appUrl: "https://kareem.pp.sa" });
  const strung = () => renderEmail({ ...base, override: { subject: "غدًا: {{title}}", body: "مرحبًا {{member.name}}." } });

  it("F1 — a DESIGNED mail declares its scheme; a string mail declares nothing new", () => {
    const out = designed({ type: "heading", id: "h1", text: "عنوان", level: 1 });
    expect(out.html).toContain('<meta name="color-scheme" content="light" />');
    expect(out.html).toContain('<meta name="supported-color-schemes" content="light" />');
    expect(out.html).toContain("color-scheme:light;supported-color-schemes:light;");

    const old = strung();
    expect(old.html).not.toContain("color-scheme");
    expect(old.html).not.toMatch(/<style[\s>]/);
  });

  it("F2 — the logo cell carries an explicit bgcolor ATTRIBUTE, so a transparent PNG has something to stand on", () => {
    // A logo only renders when `0126` gave one a public URL, so this case must
    // pass one — without it there is no image to put a background behind.
    const out = renderEmail({
      ...base,
      override: { subject: "غدًا", body: "نص", blocks: doc({ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "شعار", width: 160 }) },
      appUrl: "https://kareem.pp.sa",
      logoUrl: "https://kareem.pp.sa/api/brand/org-1/logo",
      brand: { light: { fgBody: "#2b3a55", fgMuted: "#6f7d93", surface: "#fffdf7", fgHeading: "#0b1220", edge: "#e6eaf0" } },
    });
    // The ATTRIBUTE, and it carries the card's own surface: the colour the logo
    // sits on today, so light mode is unchanged and an inverter has something
    // explicit to respect.
    expect(out.html).toMatch(/<td[^>]*bgcolor="#fffdf7"[^>]*>\s*<img/);
    // Not a CSS background, which is the first thing Gmail's inverter overrides.
    expect(out.html).not.toContain("background:#fffdf7;\"><img");
  });

  it("F3 — a design that asks for the card's image and has no URL renders NO img", () => {
    const withoutUrl = designed({ type: "session_card", id: "c1", withImage: true });
    expect(withoutUrl.html).not.toContain("<img");
    // …and the card itself still renders, so the mail loses a row and not a block.
    expect(withoutUrl.html).toContain("جلسة");

    const withUrl = renderEmail({
      ...base,
      payload: { ...base.payload, session_card_image_url: "https://kareem.pp.sa/api/s/abc/og" },
      override: { subject: "غدًا", body: "نص", blocks: doc({ type: "session_card", id: "c1", withImage: true }) },
      appUrl: "https://kareem.pp.sa",
    });
    expect(withUrl.html).toContain('src="https://kareem.pp.sa/api/s/abc/og"');
  });

  it("F4 — a design DECLARES an Arabic face for iOS and Android; the string path keeps M3's stack", () => {
    const out = designed({ type: "paragraph", id: "p1", text: "نص" });
    expect(out.html).toContain("'Geeza Pro'");
    expect(out.html).toContain("'Noto Naskh Arabic'");

    const old = strung();
    expect(old.html).not.toContain("Geeza Pro");
    expect(old.html).toContain("Tahoma");
  });

  it("F5 — the session card's own lines carry dir, because they are the bound values", () => {
    const out = designed({ type: "session_card", id: "c1" });
    const divs = out.html.match(/<div[^>]*>/g) ?? [];
    expect(divs.length).toBeGreaterThan(1);
    for (const div of divs) expect(div).toContain('dir="rtl"');
  });

  it("F6 — a long authored label does not push the value column off a narrow card", () => {
    const out = designed({ type: "detail_list", id: "d1", items: [{ label: "اسم القاعة ورقم الدور والمبنى", value: "{{venue}}" }] });
    expect(out.html).not.toContain("white-space:nowrap");
    expect(out.html).toContain('width="35%"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// designer's adversarial read of the injection surface — the three findings
// and the invariant, all on the block path.
//
// The editor is about to make malformed documents easy to produce, which is
// why these land before its panes rather than after.
// ═══════════════════════════════════════════════════════════════════════════
describe("★ F1 — a recognised block with a missing field is DROPPED, never fatal", () => {
  // `readBlocks()` promised «the mail arrives missing a row rather than not
  // arriving at all» and delivered it only for an unknown TYPE. A known type
  // missing its field reached the compiler and threw, so renderEmail() raised,
  // send_notification failed, and the mail never arrived — the opposite of the
  // promise. The database admits every one of these: `0134` checks the
  // envelope, not the contents.
  const malformed: Array<[string, object]> = [
    ["a heading with no text", { type: "heading", id: "h1", level: 1 }],
    ["a paragraph with no text", { type: "paragraph", id: "p1" }],
    ["a button with no urlBinding", { type: "button", id: "b1", label: "افتح", style: "primary" }],
    ["a detail list with no items", { type: "detail_list", id: "d1" }],
    ["an image with no src", { type: "image", id: "i1", alt: "شعار", width: 160 }],
    ["a spacer with no height", { type: "spacer", id: "s1" }],
    ["a heading at an impossible level", { type: "heading", id: "h2", text: "عنوان", level: 7 }],
  ];

  for (const [name, block] of malformed) {
    it(`${name}: the REST of the mail renders`, () => {
      const out = compileBlocks(
        { schemaVersion: 1, blocks: [block, { type: "paragraph", id: "keep", text: "هذه الفقرة تصل." }] },
        ctx(),
      );
      expect(lines(out)).toEqual(["هذه الفقرة تصل."]);
      expect(out.dropped.map((d) => d.type)).toEqual([(block as { type: string }).type]);
    });
  }

  it("a dropped block is NAMED, so the checks panel can point at it", () => {
    const out = compileBlocks({ schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1" }] }, ctx());
    expect(out.dropped).toEqual([{ id: "p1", type: "paragraph", reason: "malformed" }]);
  });

  it("an unknown type is still dropped, and told apart from a malformed known one", () => {
    const out = compileBlocks({ schemaVersion: 2, blocks: [{ type: "carousel", id: "x1" }] }, ctx());
    expect(out.dropped).toEqual([{ id: "x1", type: "carousel", reason: "unknown_type" }]);
  });
});

describe("★ F2 — a prototype key is not a spacer height", () => {
  it("`constructor` is refused rather than emitted as a function body", () => {
    // `SPACER_PX["constructor"]` returned `Object`, and `??` does not catch a
    // truthy inherited value — the row emitted `height="function Object() …"`.
    const out = compileBlocks({ schemaVersion: 1, blocks: [{ type: "spacer", id: "s1", height: "constructor" }] }, ctx());
    expect(out.rows.join("")).not.toContain("function");
    expect(out.dropped[0]).toMatchObject({ type: "spacer", reason: "malformed" });
  });
});

describe("★ F3 — a button's href is allowlisted by scheme, AFTER interpolation", () => {
  const button = { type: "button" as const, id: "b1", label: "افتح", urlBinding: "url", style: "primary" as const };
  const withUrl = (url: unknown) => compileBlocks({ schemaVersion: 1, blocks: [button] }, ctx({ payload: { url } }));

  it("https and mailto are sent", () => {
    expect(withUrl("https://kareem.pp.sa/x").rows.join("")).toContain("https://kareem.pp.sa/x");
    expect(withUrl("mailto:hello@kareem.pp.sa").rows.join("")).toContain("mailto:hello@kareem.pp.sa");
  });

  it("the app's OWN origin is sent — which is what lets localhost through in development and nothing else", () => {
    const dev = compileBlocks({ schemaVersion: 1, blocks: [button] }, ctx({ payload: { url: "http://localhost:3000/ar/app" }, appOrigin: "http://localhost:3000" }));
    expect(dev.rows.join("")).toContain("http://localhost:3000/ar/app");
    // The same URL with no app origin configured is refused.
    expect(withUrl("http://localhost:3000/ar/app").rows.join("")).not.toContain("localhost");
  });

  it("★ javascript:, data: and another origin are DROPPED, and named", () => {
    for (const hostile of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://evil.example/x", "//evil.example/x"]) {
      const out = withUrl(hostile);
      expect(out.rows.join(""), hostile).not.toContain("evil.example");
      expect(out.rows.join(""), hostile).not.toContain("javascript:");
      expect(out.rows.join(""), hostile).not.toContain("data:text/html");
      expect(out.dropped[0], hostile).toMatchObject({ id: "b1", type: "button" });
    }
  });

  it("the TEXT part loses the link too — a stripped client must not be the way round the rule", () => {
    const out = withUrl("javascript:alert(1)");
    expect(lines(out)).toEqual([]);
  });
});

describe("★ the palette invariant — every value reaching an unescaped style= is a hex colour", () => {
  it("a planted non-hex never reaches the HTML; the default does", () => {
    // CompilePalette's fields reach fourteen `style=`/`bgcolor=` sites
    // unescaped, safe only because every source is an anchored-hex column
    // today. That is a property of the callers, not of the type.
    const out = renderEmail({
      key: "MSG-reminder_1d",
      override: { subject: "غدًا", body: "نص", blocks: doc({ type: "paragraph", id: "p1", text: "نص" }) },
      payload: {},
      member: { name: "سارة", email: "s@k.example" },
      org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
      brand: { light: { fgBody: 'red;"><script>alert(1)</script>', fgMuted: "#6f7d93", surface: "#fffdf7", fgHeading: "#0b1220", edge: "#e6eaf0" } },
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).not.toContain("alert(1)");
    // It fell back to the default rather than to nothing.
    expect(out.html).toContain("#1a1a1a");
  });
});
