import { SCHEMA_VERSION, type EmailBlock, type EmailBlockDocument, type EmailStyles } from "./blocks.js";

// The eight designed platform templates — REQ-NTF-014, DEC-082, `16` §11.5.
//
// ★ CONSTANTS, NOT ROWS, and the reason is in three of the requirement's own
// acceptance lines. «Present for every org from creation» is stronger as code
// than as a seed plus a backfill; «an org duplicates one and the original is
// never mutated» is TRUE BY CONSTRUCTION when the original is a constant; and
// «changing the org logo restyles every message» is the renderer reading
// `brand_kit()`, which it does whatever holds the blocks. `DEFAULT_TEMPLATES`
// is the precedent in this very module: `REQ-NTF-002`'s «every matrix row has
// an Arabic template» has been satisfied by constants since M3. Rows would buy
// promotion into a platform library, which is `platform`'s and not this wave —
// and the migration that adds it later is additive and small.
//
// ★ A FAMILY IS A SHAPE; THE COPY IS PER KEY. The eight names are the owner's
// (`DEC-082`) and each is a layout: what a message of that kind looks like.
// What it SAYS differs per message, which is why `DESIGN_FOR` maps 25 keys to
// eight shapes and each key carries its own words — a 7-day reminder and a
// 2-hour one share a shape and say different things.
//
// ★ EVERY BLOCK HAS AN `id`. `readDocument()` refuses a block without one
// (`designer`'s injection read), so a design missing one would be silently
// dropped at render time. They are authored here, so a missing id is a type
// error rather than a mail with a row missing.
//
// ★ AND SINCE M13 THEY ARE WHAT AN UNTOUCHED ORG SENDS (`DEC-081`). `DEC-161`
// R3 kept adoption explicit «until M13»; the string path has left, so a key
// with no row renders its design here, and an admin duplicates one only to
// EDIT it. A row whose `blocks` is null is an admin's own text, framed by
// `documentFromText()` below — never replaced by a design.

export type DesignFamily =
  | "announcement"
  | "reminder"
  | "rsvp"
  | "rescheduled"
  | "cancelled"
  | "rating"
  | "certificate"
  | "recognition";

/** The eight, in the order `REQ-NTF-014` lists them. */
export const DESIGN_FAMILIES: readonly DesignFamily[] = [
  "announcement",
  "reminder",
  "rsvp",
  "rescheduled",
  "cancelled",
  "rating",
  "certificate",
  "recognition",
];

/**
 * ★ WHICH SHAPE EACH MESSAGE WEARS — all 25, and the stretches are named.
 *
 * Six messages have no session, and they sit under the family whose SHAPE they
 * share rather than under a name that describes their occasion:
 *   · `proposal_approved`, `copresenter_invited` → **announcement** («good
 *     news, one thing to open»; the session card is omitted when the payload
 *     carries no `session_id`, which is a compiler rule, not a second design).
 *   · `proposal_submitted`, `proposal_changes`   → **rating** («a request for
 *     an action: heading, a short paragraph, one button»).
 *   · `proposal_rejected`, `role_changed`, `account_deactivated` →
 *     **cancelled** («a change with a reason and no primary action»).
 *   · `export_ready` → **certificate** («something of yours is ready, here is
 *     the link»).
 */
export const DESIGN_FOR: Readonly<Record<string, DesignFamily>> = {
  "MSG-session_published": "announcement",
  "MSG-presenter_assigned": "announcement",
  "MSG-proposal_approved": "announcement",
  "MSG-copresenter_invited": "announcement",
  // ★ 0213 (REQ-ADM-025, DEC-267): an org's own announcement going live — no session, so the card drops.
  "MSG-announcement_published": "announcement",

  "MSG-reminder_7d": "reminder",
  "MSG-reminder_1d": "reminder",
  "MSG-reminder_2h": "reminder",
  "MSG-reminder_generic": "reminder",
  "MSG-materials_added": "reminder",

  "MSG-rsvp_promoted": "rsvp",
  "MSG-session_changed": "rescheduled",

  "MSG-session_cancelled": "cancelled",
  "MSG-proposal_rejected": "cancelled",
  "MSG-role_changed": "cancelled",
  "MSG-account_deactivated": "cancelled",

  "MSG-rating_prompt": "rating",
  "MSG-proposal_submitted": "rating",
  "MSG-proposal_changes": "rating",
  "MSG-comment_reply": "rating",
  "MSG-mentioned": "rating",

  "MSG-certificate_issued": "certificate",
  "MSG-certificate_revoked": "certificate",
  "MSG-export_ready": "certificate",

  "MSG-badge_earned": "recognition",
  "MSG-level_reached": "recognition",
};

