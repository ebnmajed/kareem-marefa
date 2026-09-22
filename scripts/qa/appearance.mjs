// qa:appearance — the public routes' DESIGN (DEC-167, 16 §14). Rewritten in the same commit as the
// design it describes, never before or after it: the hero's words, the wordmark, the constellation, the
// sticky CTA and the intro sting.

import { BASE, check, fresh, shots, sleep } from "./lib.mjs";

export default async function appearance() {
/* ---------------- 1. the landing's identity ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const headline = await page.$eval("h1", (el) => el.textContent);
  check("AR hero headline is the tagline", headline?.includes("شارك المعرفة"));

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

/* ---------------- 6. mobile: the sticky CTA ---------------- */
{
  const page = await fresh({ width: 390, height: 844 });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  let sticky = await page.$('div.fixed.bottom-0');
  check("mobile: sticky CTA hidden before scroll", sticky === null);
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
  await sleep(300);
  sticky = await page.$('div.fixed.bottom-0');
  check("mobile: sticky CTA appears after hero", sticky !== null);
  await page.screenshot({ path: `${shots}/qa-mobile-sticky.png` });

  await page.goto(`${BASE}/ar/register`, { waitUntil: "networkidle0" });
  check("mobile: no sticky CTA on form page", (await page.$('div.fixed.bottom-0')) === null);
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

/* ---------------- 9. the M13 design (DEC-167) ---------------- */
{
  const page = await fresh();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle0" });
  const indices = await page.$$eval(".chapter-mark .text-index", (els) => els.map((e) => e.textContent.trim()));
  check("chapters indexed 01–05 in Western digits (DEC-124)", indices.join(",") === "01,02,03,04,05", indices.join(","));
  const platform = await page.evaluate(() => {
    const s = document.getElementById("platform");
    return Boolean(s?.querySelector("h2") && s.querySelector('a[href="/ar/sign-in"]'));
  });
  check("the platform chapter says it exists, with its door", platform);
  const doors = await page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : "absent";
    };
    return { signIn: bg('header a[href="/ar/sign-in"]'), register: bg('header a[href="/ar/register"]') };
  });
  check(
    "sign-in is outlined, the interest list is filled — two doors, not one",
    doors.signIn === "rgba(0, 0, 0, 0)" && doors.register === "rgb(255, 255, 255)",
    JSON.stringify(doors),
  );
  await page.close();
}
for (const path of ["/ar", "/en", "/ar/register"]) {
  const page = await fresh();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  const eastern = await page.evaluate(() => (document.body.innerText.match(/[\u0660-\u0669\u06F0-\u06F9]/g) ?? []).length);
  check(`no Arabic-Indic digit on ${path} (DEC-124)`, eastern === 0, `found ${eastern}`);
  await page.close();
}
}
