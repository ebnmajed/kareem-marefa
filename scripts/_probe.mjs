import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://localhost:3000/ar";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

const probe = () =>
  page.evaluate(() => {
    const h = document.documentElement;
    const s = document.querySelector(".sting");
    const hero = document.querySelector(".focus-word");
    const cs = s && getComputedStyle(s);
    const hs = hero && getComputedStyle(hero);
    return {
      attrs: [
        h.dataset.sting ? "sting" : "",
        h.dataset.stingDone ? "done" : "",
        h.dataset.stingSkip ? "skip" : "",
      ].filter(Boolean).join("+") || "-",
      offset: getComputedStyle(h).getPropertyValue("--sting-offset").trim() || "0ms",
      stingDisplay: cs?.display,
      stingOpacity: cs && (+cs.opacity).toFixed(2),
      stingY: cs?.transform === "none" ? "none" : cs?.transform?.split(",").pop()?.replace(")", "").trim(),
      heroOpacity: hs && (+hs.opacity).toFixed(2),
    };
  });

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// ---------- Scenario A: natural playthrough, sampled every 250ms ----------
console.log("=== A. natural playthrough (no interaction) ===");
const t0 = Date.now();
await page.goto(URL, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 22; i++) {
  const p = await probe();
  console.log(
    `${String(Date.now() - t0).padStart(5)}ms  attrs=${p.attrs.padEnd(12)} off=${String(p.offset).padEnd(7)} sting[${p.stingDisplay}, op=${p.stingOpacity}, y=${p.stingY}]  heroWord.op=${p.heroOpacity}`,
  );
  await sleep(250);
}

// ---------- Scenario B: tap AFTER the curtain has visually finished ----------
console.log("\n=== B. fresh load, single click at 3300ms (curtain visually done at ~3050ms) ===");
const page2 = await browser.newPage();
await page2.setViewport({ width: 1440, height: 900 });
const probe2 = probe.bind(null);
const t1 = Date.now();
await page2.goto(URL, { waitUntil: "domcontentloaded" });
await sleep(3300);
const before = await page2.evaluate(() => {
  const s = document.querySelector(".sting");
  const hero = document.querySelector(".focus-word");
  return {
    sting: s && getComputedStyle(s).display + " op=" + (+getComputedStyle(s).opacity).toFixed(2),
    hero: hero && (+getComputedStyle(hero).opacity).toFixed(2),
  };
});
console.log(`  ${Date.now() - t1}ms BEFORE click: sting=${before.sting}  heroWord.op=${before.hero}`);
await page2.mouse.click(700, 700);
for (const d of [30, 90, 160, 260, 400]) {
  await sleep(d === 30 ? 30 : 0);
  const s = await page2.evaluate(() => {
    const el = document.querySelector(".sting");
    const hero = document.querySelector(".focus-word");
    const cs = el && getComputedStyle(el);
    return {
      d: cs?.display,
      op: cs && (+cs.opacity).toFixed(2),
      y: cs?.transform === "none" ? "none" : cs?.transform?.split(",").pop()?.replace(")", "").trim(),
      hero: hero && (+getComputedStyle(hero).opacity).toFixed(2),
      attrs: document.documentElement.dataset.sting + "/" + document.documentElement.dataset.stingSkip,
    };
  });
  console.log(`  +${String(Date.now() - t1 - 3300).padStart(4)}ms AFTER click: sting[${s.d}, op=${s.op}, y=${s.y}] heroWord.op=${s.hero} attrs=${s.attrs}`);
  await sleep(d);
}
await page2.screenshot({ path: "/private/tmp/claude-501/-Users-yamanreda-Desktop-kareem-marefa/8c25ab8a-f8e5-44d2-823c-84bb8753b3a0/scratchpad/B-after-click.png" });

// ---------- Scenario C: client-side nav to /register and back ----------
console.log("\n=== C. after sting, client-nav to /register then back to / ===");
await sleep(2500);
await page2.evaluate(() => {
  const link = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href")?.includes("register"));
  link?.click();
});
await sleep(1500);
console.log("  on /register:", page2.url());
await page2.evaluate(() => {
  const link = [...document.querySelectorAll("a")].find((a) => /register/.test(a.getAttribute("href") ?? "") === false && a.getAttribute("href")?.match(/\/(ar|en)\/?$/));
  link?.click();
});
await sleep(600);
for (let i = 0; i < 6; i++) {
  const s = await page2.evaluate(() => {
    const hero = document.querySelector(".focus-word");
    const eyebrow = document.querySelector(".hero-enter");
    return {
      url: location.pathname,
      offset: getComputedStyle(document.documentElement).getPropertyValue("--sting-offset").trim() || "0ms",
      hero: hero && (+getComputedStyle(hero).opacity).toFixed(2),
      eyebrow: eyebrow && (+getComputedStyle(eyebrow).opacity).toFixed(2),
    };
  });
  console.log(`  back on ${s.url} +${i * 400}ms: --sting-offset=${s.offset}  heroWord.op=${s.hero}  eyebrow.op=${s.eyebrow}`);
  await sleep(400);
}

await browser.close();
