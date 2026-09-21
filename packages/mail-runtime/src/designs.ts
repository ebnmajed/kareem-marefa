import { SCHEMA_VERSION, type EmailBlock, type EmailBlockDocument } from "./blocks.js";

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
// ★ AND THE ADOPTION IS EXPLICIT (`DEC-161` R3). Nothing here is applied to an
// org automatically: a key with no row, or a row whose `blocks` is null, still
// renders the pinned STRING bytes. An admin duplicates a design to own it.
// That is what keeps «an org that has not touched its templates sends
// byte-identical mail» true while the library exists.

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
  "MSG-presenter_assigned": { heading: "أُسندت إليك جلسة", body: "تستطيع القبول أو الاعتذار من صفحة الجلسة.", action: { label: "اعرض الجلسة", urlBinding: "url" } },
  "MSG-proposal_approved": { heading: "قُبل مقترحك", body: "قُبل مقترحك «{{title}}». سنتواصل معك لتحديد الموعد والمكان.", action: { label: "اعرض المقترح", urlBinding: "url" } },
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
function layout(family: DesignFamily, copy: Copy): EmailBlock[] {
  const heading: EmailBlock = { type: "heading", id: "h", text: copy.heading, level: 1 };
  const body: EmailBlock = { type: "paragraph", id: "body", text: copy.body };
  const button: EmailBlock[] = copy.action
    ? [{ type: "button", id: "cta", label: copy.action.label, urlBinding: copy.action.urlBinding, style: "primary" }]
    : [];

  switch (family) {
    case "announcement":
      return [logo(), heading, body, { type: "session_card", id: "card", withImage: true }, ...button];
    case "reminder":
      return [logo(), heading, { type: "session_card", id: "card", withImage: true }, body, ...button];
    case "rsvp":
      return [logo(), heading, { type: "session_card", id: "card", withImage: true }, body, ...button];
    case "rescheduled":
      // The change block is the point of this one: `{{changes}}` is the
      // renderer's pre-built «old ← new» (`08` §3.3, `REQ-SES-009`).
      return [logo(), heading, body, { type: "paragraph", id: "changes", text: "{{changes}}" }, { type: "session_card", id: "card" }, ...button];
    case "cancelled":
      // No image, and no primary action: an ending with a reason.
      return [logo(), heading, body];
    case "rating":
      return [logo(), heading, body, ...button];
    case "certificate":
      return [logo(), heading, body, { type: "detail_list", id: "meta", items: [{ label: "رقم الشهادة", value: "{{serial}}" }] }, ...button];
    case "recognition":
      return [logo(), heading, body, ...button];
  }
}

/** The designed document for one message key, or null for a key with none. */
export function platformDesign(key: string): EmailBlockDocument | null {
  const family = DESIGN_FOR[key];
  const copy = COPY[key];
  if (!family || !copy) return null;
  const blocks = layout(family, copy);
  // `certificate` carries a serial row that only one of its three keys has;
  // the compiler drops a detail row whose label and value are both empty, and
  // an unresolved `{{serial}}` renders blank — so the row is dropped for
  // `MSG-export_ready` without a second layout.
  return { schemaVersion: SCHEMA_VERSION, blocks };
}
