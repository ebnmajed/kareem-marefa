// The built-in Arabic email templates — 08 §3.2, REQ-NTF-002 ("every matrix
// row has an Arabic template").
//
// These are the DEFAULTS. An org admin's edits live in
// `notification_templates` and win where a row exists (REQ-NTF-007); these are
// what a brand-new org sends on its first day, and the fallback if an admin
// deletes a row. Written in Arabic, not translated into it — invariant 10.
//
// `{{path}}` is resolved against the notification payload. `render.ts` keeps
// the interpolation deliberately logic-free: no conditionals, no loops. The
// one template that needs a variable-length block, MSG-session_changed, gets
// it as a single pre-built `{{changes}}` value, so "only changed lines render"
// (08 §3.3) is a property of how that block is assembled rather than of a
// template language nobody can test.

export interface EmailTemplate {
  subject: string;
  /** Plain text. Paragraphs separated by a blank line; `render.ts` turns it
   *  into both the text/plain part and the RTL HTML one. */
  body: string;
}

const SIGN_OFF = "كريم معرفة · شارك المعرفة.. واصنع الأثر";

const greeting = "مرحبًا {{member.name}}،";

/** Every message 08 §1 gives an email channel — 24 of them — keyed by `MSG-*`. */
export const DEFAULT_TEMPLATES: Readonly<Record<string, EmailTemplate>> = {
  // 08 §3.2 lists 22 templates; 08 §1 gives 24 messages an email channel.
  // MSG-proposal_submitted and MSG-presenter_assigned are in the matrix with
  // an email channel and missing from the template table, which
  // REQ-NTF-002's "every matrix row has an Arabic template" does not allow.
  // Written here rather than left blank; flagged to the lead for 08.
  "MSG-proposal_submitted": {
    subject: "مقترح جديد بانتظار المراجعة — {{title}}",
    body: `${greeting}\n\nقدّم {{proposer}} مقترحًا جديدًا:\n\n«{{title}}»\nالتصنيف: {{category}}\n\n{{url}}`,
  },
  "MSG-proposal_approved": {
    subject: "تم قبول مقترحك — {{title}}",
    body: `${greeting}\n\nقُبل مقترحك «{{title}}». سنتواصل معك لتحديد الموعد والمكان.\n\n{{url}}`,
  },
  "MSG-proposal_rejected": {
    subject: "بخصوص مقترحك — {{title}}",
    body: `${greeting}\n\nراجعنا مقترحك «{{title}}» ولم نتمكن من قبوله هذه المرة.\n\nالسبب: {{reason}}\n\nنرحّب بمقترح آخر منك في أي وقت.\n\n{{url}}`,
  },
  "MSG-proposal_changes": {
    subject: "نحتاج بعض التعديلات على مقترحك",
    body: `${greeting}\n\nمقترحك «{{title}}» قريب من القبول، ونحتاج بعض التعديلات:\n\n{{reason}}\n\n{{url}}`,
  },
  "MSG-copresenter_invited": {
    subject: "دعوة للمشاركة في تقديم جلسة",
    body: `${greeting}\n\nدعاك {{inviter}} للمشاركة في تقديم جلسة «{{title}}».\n\nتستطيع القبول أو الاعتذار من صفحة المقترح.\n\n{{url}}`,
  },
  "MSG-session_published": {
    subject: "جلسة جديدة: {{title}}",
    body: `${greeting}\n\nنُشرت جلسة جديدة:\n\n«{{title}}»\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{url}}`,
  },
  "MSG-presenter_assigned": {
    subject: "أُسندت إليك جلسة — {{title}}",
    body: `${greeting}\n\nأُسندت إليك جلسة «{{title}}».\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\nتستطيع القبول أو الاعتذار من صفحة الجلسة.\n\n{{url}}`,
  },
  // 08 §3.3's worked example — the one that matters most operationally,
  // because a vague version sends people to the wrong room.
  "MSG-session_changed": {
    subject: "تغيّرت تفاصيل جلسة «{{title}}»",
    body: `${greeting}\n\nتغيّرت تفاصيل جلسة «{{title}}» التي حجزت مقعدًا فيها:\n\n{{changes}}\n\n{{url}}`,
  },
  "MSG-session_cancelled": {
    subject: "أُلغيت جلسة {{title}}",
    body: `${greeting}\n\nأُلغيت جلسة «{{title}}» التي كانت في {{startsAt}}.\n\nالسبب: {{reason}}\n\nلا حاجة لأي إجراء منك؛ أُلغي حجزك تلقائيًا.`,
  },
  "MSG-rsvp_promoted": {
    subject: "حصلت على مقعد في {{title}}",
    body: `${greeting}\n\nتوفّر مقعد وانتقلت من قائمة الانتظار إلى الحجز المؤكد في جلسة «{{title}}».\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\nإن لم تعد تستطيع الحضور، ألغِ حجزك ليستفيد غيرك.\n\n{{url}}`,
  },
  // ★ WAVE 9 (REQ-SES-015): `{{day}}` is «اليوم الثاني من 3» when the session
  // has several meetings and the EMPTY STRING when it has one, which
  // `toParagraphs()` then drops — so a one-day reminder is the mail M3
  // shipped, paragraph for paragraph. Same mechanism as `{{tasks}}`: the
  // templates have no conditionals, so a block that may be absent is a value
  // that may be empty (`render.ts`'s `dayBlock`).
  "MSG-reminder_7d": {
    subject: "بعد أسبوع: {{title}}",
    body: `${greeting}\n\nتذكير: جلسة «{{title}}» بعد أسبوع.\n\n{{day}}\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{tasks}}\n\n{{url}}`,
  },
  "MSG-reminder_1d": {
    subject: "غدًا: {{title}}",
    body: `${greeting}\n\nجلسة «{{title}}» غدًا.\n\n{{day}}\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{tasks}}\n\n{{url}}`,
  },
  "MSG-reminder_2h": {
    subject: "بعد ساعتين: {{title}}",
    body: `${greeting}\n\nجلسة «{{title}}» بعد ساعتين.\n\n{{day}}\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{url}}`,
  },
  // 08 §1.2's fourth, offset-agnostic reminder (DEC-047, migration 0062): any
  // org offset outside ±20% of the three fixed ones. Names no distance, so it
  // is honest at every offset.
  "MSG-reminder_generic": {
    subject: "تذكير: {{title}}",
    body: `${greeting}\n\nتذكير بجلسة «{{title}}» القادمة.\n\n{{day}}\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{tasks}}\n\n{{url}}`,
  },
  "MSG-rating_prompt": {
    subject: "كيف كانت جلسة {{title}}؟",
    body: `${greeting}\n\nحضرت جلسة «{{title}}». رأيك يساعد المقدّم والمنظمين، ولا يستغرق دقيقة.\n\n{{url}}`,
  },
  "MSG-materials_added": {
    subject: "أُضيفت مواد جلسة {{title}}",
    body: `${greeting}\n\nأُضيفت مواد جديدة إلى جلسة «{{title}}» التي حضرتها.\n\n{{url}}`,
  },
  "MSG-comment_reply": {
    subject: "رد على تعليقك",
    body: `${greeting}\n\nرد {{author}} على تعليقك في جلسة «{{title}}».\n\n{{url}}`,
  },
  "MSG-mentioned": {
    subject: "ذكرك {{name}} في تعليق",
    body: `${greeting}\n\nذكرك {{name}} في تعليق على جلسة «{{title}}».\n\n{{url}}`,
  },
  "MSG-badge_earned": {
    subject: "حصلت على شارة {{badge}}",
    body: `${greeting}\n\nحصلت على شارة «{{badge}}».\n\n{{url}}`,
  },
  "MSG-level_reached": {
    subject: "وصلت إلى مستوى {{level}}",
    body: `${greeting}\n\nوصلت إلى مستوى «{{level}}».\n\n{{url}}`,
  },
  "MSG-certificate_issued": {
    subject: "شهادتك من {{org}}",
    body: `${greeting}\n\nصدرت شهادتك عن جلسة «{{title}}».\n\nرقم الشهادة: {{serial}}\n\n{{url}}`,
  },
  "MSG-certificate_revoked": {
    subject: "بخصوص شهادتك {{serial}}",
    body: `${greeting}\n\nسُحبت الشهادة رقم {{serial}}.\n\nالسبب: {{reason}}\n\nإن كان لديك سؤال، ردّ على هذه الرسالة.`,
  },
  "MSG-role_changed": {
    subject: "تغيّر دورك في {{org}}",
    body: `${greeting}\n\nتغيّر دورك في {{org}} إلى «{{role}}».\n\nإن لم تكن تتوقع هذا، ردّ على هذه الرسالة.`,
  },
  "MSG-account_deactivated": {
    subject: "تم إيقاف حسابك",
    body: `${greeting}\n\nأُوقف حسابك في {{org}}.\n\nالسبب: {{reason}}\n\nإن كان لديك سؤال، ردّ على هذه الرسالة.`,
  },
  "MSG-export_ready": {
    subject: "بياناتك جاهزة للتحميل",
    body: `${greeting}\n\nجهّزنا نسخة من بياناتك. الرابط صالح لمدة محدودة.\n\n{{url}}`,
  },
};

export const SIGNATURE = SIGN_OFF;

/** Whether 08 §1 says this message has an email channel AND a template exists
 *  for it. A matrix row with no template is a `REQ-NTF-002` violation, and the
 *  test that catches it is tests/unit/mail-render.test.ts, which reads the
 *  matrix out of the promoted migration rather than out of this file. */
export function defaultTemplate(key: string): EmailTemplate | null {
  return DEFAULT_TEMPLATES[key] ?? null;
}
