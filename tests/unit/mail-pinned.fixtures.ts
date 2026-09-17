// N1 — the sample set the pinned mail is rendered from (`DEC-160` §4).
//
// ★ WHY THIS FILE EXISTS AT ALL. `DEC-081` and `REQ-NTF-009` promise that «the
// existing golden tests do not move» when the email studio lands. There are no
// such tests: the five `tests/unit/mail-*.test.ts` pin fragments by `toBe()`
// and diff the template table against the matrix, and nothing pins one whole
// rendered message. So «an org that has not touched its templates sends
// byte-identical mail» is a sentence and not a test until these files exist,
// which is why they are the wave's first commit — before the package move,
// before the block compiler, before a line of `render.ts` changes.
//
// ★ THE PAYLOADS ARE THE CALL SITES', NOT THE TEMPLATES'. Each payload below
// is what the function that sends that message actually passes to
// `public.notify()`, read out of the promoted migrations. The pin's value is
// that it freezes the mail members RECEIVE — so where a default template
// interpolates something no caller supplies, the pinned file shows the blank,
// deliberately:
//
//   · `{{url}}` is in 20 of the 25 default templates and is supplied by NO
//     caller anywhere in the product — `'url'` appears in zero migrations, in
//     no worker task's payload, and among neither `notify()`'s nor
//     `renderEmail()`'s injected keys. Every email sent since M3 ends where its
//     link should be. Named difference 1 fixes it; these files are what the fix
//     will be a reviewed diff over.
//   · `{{tasks}}` is the same, in the four reminders (`REQ-TSK-005`).
//   · `{{category}}` in `MSG-proposal_submitted` and `{{venue}}` in
//     `MSG-rsvp_promoted` are referenced by the template and absent from the
//     payload their trigger builds.
//
// ★ SEVEN KEYS HAVE NO SENDER. `MSG-materials_added`, `MSG-badge_earned`,
// `MSG-level_reached`, `MSG-certificate_revoked`, `MSG-role_changed`,
// `MSG-account_deactivated` and `MSG-export_ready` are in the matrix with an
// email channel and carry a template, and nothing in the product calls
// `notify()` with them. For those seven the payload below is the template's own
// bindings, filled realistically, and it is marked. When a sender is written
// the pinned file changes — which is the mechanism working, not a failure.

/** A pinned unit. Not a key: three renderer branches are worth freezing
 *  separately and each is a one-line case rather than a second key. */
export interface PinnedCase {
  /** The file stem. `<id>.subject.txt`, `<id>.txt`, `<id>.brand.html`, `<id>.plain.html`. */
  id: string;
  key: string;
  payload: Record<string, unknown>;
  /** Only where the case exists to pin a member-shaped branch. */
  member?: { name: string | null; email: string };
}

export const ORG = { name: "كريم معرفة", timeZone: "Asia/Riyadh" } as const;
export const MEMBER = { name: "سارة العتيبي", email: "sara@kareem.example" } as const;

/** An org's palette. None of the three values is one of `render.ts`'s
 *  fallbacks (`#1a1a1a`, `#6b6b6b`, `#ffffff`), so `<id>.brand.html` and
 *  `<id>.plain.html` differ in every digit and a brand that stopped being read
 *  would fail rather than quietly produce two identical files. */
export const BRAND = { fgBody: "#2b3a55", fgMuted: "#6f7d93", surface: "#fffdf7" } as const;

// Fixed ids. Nothing resolves them; they are in the payload because the real
// one carries them, and a uuid that changed per run would make every file move.
const SESSION = "11111111-1111-4111-8111-111111111111";
const PROPOSAL = "22222222-2222-4222-8222-222222222222";
const COMMENT = "33333333-3333-4333-8333-333333333333";
const RSVP = "44444444-4444-4444-8444-444444444444";
const CERTIFICATE = "55555555-5555-4555-8555-555555555555";

// Verbatim in the shape `select jsonb_build_object('startsAt', s.starts_at)`
// produces against the local database — microseconds, offset and all. 15:00
// UTC is 6:00 PM in Riyadh, which is what the pinned files must show
// (named difference 4, `DEC-151`).
const AT = "2026-10-01T15:00:00.123456+00:00";
const AT_MOVED = "2026-10-02T16:00:00.123456+00:00";

