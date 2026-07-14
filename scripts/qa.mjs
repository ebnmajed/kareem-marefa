// Interactive headless-browser QA for the Kareem Marefa pre-launch site.
// Drives the real production server (Supabase stubbed on :54321).
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const shots = "/private/tmp/claude-501/-Users-yamanreda-Desktop-kareem-marefa/72fa5ffc-c9bd-4402-97a6-5b98bc4daf1f/scratchpad";
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
  const invite = await page.$eval('[role="status"] a[href^="https://wa.me"]', (el) =>
    decodeURIComponent(el.href),
  );
  check("WhatsApp invite carries page URL", invite.includes("/ar/register"), invite);
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
  await sleep(3300);
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

  // fix the email → full success round-trip without JS
  await page.click("#reg-email", { clickCount: 3 });
  await page.type("#reg-email", "nojs@example.com");
  await sleep(3300);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  const status = await page.$('[role="status"]');
  check("no-JS: success panel after valid POST", status !== null);
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
  const state = await page.evaluate(() => ({
    sting: document.documentElement.dataset.sting ?? "removed",
    display: getComputedStyle(document.querySelector(".sting")).display,
  }));
  check(
    "click skips the sting",
    state.sting === "removed" && state.display === "none",
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
