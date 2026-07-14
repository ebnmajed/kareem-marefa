import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = "/private/tmp/claude-501/-Users-yamanreda-Desktop-kareem-marefa/72fa5ffc-c9bd-4402-97a6-5b98bc4daf1f/scratchpad";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// ---- sting frames (fresh session) ----
await page.goto("http://localhost:3000/ar", { waitUntil: "domcontentloaded" });
await sleep(600);
await page.screenshot({ path: `${shots}/v-sting-1-ignite.png` });
await sleep(900); // ~1500ms
await page.screenshot({ path: `${shots}/v-sting-2-wordmark.png` });
await sleep(600); // ~2100ms
await page.screenshot({ path: `${shots}/v-sting-3-sweep.png` });
await sleep(1200); // ~3300ms — curtain done, hero entering
await page.screenshot({ path: `${shots}/v-hero-entering.png` });
await sleep(1600); // ~4900ms — settled
await page.screenshot({ path: `${shots}/v-hero-settled.png` });

const glLive = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? getComputedStyle(c).opacity : "no-canvas";
});
console.log("GL canvas opacity:", glLive);
console.log("sting attr after end:", await page.evaluate(() => document.documentElement.dataset.sting ?? "none", ));

// ---- second visit: no sting ----
await page.goto("http://localhost:3000/ar", { waitUntil: "networkidle0" });
const stingVisible = await page.evaluate(() => {
  const s = document.querySelector(".sting");
  return s ? getComputedStyle(s).display : "absent";
});
console.log("second-visit sting display:", stingVisible);

// ---- scroll states ----
for (const [y, name] of [[900, "about"], [1900, "steps"], [3000, "policy"], [4200, "cta"]]) {
  await page.evaluate((yy) => window.scrollTo({ top: yy }), y);
  await sleep(500);
  await page.screenshot({ path: `${shots}/v-scroll-${name}.png` });
}

// ---- reduced motion: no sting, SVG fallback ----
const page2 = await browser.newPage();
await page2.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page2.setViewport({ width: 1440, height: 900 });
await page2.goto("http://localhost:3000/ar", { waitUntil: "networkidle0" });
console.log("reduced-motion sting:", await page2.evaluate(() => {
  const s = document.querySelector(".sting");
  return s ? getComputedStyle(s).display : "absent";
}));
console.log("reduced-motion canvas opacity:", await page2.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? getComputedStyle(c).opacity : "no-canvas";
}));
await page2.screenshot({ path: `${shots}/v-reduced-motion.png` });

await browser.close();
console.log("done");
