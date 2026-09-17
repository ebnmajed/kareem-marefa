import { SAMPLE_BRAND, SAMPLE_CASES, SAMPLE_MEMBER, SAMPLE_ORG, type SampleCase } from "@kareem/mail-runtime";

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
export type PinnedCase = SampleCase;
export const ORG = SAMPLE_ORG;
export const MEMBER = SAMPLE_MEMBER;
export const BRAND = SAMPLE_BRAND;
export const CASES: readonly PinnedCase[] = SAMPLE_CASES;

/** The four parts pinned per case. The subject and the text part are rendered
 *  once: `renderEmail()` computes both before `toHtml()` and passes `brand`
 *  only to `toHtml()`, so neither can depend on it — a fact
 *  `mail-pinned.test.ts` asserts rather than assumes. */
export const PART_SUFFIXES = [".subject.txt", ".txt", ".brand.html", ".plain.html"] as const;
