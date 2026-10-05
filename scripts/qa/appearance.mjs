// qa:appearance — the public routes' DESIGN (DEC-167, 16 §14). Rewritten in the same commit as the
// design it describes, never before or after it. Wave 26 (DEC-247, DEC-252): the public site is on the
// playground — the ink ground, the mark, the artboard's regions (`Landing.dc.html`, `Register.dc.html`),
// and the mark's reveal as the landing's cold start.

import { BASE, check, fresh, shots, sleep } from "./lib.mjs";

const INK = "rgb(11, 12, 18)";
// A picture of the page is taken once the cold start's overlay has retired, or it is a picture of the overlay.
const settled = (page) => page.waitForFunction(() => getComputedStyle(document.querySelector(".sting") ?? document.body).display !== "flex", { timeout: 8000 }).catch(() => {});
const LIME = "rgb(198, 255, 61)";

export default async function appearance() {
/* ---------------- 1. the landing's identity ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const headline = await page.$eval("h1", (el) => el.textContent);
  check("AR hero headline is the tagline", headline?.includes("شارك المعرفة"));

  const ground = await page.evaluate(() => {
    let el = document.querySelector("#main");
    while (el && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)") el = el.parentElement;
    return el ? getComputedStyle(el).backgroundColor : "none";
  });
  check("the public site is on the playground's ink ground", ground === INK, ground);

  const mark = await page.evaluate(() => {
    const svg = document.querySelector('header a[href="/ar"] svg[data-logo]');
    return svg ? { motion: svg.dataset.motion, name: svg.getAttribute("aria-label"), arcs: svg.querySelectorAll("[data-arc]").length } : null;
  });
  check(
    "the header wears the mark — still, named, and leading to the landing",
    mark?.motion === "none" && mark.name === "كريم معرفة" && mark.arcs === 10,
    JSON.stringify(mark),
  );
  check("the old wordmark and the constellation are gone", await page.evaluate(() => !document.querySelector(".network-svg, section canvas, .chapter-mark")));
  await settled(page);
  await page.screenshot({ path: `${shots}/qa-ar-landing.png`, fullPage: true });

  await page.goto(`${BASE}/en`, { waitUntil: "networkidle0" });
  await settled(page);
  await page.screenshot({ path: `${shots}/qa-en-hero.png` });
  await page.close();
}

/* ---------------- 2. the artboard's regions, in its order ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const regions = await page.evaluate(() => ({
    order: [...document.querySelectorAll("#main > section[id]")].map((s) => s.id).join(","),
    posters: document.querySelectorAll("#hero ul > li").length,
    companies: document.querySelectorAll("#hero + ul > li").length,
    features: document.querySelectorAll("#platform li").length,
    paths: [...document.querySelectorAll("#how ol")].map((ol) => ol.children.length).join(","),
    steps: [...document.querySelectorAll("#how ol > li > span:first-child")].map((s) => s.textContent.trim()).join(""),
  }));
  check("regions: hero, about, platform, how — in the artboard's order", regions.order === "hero,about,platform,how", regions.order);
  check("three posters, seven companies, four features", regions.posters === 3 && regions.companies === 7 && regions.features === 4, JSON.stringify(regions));
  check("two paths of three steps, numbered in Western digits (DEC-124)", regions.paths === "3,3" && regions.steps === "123123", JSON.stringify(regions));

  // DEC-266 (the owner's ruling): one button on the public site — the header's «تسجيل الدخول», in the accent. The
  // page carries none, and nothing on the landing links to the interest list any more (its URL and its behaviour are
  // `qa:contract`'s and unchanged).
  const doors = await page.evaluate(() => {
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : "absent");
    const filled = (el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)";
    const signIn = document.querySelector('header a[href="/ar/sign-in"]');
    const buttons = [...document.querySelectorAll("header a, header button, #main a, #main button")].filter(filled);
    return { signIn: bg(signIn), buttons: buttons.length, register: document.querySelectorAll('a[href="/ar/register"]').length };
  });
  check(
    "one button: the header's sign-in, in the accent — none on the page, no link to the interest list",
    doors.signIn === LIME && doors.buttons === 1 && doors.register === 0,
    JSON.stringify(doors),
  );
  await page.close();
}

/* ---------------- 3. a phone: one column, nothing fixed over the page ---------------- */
{
  const page = await fresh({ width: 390, height: 844 });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
  await sleep(300);
  const fixed = await page.evaluate(
    () => [...document.querySelectorAll("body *")].filter((el) => !el.closest(".sting") && getComputedStyle(el).position === "fixed" && getComputedStyle(el).display !== "none").length,
  );
  check("mobile: no bar is fixed over the landing (the cold start's overlay aside)", fixed === 0, `fixed=${fixed}`);
  await settled(page);
  await page.screenshot({ path: `${shots}/qa-mobile-landing.png`, fullPage: true });

  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  const form = await page.evaluate(() => {
    const input = document.querySelector("#reg-email");
    const card = document.querySelector('label[for="reg-role-provider"]');
    return { input: getComputedStyle(input).backgroundColor, card: getComputedStyle(card).backgroundColor, h1: document.querySelector("h1")?.textContent };
  });
  check("the interest form is on the playground: dark fields, dark cards", form.input !== "rgb(255, 255, 255)" && form.card !== "rgb(255, 255, 255)" && form.h1?.includes("سجّل اهتمامك"), JSON.stringify(form));
  await page.screenshot({ path: `${shots}/qa-mobile-register.png`, fullPage: true });
  await page.close();
}

/* ---------------- 4. the cold start — the mark's reveal ---------------- */
{
  // fresh tab = fresh sessionStorage → the reveal plays
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });
  const playing = await page.evaluate(() => {
    const sting = document.querySelector(".sting");
    const mark = sting.querySelector("svg[data-logo]");
    return { display: getComputedStyle(sting).display, motion: mark?.dataset.motion, drawing: mark ? getComputedStyle(mark.querySelector("[data-arc]")).animationName : "absent" };
  });
  check("the mark's reveal plays on the first landing view", playing.display === "flex" && playing.motion === "reveal" && playing.drawing === "logo-draw", JSON.stringify(playing));
  await sleep(4000); // natural end (the curtain lifts at 2450 ms for 600 ms)
  const after = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector(".sting")).display,
    heroOpacity: getComputedStyle(document.querySelector("h1")).opacity,
  }));
  check("the overlay retires after its natural end", after.display === "none", after.display);
  check("the hero under it was whole all along", after.heroOpacity === "1", after.heroOpacity);

  // same tab reload → sessionStorage set → no reveal
  await page.reload({ waitUntil: "networkidle0" });
  const second = await page.evaluate(() => getComputedStyle(document.querySelector(".sting")).display);
  check("the reveal is suppressed within the session", second === "none", second);
  await page.close();
}
{
  // skip: a click during the reveal goes straight to the page
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });
  await sleep(700);
  await page.mouse.click(640, 450);
  await sleep(500);
  const state = await page.evaluate(() => ({
    sting: document.documentElement.dataset.sting ?? "removed",
    display: getComputedStyle(document.querySelector(".sting")).display,
  }));
  check("a click skips the reveal", state.display === "none", JSON.stringify(state));
  await page.close();
}
{
  // register page never plays it, even on a fresh session
  const page = await fresh();
  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  const attr = await page.evaluate(() => document.documentElement.dataset.sting ?? "none");
  check("no reveal on the register page", attr === "none", attr);
  await page.close();
}

/* ---------------- 5. numerals (DEC-124) ---------------- */
for (const path of ["/ar", "/en", "/ar/register"]) {
  const page = await fresh();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  const eastern = await page.evaluate(() => (document.body.innerText.match(/[٠-٩۰-۹]/g) ?? []).length);
  check(`no Arabic-Indic digit on ${path} (DEC-124)`, eastern === 0, `found ${eastern}`);
  await page.close();
}
}
