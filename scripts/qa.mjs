import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const shots = process.env.QA_SHOTS ?? join(ROOT, ".qa-shots");
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-first-run"],
});
// The invite button falls back to the clipboard when navigator.share is absent,
// which is the case in headless Chrome. Grant it so the fallback is testable.
await browser
  .defaultBrowserContext()
  .overridePermissions(BASE, ["clipboard-read", "clipboard-write"]);

async function fresh(opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, ...opts });
  return page;
}

const providerFieldsDisplay = (page) =>
  page.evaluate(
    () => getComputedStyle(document.querySelector(".provider-fields")).display,
  );

/* ---------------- 1. routing + locales ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  check("/ redirects to /ar", page.url() === `${BASE}/ar`);
  check(
    "AR page is rtl",
    await page.evaluate(
      () => document.documentElement.dir === "rtl" && document.documentElement.lang === "ar",
    ),
  );
  const headline = await page.$eval("h1", (el) => el.textContent);
  check("AR hero headline is the tagline", headline?.includes("شارك المعرفة"));

  // toggle from a subpage preserves the page
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('header a[href="/en/register"]'),
  ]);
  check("toggle on /register preserves the page", page.url() === `${BASE}/en/register`);
  check(
    "EN page is ltr",
    await page.evaluate(() => document.documentElement.dir === "ltr"),
  );

  await page.goto(`${BASE}/en`, { waitUntil: "networkidle0" });
  const transform = await page.evaluate(
    () => getComputedStyle(document.querySelector(".network-svg")).transform,
  );
  check("network SVG mirrored in LTR", transform.startsWith("matrix(-1"), transform);
  await page.screenshot({ path: `${shots}/qa-en-hero.png` });

  // wordmark visible & white on navy (the @theme inline fix)
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const color = await page.evaluate(
    () => getComputedStyle(document.querySelector("header a[href='/ar'] span")).color,
  );
  check("header wordmark is white on navy", color === "rgb(255, 255, 255)", color);
  await page.close();
}

/* ---------------- 2. conditional reveal + keep-but-hide ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  check("provider fields hidden initially", (await providerFieldsDisplay(page)) === "none");

  await page.click('label[for="reg-role-provider"]');
  check("provider fields revealed on provider", (await providerFieldsDisplay(page)) === "flex");

  await page.type("#reg-topic-title", "كيف اختصرنا وقت التقارير");
  await page.evaluate(() => document.getElementById("reg-category-technical").click());

  await page.click('label[for="reg-role-attendee"]');
  check("provider fields hidden again on attendee", (await providerFieldsDisplay(page)) === "none");

  await page.click('label[for="reg-role-provider"]');
  const kept = await page.$eval("#reg-topic-title", (el) => el.value);
  const catKept = await page.evaluate(() => document.getElementById("reg-category-technical").checked);
  check("topic title kept after role round-trip", kept === "كيف اختصرنا وقت التقارير", kept);
  check("category kept after role round-trip", catKept === true);
  await page.screenshot({ path: `${shots}/qa-provider-revealed.png`, fullPage: true });
  await page.close();
}

/* ---------------- 3. client validation ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });

  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]');
  const summaryLinks = await page.$$eval('[role="alert"] a', (as) => as.length);
  check("empty submit shows summary with role+name+email", summaryLinks === 3, `links=${summaryLinks}`);
  // The alert renders before React moves focus, so reading activeElement on the
  // next tick races it. Wait for the focus to land rather than sampling once.
  await page
    .waitForFunction(() => document.activeElement?.id === "reg-role-provider", { timeout: 3000 })
    .catch(() => {});
  const focused = await page.evaluate(() => document.activeElement?.id);
  check("focus moves to first invalid (role radio)", focused === "reg-role-provider", focused);
  await page.screenshot({ path: `${shots}/qa-error-summary.png`, fullPage: true });

  // on-blur email validation + reward-early clearing
  await page.type("#reg-email", "not-an-email");
  await page.evaluate(() => document.getElementById("reg-email").blur());
  await sleep(150);
  const emailErr = await page.$eval("#reg-email-error", (el) => el.textContent);
  check("email on-blur error appears", emailErr?.includes("البريد"), emailErr ?? "none");
  await page.click("#reg-email", { clickCount: 3 });
  await page.type("#reg-email", "sara@example.com");
  await sleep(150);
  check(
    "error clears while typing a fix",
    (await page.$("#reg-email-error")) === null,
  );
  await page.close();
}

/* ---------------- 4. submit paths: success / duplicate ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  await page.click('label[for="reg-role-attendee"]');
  await page.type("#reg-name", "سارة العتيبي");
  await page.type("#reg-email", "sara@example.com");
  await sleep(3300); // min-time-to-submit token
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="status"]', { timeout: 10000 });
  const title = await page.$eval('[role="status"] h2', (el) => el.textContent);
  check("attendee success panel", title?.includes("تم تسجيلك"), title ?? "");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  check("focus moved to success heading", focusedTag === "H2", focusedTag);
  // e748642 replaced the wa.me link with the native share sheet, so there is no
  // href to read. Stub navigator.share and capture what the app passes it —
  // that is the message itself, which is what the old href assertion was really
  // checking. Reading the clipboard instead would test browser plumbing, and is
  // flaky in headless because writeText needs the page to hold focus.
  const inviteBtn = await page.$('[role="status"] button[type="button"]');
  check("invite button present", Boolean(inviteBtn));
  await page.evaluate(() => {
    window.__shared = null;
    navigator.share = async (data) => {
      window.__shared = data;
    };
  });
  await inviteBtn.click();
  await page.waitForFunction(() => window.__shared !== null, { timeout: 3000 });
  const shared = await page.evaluate(() => window.__shared);
  check("invite message carries the page URL", shared.text.includes("/ar/register"), shared.text);
  check(
    // 725b79e put the link on its own line AFTER the copy, and passes it inside
    // `text` rather than as a separate `url` — iOS/WhatsApp hoist a separate
    // url above the RTL copy and wreck the reading order. Guard that shape.
    "invite link sits on its own line after the copy, not in a separate url field",
    /\n\S*\/ar\/register\s*$/.test(shared.text) && shared.url === undefined,
    JSON.stringify(shared),
  );
  await page.screenshot({ path: `${shots}/qa-success-attendee.png` });
  await page.close();
}
{
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  await page.click('label[for="reg-role-provider"]');
  await page.type("#reg-name", "يمان رضا");
  await page.type("#reg-email", "dup@example.com");
  await page.type("#reg-topic-title", "أتمتة التقارير الشهرية");
  await page.evaluate(() => document.getElementById("reg-category-technical").click());

  // description is required for providers: submitting without it must be blocked
  await sleep(3300);
  await page.click('button[type="submit"]');
  await sleep(400);
  const descErr = await page.$("#reg-topic-description-error");
  check("provider: empty description blocks submit", descErr !== null);

  await page.type("#reg-topic-description", "كيف اختصرنا وقت إعداد التقارير إلى النصف");
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="status"]', { timeout: 10000 });
  const title = await page.$eval('[role="status"] h2', (el) => el.textContent);
  check("duplicate shows info panel (already registered)", title?.includes("مسجّل"), title ?? "");
  await page.screenshot({ path: `${shots}/qa-duplicate.png` });
  await page.close();
}

/* ---------------- 5. progressive enhancement (no JS) ---------------- */
{
  const page = await fresh();
  await page.setJavaScriptEnabled(false);
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  check(
    "no-JS: provider reveal works via CSS",
    await page.evaluate(() => {
      document.getElementById("reg-role-provider").click();
      return getComputedStyle(document.querySelector(".provider-fields")).display === "flex";
    }),
  );
  // invalid submit → server round-trip must echo values back
  await page.type("#reg-name", "بدون جافاسكربت");
  await page.type("#reg-email", "broken-email");
  await page.type("#reg-topic-title", "موضوع تجريبي");
  await page.type("#reg-topic-description", "نبذة تجريبية عن الموضوع");
  await page.evaluate(() => document.getElementById("reg-category-technical").click());
  await sleep(3300);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  const nameEcho = await page.$eval("#reg-name", (el) => el.value);
  const emailErr = await page.$("#reg-email-error");
  check("no-JS: server error rendered", emailErr !== null);
  check("no-JS: typed values preserved after POST", nameEcho === "بدون جافاسكربت", nameEcho);
  await page.screenshot({ path: `${shots}/qa-nojs-error.png`, fullPage: true });

  // fix the email → full success round-trip without JS.
  // Clear the field explicitly. A triple-click does NOT select this input's
  // contents here, so the retyped address used to be appended to the invalid
  // one — the test posted "broken-emailnojs@example.com" while claiming to
  // post "nojs@example.com", and wrote that junk row to whatever DB was wired
  // up. (setJavaScriptEnabled(false) blocks page scripts, not CDP evaluate.)
  await page.$eval("#reg-email", (el) => {
    el.value = "";
  });
  await page.type("#reg-email", "nojs@example.com");
  const emailSent = await page.$eval("#reg-email", (el) => el.value);
  check("no-JS: email field actually cleared before retype", emailSent === "nojs@example.com", emailSent);
  await sleep(3300);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  // assert the SUCCESS panel specifically — `[role=status]` alone also matches
  // the "already registered" duplicate panel, so the old check passed either way
  const statusTitle = await page.$eval('[role="status"] h2', (el) => el.textContent);
  check(
    "no-JS: success panel after valid POST",
    statusTitle?.includes("تم تسجيلك") || statusTitle?.includes("وصلنا اهتمامك"),
    statusTitle ?? "no panel",
  );
  await page.close();
}

