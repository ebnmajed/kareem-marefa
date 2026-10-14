#!/usr/bin/env node
// The seven approved emails, rendered from the sample set by the one renderer — `REQ-NTF-018`, `DEC-289`.
//
//   node scripts/mail-preview.mjs [outDir]        # writes <case>.html per designed message (default .qa-shots/emails)
//
// ★ IT RENDERS, IT NEVER SENDS. The files are what the dev preview (`/ar/ui/emails`) shows and what the captures in
// the PR are taken from. Images point at `APP_URL` (default http://localhost:3000) — the logo under `public/email/`,
// the poster's wide route and the QR route — so open them with the app running, or let the capture spec serve them.
// Sending a test to the local sink is the worker's: `npm --prefix worker run mail:previews -- you@example.com`.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail, SAMPLE_CASES, SAMPLE_MEMBER, SAMPLE_ORG } from "../packages/mail-runtime/dist/index.js";

export const DESIGNED = [
  ["new-session", "MSG-session_published"],
  ["booking-confirmed", "MSG-rsvp_confirmed"],
  ["reminder-week", "MSG-reminder_7d"],
  ["reminder-tomorrow", "MSG-reminder_1d"],
  ["activity-comment", "MSG-session_comment"],
  ["weekly-leaderboard", "MSG-leaderboard_weekly"],
  ["after-session", "MSG-check_in_confirmed.certificate"],
];

const out = process.argv[2] ?? join(process.cwd(), ".qa-shots", "emails");
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
for (const [name, id] of DESIGNED) {
  const sample = SAMPLE_CASES.find((c) => c.id === id);
  if (!sample) throw new Error(`no sample ${id}`);
  const r = renderEmail({
    key: sample.key,
    payload: sample.payload,
    member: sample.member ?? SAMPLE_MEMBER,
    org: SAMPLE_ORG,
    appUrl,
    unsubscribeUrl: `${appUrl}/ar/unsubscribe?t=preview`,
  });
  writeFileSync(join(out, `${name}.html`), r.html);
  writeFileSync(join(out, `${name}.txt`), `Subject: ${r.subject}\n\n${r.text}`);
  console.log(`${name}: ${r.subject}${r.dropped.length ? ` — dropped ${JSON.stringify(r.dropped)}` : ""}`);
}
