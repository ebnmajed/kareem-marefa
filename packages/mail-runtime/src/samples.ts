// The sample data every surface of the studio renders — REQ-NTF-010.
//
// ★ ONE SAMPLE SET, FOR THE SAME REASON THERE IS ONE RENDERER. The preview
// shows an admin what a message will look like; `tests/unit/mail-pinned/`
// records what it looks like today. If those two rendered DIFFERENT sample
// data, the preview would be a picture of something nobody pins and the pin
// would be a record of something nobody sees. So the payloads live here, in
// the package both of them import, and a second set cannot quietly appear —
// which is the defect class this wave has now found three times ({{url}},
// `session_card_image_url`, and the binding declaration itself).
//
// ★ THE PAYLOADS ARE THE CALL SITES', NOT THE TEMPLATES'. Each one is what the
// function that sends that message actually passes to `public.notify()`, read
// out of the promoted migrations — so the preview shows an admin the mail a
// member RECEIVES, blanks included, rather than an idealised one. Where a
// default template interpolates something no caller supplies, the sample shows
// the blank on purpose; `docs/plan/notes/notify.md` lists them.
//
// Moved here from `tests/unit/mail-pinned.fixtures.ts` with the values
// unchanged, and the 116 pinned files are what proves it.

/** One sample. Not a key: three renderer branches are worth freezing
 *  separately, and each is a one-line case rather than a second key. */
export interface SampleCase {
  /** The pin's file stem, and the preview's lookup. Equal to `key` for the
   *  plain sample; a variant suffixes it. */
  id: string;
  key: string;
  payload: Record<string, unknown>;
  /** Only where the sample exists to exercise a member-shaped branch. */
  member?: { name: string | null; email: string };
}

export const SAMPLE_ORG = { name: "كريم معرفة", timeZone: "Asia/Riyadh" } as const;
export const SAMPLE_MEMBER = { name: "سارة العتيبي", email: "sara@kareem.example" } as const;

/**
 * An org's OWN brand kit — the whole thing, both schemes, exactly the shape
 * `public.brand_kit()` returns and `send_notification.ts` passes.
 *
 * ★ WHY IT IS THE WHOLE KIT AND NOT THREE KEYS (wave 24, `REQ-NTF-016`).
 *
 * It was `{ fgBody, fgMuted, surface }` — a `LegacyBrand`, the shape the worker
 * sent before wave 10 and has not sent since. `compilePalette()` tests
 * `"light" in brand`, so that shape made the LIGHT scheme empty and
 * `fgHeading`, `edge`, `accent` and `canvas` ALL fall to `render.ts`'s own
 * sanitiser defaults. The 120 pinned files therefore recorded the renderer's
 * FALLBACK behaviour and not one byte of what a member receives — measured:
 * the old heading default appeared 138 times per variant, the edge default 43,
 * the ground default 60, none of them read from a kit.
 *
 * ★ It is also the exact disagreement this file's header exists to prevent.
 * The preview has always passed the full kit (`lib/dal/notifications.ts`, the
 * `brand_kit()` RPC), so the preview was a picture of something nobody pinned
 * and the pin a record of something nobody saw — for the brand, since wave 10.
 * One sample set cannot fix that while it carries a shape only the pins use.
 *
 * ★ AND EVERY VALUE DIFFERS FROM THE PLATFORM DEFAULT, DELIBERATELY. The old
 * comment kept the three off `render.ts`'s fallbacks «so a brand that stopped
 * being read would fail rather than quietly produce two identical files». Wave
 * 24 makes those fallbacks the platform default (`DEC-242` §2), so the same
 * guarantee now needs the whole kit to be an INVENTED org palette: were it the
 * platform's own values, `<id>.brand.html` and `<id>.plain.html` would become
 * byte-identical and the pin would stop proving the brand is read at all.
 * `tests/unit/mail-palette-default.test.ts` asserts that property rather than
 * leaving it to a reader's eye.
 *
 * ★ `node` is a gold on purpose. It is the one token the renderer paints the
 * primary button with (`DEC-242` §2 — the single accent), and today the button
 * is painted with the HEADING colour and labelled in a hard-coded white, so a
 * kit with no accent of its own could never show that. A real accent makes the
 * defect visible in the fixture: white on this gold is 1.93:1 and fails AA,
 * and the ink label that replaces it is 7.30:1. The pinned bytes record the
 * defect until that commit lands and the fix after it.
 *
 * ★ The `dark` scheme is here because `brand_kit()` returns it and the worker
 * passes it. The renderer reads the LIGHT scheme only — a mail declares
 * `color-scheme: light` on purpose (D3 finding F1) — so nothing below renders
 * a byte of it, and that it does not is worth pinning too.
 */
export const SAMPLE_BRAND = {
  light: {
    canvas: "#eef1f6",
    surface: "#fffdf7",
    canvasRaise: "#f7f9fc",
    fgHeading: "#1f2b44",
    fgBody: "#2b3a55",
    fgMuted: "#6f7d93",
    edge: "#d4dae6",
    edgeStrong: "#8a97ad",
    spine: "#c3cbda",
    node: "#e8b23a",
  },
  dark: {
    canvas: "#121826",
    surface: "#1b2235",
    canvasRaise: "#242d44",
    fgHeading: "#f2f5fa",
    fgBody: "#e6ecf5",
    fgMuted: "#9aa8bf",
    edge: "#2f3a52",
    edgeStrong: "#9aa8bf",
    spine: "#2f3a52",
    node: "#e8b23a",
  },
} as const;

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

export const SAMPLE_CASES: readonly SampleCase[] = [
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


/** The sample payload a preview renders for one message key — the FIRST case
 *  of that key, which is the plain one; the variants exist to pin renderer
 *  branches and are not what an admin should be shown. */
export function sampleFor(key: string): SampleCase | null {
  return SAMPLE_CASES.find((sample) => sample.key === key && sample.id === key) ?? SAMPLE_CASES.find((sample) => sample.key === key) ?? null;
}