/* ---------------- 6. mobile ---------------- */
{
  const page = await fresh({ width: 390, height: 844 });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check("mobile: no horizontal scroll on landing", scrollW <= 390, `scrollWidth=${scrollW}`);
  let sticky = await page.$('div.fixed.bottom-0');
  check("mobile: sticky CTA hidden before scroll", sticky === null);
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
  await sleep(300);
  sticky = await page.$('div.fixed.bottom-0');
  check("mobile: sticky CTA appears after hero", sticky !== null);
  await page.screenshot({ path: `${shots}/qa-mobile-sticky.png` });

  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  const scrollW2 = await page.evaluate(() => document.documentElement.scrollWidth);
  check("mobile: no horizontal scroll on register", scrollW2 <= 390, `scrollWidth=${scrollW2}`);
  check("mobile: no sticky CTA on form page", (await page.$('div.fixed.bottom-0')) === null);
  const fontSize = await page.$eval("#reg-email", (el) => getComputedStyle(el).fontSize);
  check("mobile: inputs ≥16px (no iOS zoom)", parseFloat(fontSize) >= 16, fontSize);
  await page.close();
}

/* ---------------- 7. reduced motion ---------------- */
{
  const page = await fresh();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const opacity = await page.$eval("h1", (el) => getComputedStyle(el).opacity);
  check("reduced motion: hero content fully visible", opacity === "1", opacity);
  const sting = await page.evaluate(
    () => getComputedStyle(document.querySelector(".sting")).display,
  );
  check("reduced motion: sting never plays", sting === "none", sting);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector("section canvas");
    return c ? getComputedStyle(c).opacity : "absent";
  });
  check(
    "reduced motion: WebGL stays off (SVG fallback)",
    canvas === "0" || canvas === "absent",
    canvas,
  );
  await page.close();
}

