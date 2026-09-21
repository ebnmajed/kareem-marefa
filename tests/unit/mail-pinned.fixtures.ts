import { renderEmail, sampleFor, SAMPLE_BRAND, SAMPLE_CASES, SAMPLE_MEMBER, SAMPLE_ORG, type RenderInput, type SampleCase } from "@kareem/mail-runtime";

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

// ★ THE SAMPLE DATA LIVES IN THE PACKAGE, and this file re-exports it.
//
// The preview an admin approves and the files this suite pins must render the
// SAME payloads, or the preview is a picture of something nobody pins and the
// pin is a record of something nobody sees. So `SAMPLE_CASES` is in
// `@kareem/mail-runtime`, imported by both, and a second sample set cannot
// quietly appear — which is the defect class this wave has already found three
// times.
//
// The values are unchanged by the move, and the 116 files under
// `tests/unit/mail-pinned/` are what proves it.
export type PinnedCase = SampleCase & {
  /** An org's own row for the key. Absent: the org has none, which is every
   *  untouched org. */
  override?: RenderInput["override"];
};
export const ORG = SAMPLE_ORG;
export const MEMBER = SAMPLE_MEMBER;
export const BRAND = SAMPLE_BRAND;

// ★ WAVE 11 — THE STRING PATH RETIRED (`DEC-081`). Every key now renders a
// design, and a design without an origin drops its button and its preference
// link — so pinning without one would record a mail nobody sends. The origin
// is a constant; the logo is given to the BRANDED render only, so the plain
// render pins the no-logo branch. Neither reaches the text part's
// brand-independence: the logo block writes no text.
export const APP_URL = "https://app.kareem.example";
export const LOGO_URL = `${APP_URL}/api/brand/66666666-6666-4666-8666-666666666666/logo`;

// ★ AN ADMIN'S EDITED STRING TEMPLATE — `REQ-NTF-007` kept through the
// retirement. The row's own words, in the design's frame; its own subject.
// It lives here and not in `SAMPLE_CASES`, so the preview's samples do not
// change: this is a row, not sample data.
const ORG_TEXT: PinnedCase = {
  id: "MSG-reminder_1d.org-text",
  key: "MSG-reminder_1d",
  payload: sampleFor("MSG-reminder_1d")!.payload,
  override: {
    subject: "غدًا: {{title}}",
    body: "أهلًا {{member.name}}،\n\nنلتقي غدًا في «{{title}}»، {{startsAt}}، في {{venue}}.\n\nأحضر أسئلتك.\n{{url}}",
    blocks: null,
  },
};

export const CASES: readonly PinnedCase[] = [...SAMPLE_CASES, ORG_TEXT];

/** The one way a pinned part is rendered — the writer and the comparison share
 *  it, so the two cannot disagree about the inputs. */
export function renderPinned(sample: PinnedCase, variant: "brand" | "plain") {
  return renderEmail({
    key: sample.key,
    override: sample.override ?? null,
    payload: sample.payload,
    member: sample.member ?? MEMBER,
    org: ORG,
    brand: variant === "brand" ? BRAND : null,
    logoUrl: variant === "brand" ? LOGO_URL : null,
    appUrl: APP_URL,
  });
}

/** The four parts pinned per case. The subject and the text part are pinned
 *  once: neither depends on the brand or the logo — a fact
 *  `mail-pinned.test.ts` asserts rather than assumes. */
export const PART_SUFFIXES = [".subject.txt", ".txt", ".brand.html", ".plain.html"] as const;