/** The words one message says, inside its family's shape. */
interface Copy {
  heading: string;
  body: string;
  /** The button's label, and the binding carrying its URL. Absent where the
   *  family has no primary action. */
  action?: { label: string; urlBinding: string };
}

const COPY: Readonly<Record<string, Copy>> = {
  "MSG-session_published": { heading: "جلسة جديدة", body: "نُشرت جلسة جديدة قد تهمّك.", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-presenter_assigned": { heading: "أُسندت إليك جلسة", body: "تجد موعدها ومكانها وتفاصيلها كاملة في صفحة الجلسة.", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-proposal_approved": { heading: "قُبل مقترحك", body: "قُبل مقترحك «{{title}}». سنتواصل معك لتحديد الموعد والمكان.", action: { label: "اعرض المقترح", urlBinding: "url" } },
  "MSG-announcement_published": { heading: "إعلان", body: "{{body}}", action: { label: "افتح المنصة", urlBinding: "url" } },
  "MSG-copresenter_invited": { heading: "دعوة للمشاركة في التقديم", body: "دعاك {{inviter}} للمشاركة في تقديم جلسة «{{title}}».", action: { label: "اعرض المقترح", urlBinding: "url" } },

  "MSG-reminder_7d": { heading: "جلستك بعد أسبوع", body: "{{day}}", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-reminder_1d": { heading: "جلستك غدًا", body: "{{day}}", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-reminder_2h": { heading: "جلستك بعد ساعتين", body: "{{day}}", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-reminder_generic": { heading: "تذكير بجلستك القادمة", body: "{{day}}", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-materials_added": { heading: "أُضيفت مواد الجلسة", body: "أُضيفت مواد جديدة إلى جلسة حضرتها.", action: { label: "اعرض المواد", urlBinding: "url" } },

  "MSG-rsvp_promoted": { heading: "حصلت على مقعد", body: "توفّر مقعد وانتقلت من قائمة الانتظار إلى الحجز المؤكد. إن لم تعد تستطيع الحضور، ألغِ حجزك ليستفيد غيرك.", action: { label: "اعرض الجلسة", urlBinding: "url" } },

  "MSG-session_changed": { heading: "تغيّرت تفاصيل الجلسة", body: "تغيّرت تفاصيل جلسة حجزت مقعدًا فيها:", action: { label: "اعرض الجلسة", urlBinding: "url" } },

  "MSG-session_cancelled": { heading: "أُلغيت الجلسة", body: "أُلغيت جلسة «{{title}}» التي كانت في {{startsAt}}.\n\nالسبب: {{reason}}\n\nلا حاجة لأي إجراء منك؛ أُلغي حجزك تلقائيًا." },
  "MSG-proposal_rejected": { heading: "بخصوص مقترحك", body: "راجعنا مقترحك «{{title}}» ولم نتمكن من قبوله هذه المرة.\n\nالسبب: {{reason}}\n\nنرحّب بمقترح آخر منك في أي وقت." },
  "MSG-role_changed": { heading: "تغيّر دورك", body: "تغيّر دورك في {{org}} إلى «{{role}}».\n\nإن لم تكن تتوقع هذا، ردّ على هذه الرسالة." },
  "MSG-account_deactivated": { heading: "أُوقف حسابك", body: "أُوقف حسابك في {{org}}.\n\nالسبب: {{reason}}\n\nإن كان لديك سؤال، ردّ على هذه الرسالة." },

  "MSG-rating_prompt": { heading: "كيف كانت الجلسة؟", body: "رأيك يساعد المقدّم والمنظمين، ولا يستغرق دقيقة.", action: { label: "قيّم الجلسة", urlBinding: "url" } },
  "MSG-proposal_submitted": { heading: "مقترح جديد بانتظار المراجعة", body: "قدّم {{proposer}} مقترحًا جديدًا: «{{title}}».", action: { label: "راجع المقترح", urlBinding: "url" } },
  "MSG-proposal_changes": { heading: "نحتاج بعض التعديلات", body: "مقترحك «{{title}}» قريب من القبول، ونحتاج بعض التعديلات:\n\n{{reason}}", action: { label: "اعرض المقترح", urlBinding: "url" } },
  "MSG-comment_reply": { heading: "رد على تعليقك", body: "رد {{author}} على تعليقك في جلسة «{{title}}».", action: { label: "اعرض النقاش", urlBinding: "url" } },
  "MSG-mentioned": { heading: "ذُكرت في تعليق", body: "ذكرك {{name}} في تعليق على جلسة «{{title}}».", action: { label: "اعرض النقاش", urlBinding: "url" } },

  "MSG-certificate_issued": { heading: "صدرت شهادتك", body: "صدرت شهادتك عن جلسة حضرتها.", action: { label: "اعرض الشهادة", urlBinding: "url" } },
  "MSG-certificate_revoked": { heading: "بخصوص شهادتك", body: "سُحبت الشهادة رقم {{serial}}.\n\nالسبب: {{reason}}\n\nإن كان لديك سؤال، ردّ على هذه الرسالة." },
  "MSG-export_ready": { heading: "بياناتك جاهزة", body: "جهّزنا نسخة من بياناتك. الرابط صالح لمدة محدودة.", action: { label: "نزّل بياناتك", urlBinding: "url" } },

  "MSG-badge_earned": { heading: "حصلت على شارة", body: "حصلت على شارة «{{badge}}».", action: { label: "اعرض شاراتك", urlBinding: "url" } },
  "MSG-level_reached": { heading: "وصلت إلى مستوى جديد", body: "وصلت إلى مستوى «{{level}}».", action: { label: "اعرض نقاطك", urlBinding: "url" } },
};

/** The org's mark, or — when `logoUrl` is null — its NAME as a heading. The
 *  compiler drops an image with no URL, so this block is safe to include in
 *  every design (contract 9). */
const logo = (): EmailBlock => ({ type: "image", id: "logo", src: { kind: "org_logo" }, alt: "{{org}}", width: 160 });

/**
 * A family's LAYOUT, filled with one message's words.
 *
 * ★ `withImage` is asked for only where the card can have one. The **cancelled**
 * family never asks: `MSG-session_cancelled` lives there, and `/api/s/{id}/og`
 * 404s for a cancelled session (contract 8) — so a cancellation, the one mail a
 * member reads carefully, can never arrive with a broken image.
 */

/**
 * ★★ THE HOUSE STYLE — ONE CONSTANT, REFERENCED BY ALL EIGHT (wave 24,
 * `REQ-NTF-016`, `DEC-242` §0).
 *
 * The goal of the wave in one sentence: a message that lands in a member's
 * inbox looks like the product it came from. ★ Almost none of that is the block
 * list — it is the ground, the rhythm, the heading scale, the pill and the
 * accent, and those are document styles. So they live here, once.
 *
 * ★ WHY ONE CONSTANT AND NOT EIGHT INLINE COPIES. Wave 25 adds a NINTH designed
 * family — the invitation (`REQ-NTF-017`, `JOB-send_member_invitation`), which
 * `01-prd.md` describes as «in the same designed language as the eight
 * families». Eight copies would make that ninth «eight copies plus one», and the
 * first thing to drift would be the one nobody rendered beside the others.
 * Referencing this means the ninth inherits the house style by existing.
 *
 * Each value, and why it is that value:
 *
 *   · `ground: "canvas"` — the design's PAPER under the card, from the kit's
 *     `canvas`. The alternative, `neutral`, is a flat grey that belongs to no
 *     palette; `surface` would make the page and the card the same colour and
 *     lose the card entirely.
 *   · `padding: 32` — the top of the closed scale. The design is generous and a
 *     mail at 560 px can afford it; `16` is the phone's, below.
 *   · `headingSize.h1: 28` — ★ also the top of the closed scale, and NOT the
 *     display scale's 30/34 (`02-typography.md`). 28 is the closest honest
 *     mapping and the gap is recorded rather than closed: widening the scale
 *     would change a control an admin picks from (`DEC-242` §6 freezes the
 *     builder's chrome). `h2: 21` is set although no design uses an `h2` today,
 *     because this is the house STYLE SHEET — an admin who duplicates a design
 *     and adds a subheading should get the house size, not the default.
 *   · `button.shape: "pill"` — `--radius-pill`, which every button in the
 *     product wears.
 *
 * ★★ AND NO `mobile` LEG, WHICH IS A DECISION AND NOT AN OMISSION.
 *
 * `mobile` is the only style that reaches the HTML as a `<style>` media query
 * and two `class=` attributes (`mobileCss()`, and `shell()`'s `k-card`). Wave 23
 * built it for an admin who asks for it, and **no platform design has ever used
 * it**: every message this product has sent is inline-only, which
 * `tests/unit/mail-render.test.ts` states as one of «the constraints email
 * clients impose» — every rule that draws anything is inline, because a client
 * that strips `<style>` then changes nothing. Putting a mobile leg on all 25
 * messages would spend that property, and on measuring what it buys, it buys
 * very little:
 *
 *   · the heading needs no phone size. `02-typography.md`'s `title` is **28 on a
 *     phone** and 32 on desktop — so 28 IS the design's phone value, and the
 *     desktop 32 is the gap the closed scale cannot reach either way.
 *   · the padding would go 32 → 16, which at 390 px is 326 px of content against
 *     358 px. Arabic body at 17 px reads at about thirty characters a line
 *     either way.
 *
 * So: generous padding at every width, inline-only kept for all 25, and the one
 * real gap — a 32 px desktop heading — recorded rather than traded for a
 * media query. An admin who wants a phone leg still has the panel.
 *
 * ★ WHAT IS DELIBERATELY ABSENT. `textColour` and `linkColour`: the compiler
 * already uses `fgBody` and `fgMuted`, and the design has one text colour per
 * ground, so naming them would be a no-op that looks like a decision. And no
 * token for a RAISED ground — the design's surface-2 is `canvasRaise`, which
 * `PaletteToken` does not carry (`blocks.ts`), so a tinted inset is **not
 * drawable in mail and is not faked with `edge`**: that would be a hairline
 * colour used as a fill, which is the kind of substitution that reads as a
 * token meaning two things. Named, not worked around.
 */
/** The greeting, once — the `recognition` family builds its own heading pair so
 *  it can centre it, and a second literal there would be the first thing to
 *  drift from the other seven. */
const GREETING = "مرحبًا {{member.name}}،";

const HOUSE: EmailStyles = {
  ground: "canvas",
  padding: 32,
  headingSize: { h1: 28, h2: 21 },
  button: { shape: "pill" },
};

function layout(family: DesignFamily, copy: Copy): EmailBlock[] {
  // ★ The heading, then the member by name — every string template greeted
  // since M3, and `notify-jobs.test.ts` holds the sent mail to it. The designs
  // dropped the greeting while only adopters received them; the retirement
  // makes them every member's mail, so it comes back as a block an org may
  // edit or remove (`DEC-081`).
  const heading: EmailBlock[] = [
    { type: "heading", id: "h", text: copy.heading, level: 1 },
    { type: "paragraph", id: "greeting", text: GREETING },
  ];
  const body: EmailBlock = { type: "paragraph", id: "body", text: copy.body };
  // ★ Typed as the button MEMBER, not as `EmailBlock`: a family that adds a
  // block style to it (the `recognition` one centres it) would otherwise spread
  // the whole union, where `style` is the button's primary/secondary rather than
  // a `BlockStyle`. The narrower type is what makes that a compile error instead
  // of a cast.
  const cta: Extract<EmailBlock, { type: "button" }> | null = copy.action
    ? { type: "button", id: "cta", label: copy.action.label, urlBinding: copy.action.urlBinding, style: "primary" }
    : null;
  const button: EmailBlock[] = cta ? [cta] : [];

  switch (family) {
    case "announcement":
      return [logo(), ...heading, body, { type: "session_card", id: "card", withImage: true }, ...button];
    case "reminder":
      return [logo(), ...heading, { type: "session_card", id: "card", withImage: true }, body, ...button];
    case "rsvp":
      return [logo(), ...heading, { type: "session_card", id: "card", withImage: true }, body, ...button];
    case "rescheduled":
      // The change block is the point of this one: `{{changes}}` is the
      // renderer's pre-built «old ← new» (`08` §3.3, `REQ-SES-009`).
      //
      // ★ Wave 24: it is framed by two hairlines so it reads as a block rather
      // than as another paragraph — the treatment a tinted inset would give it
      // if mail had a raised token, done with the one the vocabulary has. A
      // `divider` writes no line into the text alternative, so the plain part is
      // unchanged.
      return [
        logo(),
        ...heading,
        body,
        { type: "divider", id: "changes-top" },
        { type: "paragraph", id: "changes", text: "{{changes}}" },
        { type: "divider", id: "changes-end" },
        { type: "session_card", id: "card" },
        ...button,
      ];
    case "cancelled":
      // No image, and no primary action: an ending with a reason.
      //
      // ★ Wave 24: the reason gets room after it, because this is the one mail a
      // member reads carefully and it ends here — there is no action below to
      // separate it from.
      return [logo(), ...heading, { ...body, style: { padBottom: 24 } }];
    case "rating":
      return [logo(), ...heading, body, ...button];
    case "certificate":
      return [logo(), ...heading, body, { type: "detail_list", id: "meta", items: [{ label: "رقم الشهادة", value: "{{serial}}" }] }, ...button];
    case "recognition": {
      // ★ Wave 24: the one celebratory family, so the heading, the words and the
      // action are centred. `center` is `center` in both directions, so it needs
      // no logical/physical thought — unlike `start`, which the compiler maps to
      // the right edge of an RTL mail.
      const centred = { align: "center" } as const;
      return [
        logo(),
        { type: "heading", id: "h", text: copy.heading, level: 1, style: centred },
        { type: "paragraph", id: "greeting", text: GREETING },
        { type: "paragraph", id: "body", text: copy.body, style: centred },
        ...(cta ? [{ ...cta, blockStyle: centred }] : []),
      ];
    }
  }
}

/** The designed document for one message key, or null for a key with none. */
/**
 * ★ WAVE 25 — THE ONE MAIL THAT IS NOT A MATRIX MESSAGE (`REQ-NTF-017`, `DEC-243` §6, `DEC-244` §8).
 *
 * A person an admin added is told that they belong, with a link that signs them in. It is NOT a
 * twenty-sixth key and it is deliberately absent from `DESIGN_FOR` and `COPY`:
 *
 *   · the matrix resolves a preference, an inbox row and an address from a member id, and
 *     «you have been added» is not a message anybody may switch off (`08` §3.2a);
 *   · a twenty-sixth key would move `DESIGN_FOR`'s count, the template table and all 120 pinned
 *     files — `tests/unit/mail-designs.test.ts` holds the map at exactly 25 and to the template
 *     table, and that pin is the thing keeping the two from drifting.
 *
 * It wears the **announcement** family, which is the shape «good news, one thing to open» — the
 * same vocabulary, the same `HOUSE` style, so it is the product's mail and not a second look. The
 * worker passes it as a template override, which `emailDocumentFor()` honours ahead of
 * `platformDesign()`, so no key lookup happens at all.
 */
export const INVITATION_SUBJECT = "دعوة للانضمام إلى {{org}}";

export function invitationDesign(): EmailBlockDocument {
  const copy: Copy = {
    heading: "أنت الآن عضو",
    body: "أضافك مشرف {{org}} إلى المنصة. سجّل الدخول بحساب Google على البريد الذي وصلتك عليه هذه الرسالة.",
    action: { label: "سجّل الدخول", urlBinding: "url" },
  };
  return { schemaVersion: SCHEMA_VERSION, blocks: layout("announcement", copy), styles: HOUSE };
}

export function platformDesign(key: string): EmailBlockDocument | null {
  const family = DESIGN_FOR[key];
  const copy = COPY[key];
  if (!family || !copy) return null;
  const blocks = layout(family, copy);
  // `certificate` carries a serial row that only two of its three keys have;
  // an unresolved `{{serial}}` renders blank and the compiler drops a detail
  // row whose value is empty — so the row is dropped for `MSG-export_ready`
  // without a second layout.
  // ★ The house style, on every design (wave 24). `readStyles()` reads it back
  // through the same enum checks an admin's own styles go through, so a
  // duplicated design carries it and `fromDocument()`/`toDocument()` round-trip
  // it unchanged.
  return { schemaVersion: SCHEMA_VERSION, blocks, styles: HOUSE };
}

/**
 * ★ AN ADMIN'S EDITED STRING TEMPLATE, IN THE DESIGN'S FRAME — `DEC-081`'s
 * retirement, `REQ-NTF-007` kept.
 *
 * A row whose `blocks` is null exists only because an admin wrote it: nothing
 * seeds `notification_templates`, and «restore default» deletes. So when the
 * string path left, those words could be converted, discarded or refused — and
 * discarding an admin's words for a platform design is a regression, not a
 * cleanup. They are converted, at render time, and never written back:
 *
 *   · one `paragraph` per blank-line-separated paragraph of the body — the
 *     split `toParagraphs()` always applied — with the admin's text as its
 *     template, bindings intact and interpolated per member as before;
 *   · after the logo, which every design carries, and before the composed
 *     footer, which `compileBlocks()` appends to every document;
 *   · no heading, no button, no card: the admin wrote none.
 *
 * «حوّله إلى تصميم» (`convertTemplateToDesign`) stores the same paragraphs, so
 * converting in the editor does not change the mail an org already receives.
 */
export function documentFromText(body: string): EmailBlockDocument {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text, index): EmailBlock => ({ type: "paragraph", id: `p${index + 1}`, text }));
  return { schemaVersion: SCHEMA_VERSION, blocks: [logo(), ...paragraphs] };
}