/* ---------------- 8. cinematic layer (sting + WebGL) ---------------- */
{
  // fresh tab = fresh sessionStorage → sting plays
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });
  const playing = await page.evaluate(
    () => getComputedStyle(document.querySelector(".sting")).display,
  );
  check("sting plays on first landing view", playing === "flex", playing);
  await sleep(4000); // natural end (curtain ~3050ms + last focus-word ~3780ms)
  const after = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector(".sting")).display,
    heroOpacity: getComputedStyle(document.querySelector(".focus-word")).opacity,
  }));
  check("sting hides after natural end", after.display === "none", after.display);
  check("hero headline sharp after sting", after.heroOpacity === "1", after.heroOpacity);
  const gl = await page.evaluate(() => {
    const c = document.querySelector("section canvas");
    return c ? getComputedStyle(c).opacity : "absent";
  });
  check("WebGL constellation live", gl === "1", gl);

  // same tab reload → sessionStorage set → no sting
  await page.reload({ waitUntil: "networkidle0" });
  const second = await page.evaluate(
    () => getComputedStyle(document.querySelector(".sting")).display,
  );
  check("sting suppressed within the session", second === "none", second);
  await page.close();
}
{
  // skip: a click during the sting fast-forwards to the hero
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });
  await sleep(700);
  await page.mouse.click(640, 450);
  await sleep(500);
  // Asserted on behaviour, not on the attribute: the overlay is gone and the
  // hero is up. (data-sting stays as a terminal "skipped" — dropping it would
  // bounce --sting-offset back to 2650ms and re-hide the hero.)
  const state = await page.evaluate(() => ({
    sting: document.documentElement.dataset.sting ?? "removed",
    display: getComputedStyle(document.querySelector(".sting")).display,
    hero: +getComputedStyle(document.querySelector(".focus-word")).opacity,
  }));
  check(
    "click skips the sting",
    state.display === "none" && state.hero === 1,
    JSON.stringify(state),
  );
  await page.close();
}
{
  // register page never stings, even on a fresh session
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  const attr = await page.evaluate(() => document.documentElement.dataset.sting ?? "none");
  check("no sting on the register page", attr === "none", attr);
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