const TITLE = "الذكاء الاصطناعي في العمل";
const VENUE = "قاعة الابتكار";

export const CASES: readonly PinnedCase[] = [
  // ── 08 §1.1 proposals ────────────────────────────────────────────────────
  // `0039`'s proposals_notify(): proposal_id, title, proposer. No `category`,
  // which the template interpolates.
  { id: "MSG-proposal_submitted", key: "MSG-proposal_submitted", payload: { proposal_id: PROPOSAL, title: TITLE, proposer: "خالد المطيري" } },
  // The three decisions share one payload in `0039`: proposal_id, title and
  // the decision's reason — null on an approval, which renders blank.
  { id: "MSG-proposal_approved", key: "MSG-proposal_approved", payload: { proposal_id: PROPOSAL, title: TITLE, reason: null } },
  { id: "MSG-proposal_rejected", key: "MSG-proposal_rejected", payload: { proposal_id: PROPOSAL, title: TITLE, reason: "الموضوع قريب من جلسة قادمة" } },
  { id: "MSG-proposal_changes", key: "MSG-proposal_changes", payload: { proposal_id: PROPOSAL, title: TITLE, reason: "نحتاج تفصيل المحاور الثلاثة" } },
  { id: "MSG-copresenter_invited", key: "MSG-copresenter_invited", payload: { proposal_id: PROPOSAL, title: TITLE, inviter: "خالد المطيري" } },

  // ── 08 §1.2 sessions ─────────────────────────────────────────────────────
  { id: "MSG-session_published", key: "MSG-session_published", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE } },
  { id: "MSG-presenter_assigned", key: "MSG-presenter_assigned", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE } },
  // `0111`'s sessions_notify(): the session's own window and first venue in the
  // headline, and `changes` for what moved. The second entry's two values are
  // EQUAL and must not print — 08 §3.3, "only changed lines render".
  {
    id: "MSG-session_changed",
    key: "MSG-session_changed",
    payload: {
      session_id: SESSION,
      title: TITLE,
      startsAt: AT,
      venue: "قاعة ب",
      changes: [
        { field: "venue", from: "قاعة أ", to: "قاعة ب" },
        { field: "starts_at", from: AT, to: AT },
      ],
    },
  },
  // Wave 9: `changeLabel()`'s «الموعد · اليوم الثاني» — a three-day workshop
  // whose second evening moved. Without the qualifier this mail sends someone
  // to the right room on the wrong night (`REQ-SES-009`).
  {
    id: "MSG-session_changed.day2of3",
    key: "MSG-session_changed",
    payload: {
      session_id: SESSION,
      title: TITLE,
      startsAt: AT,
      venue: "قاعة ب",
      changes: [
        { field: "starts_at", from: AT, to: AT_MOVED, day: 2, days: 3 },
        { field: "venue", from: "قاعة أ", to: "قاعة ب", day: 2, days: 3 },
      ],
    },
  },
  // `0036`/`0111` send the OLD start — the moment the member had in their diary.
  { id: "MSG-session_cancelled", key: "MSG-session_cancelled", payload: { session_id: SESSION, title: TITLE, startsAt: AT, reason: "ظرف طارئ للمقدّم" } },

  // ── 08 §1.3 RSVP ─────────────────────────────────────────────────────────
  // `0034`'s rsvps_notify(): no `venue`, which the template interpolates.
  { id: "MSG-rsvp_promoted", key: "MSG-rsvp_promoted", payload: { session_id: SESSION, title: TITLE, startsAt: AT, rsvp_id: RSVP } },

  // ── 08 §1.2 reminders — `0110`, per day (wave 9) ─────────────────────────
  // `dayCount: 1` is the common session, and `dayBlock()` returns "" for it, so
  // `toParagraphs()` drops the line and the mail is the one M3 shipped.
  { id: "MSG-reminder_7d", key: "MSG-reminder_7d", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE, offset_minutes: 10080, dayPosition: 1, dayCount: 1 } },
  { id: "MSG-reminder_1d", key: "MSG-reminder_1d", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE, offset_minutes: 1440, dayPosition: 1, dayCount: 1 } },
  { id: "MSG-reminder_2h", key: "MSG-reminder_2h", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE, offset_minutes: 120, dayPosition: 1, dayCount: 1 } },
  // DEC-047's fourth, offset-agnostic message: any org offset outside ±20% of
  // the three fixed ones. 4320 minutes is three days.
  { id: "MSG-reminder_generic", key: "MSG-reminder_generic", payload: { session_id: SESSION, title: TITLE, startsAt: AT, venue: VENUE, offset_minutes: 4320, dayPosition: 1, dayCount: 1 } },
  // The other side of the same branch: «اليوم الثاني من 3», and the day's own
  // moment and room rather than the session's.
  { id: "MSG-reminder_1d.day2of3", key: "MSG-reminder_1d", payload: { session_id: SESSION, title: TITLE, startsAt: AT_MOVED, venue: "قاعة التدريب", offset_minutes: 1440, dayPosition: 2, dayCount: 3 } },

  // ── 08 §1.4 during and after ─────────────────────────────────────────────
  { id: "MSG-rating_prompt", key: "MSG-rating_prompt", payload: { session_id: SESSION, title: TITLE } },
  // `render.ts:320` — `member.name ?? member.email`. A member who has never set
  // a display name is greeted by address, and no existing test renders that end
  // to end.
  { id: "MSG-rating_prompt.no-display-name", key: "MSG-rating_prompt", payload: { session_id: SESSION, title: TITLE }, member: { name: null, email: "sara@kareem.example" } },
  // ★ no sender: the template's own bindings.
  { id: "MSG-materials_added", key: "MSG-materials_added", payload: { session_id: SESSION, title: TITLE } },
  { id: "MSG-comment_reply", key: "MSG-comment_reply", payload: { session_id: SESSION, title: TITLE, comment_id: COMMENT, author: "نورة القحطاني" } },
  { id: "MSG-mentioned", key: "MSG-mentioned", payload: { session_id: SESSION, title: TITLE, comment_id: COMMENT, name: "نورة القحطاني" } },

  // ── 08 §1.5 recognition and certificates ─────────────────────────────────
  // ★ no sender.
  { id: "MSG-badge_earned", key: "MSG-badge_earned", payload: { badge: "أول جلسة" } },
  // `escapeHtml()` as bytes rather than as a `toContain`. A badge name is admin
  // text, so this is the shape a hostile one would take.
  { id: "MSG-badge_earned.hostile", key: "MSG-badge_earned", payload: { badge: "<script>alert(1)</script>" } },
  // ★ no sender. A NUMBER, so `formatNumber()`'s Western digits are pinned —
  // `ar`'s CLDR default is `arab`, which DEC-124 forbids everywhere.
  { id: "MSG-level_reached", key: "MSG-level_reached", payload: { level: 7 } },
  // `0065`'s issue path: certificate_id, serial, kind. No `title` and no `url`,
  // both of which the template interpolates.
  { id: "MSG-certificate_issued", key: "MSG-certificate_issued", payload: { certificate_id: CERTIFICATE, serial: "KM-000001", kind: "attendance" } },
  // ★ no sender.
  { id: "MSG-certificate_revoked", key: "MSG-certificate_revoked", payload: { serial: "KM-000001", reason: "أُلغي الحضور بعد المراجعة" } },

  // ── 08 §1.6 account — all three have no sender ───────────────────────────
  { id: "MSG-role_changed", key: "MSG-role_changed", payload: { role: "منظّم" } },
  { id: "MSG-account_deactivated", key: "MSG-account_deactivated", payload: { reason: "بناءً على طلبك" } },
  // The template's only binding is `{{url}}`, which nothing supplies.
  { id: "MSG-export_ready", key: "MSG-export_ready", payload: {} },
];

/** The four parts pinned per case. The subject and the text part are rendered
 *  once: `renderEmail()` computes both before `toHtml()` and passes `brand`
 *  only to `toHtml()`, so neither can depend on it — a fact
 *  `mail-pinned.test.ts` asserts rather than assumes. */
export const PART_SUFFIXES = [".subject.txt", ".txt", ".brand.html", ".plain.html"] as const;
