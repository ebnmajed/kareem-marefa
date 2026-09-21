// The shared half of the frozen-routes suite (DEC-167): the refusal to run against a real
// project, the browser, and `check`. `scripts/qa.mjs` is the entry; the checks themselves live in
// `contract.mjs` (behaviour — blocking at every commit) and `appearance.mjs` (the design).

import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// CI runs Linux, so the browser is not where a Mac keeps it. CHROME_PATH wins.
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const BASE = "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ------------------------------------------------------------------------
   Refuse to run against a real Supabase project.

   This suite SUBMITS THE REGISTRATION FORM. The header above says "Supabase
   stubbed on :54321", but nothing enforced it: starting scripts/supabase-stub.mjs
   looks like enough, while `next start` quietly reads .env.local and posts to
   the production project instead. Nothing errors — the rows just land in the
   live `registrations` table, which is a frozen historical record
   (docs/plan/DECISIONS.md, DEC-002).

   That happened. This guard is why it cannot happen twice. Use `npm run qa`,
   which wires the stub for you.
------------------------------------------------------------------------- */
function resolveSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    const env = readFileSync(join(ROOT, ".env.local"), "utf8");
    return env.match(/^\s*SUPABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}
{
  const url = resolveSupabaseUrl();
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
  if (!local) {
    console.error(
      `\nREFUSING TO RUN.\n\n` +
        `  SUPABASE_URL resolves to: ${url || "(unset)"}\n` +
        `  This suite submits the registration form, so it must only ever run\n` +
        `  against the local stub — otherwise it writes rows to the live\n` +
        `  \`registrations\` table.\n\n` +
        `  Run \`npm run qa\`, which starts the stub and points the server at it.\n`,
    );
    process.exit(2);
  }
}

// Was hard-coded to one session's scratchpad, which throws ENOENT once that
// session ends. Resolve next to the repo and create it; QA_SHOTS overrides.
export const shots = process.env.QA_SHOTS ?? join(ROOT, ".qa-shots");
mkdirSync(shots, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
export function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

export const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-first-run",
    // CI runners cannot start Chrome's sandbox. Opt-in, so a developer machine
    // never silently drops it.
    ...(process.env.CHROME_NO_SANDBOX ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
  ],
});
// The invite button falls back to the clipboard when navigator.share is absent,
// which is the case in headless Chrome. Grant it so the fallback is testable.
await browser
  .defaultBrowserContext()
  .overridePermissions(BASE, ["clipboard-read", "clipboard-write"]);

export async function fresh(opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, ...opts });
  return page;
}

export const providerFieldsDisplay = (page) =>
  page.evaluate(
    () => getComputedStyle(document.querySelector(".provider-fields")).display,
  );

export function counts() {
  return { pass, fail };
}
