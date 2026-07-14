import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "/private/tmp/claude-501/-Users-yamanreda-Desktop-kareem-marefa/8c25ab8a-f8e5-44d2-823c-84bb8753b3a0/scratchpad";
const tag = process.argv[2] ?? "before";
const locale = process.argv[3] ?? "ar";
const W = +(process.argv[4] ?? 1440), H = +(process.argv[5] ?? 900);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => sessionStorage.setItem("km-sting", "1"));
await page.goto(`http://localhost:3000/${locale}`, { waitUntil: "networkidle0" });
await sleep(1000);

const total = await page.evaluate(() => document.body.scrollHeight);
const steps = Math.ceil(total / H);
console.log(`page ${total}px → ${steps} viewports`);
for (let i = 0; i < steps; i++) {
  // scroll gradually so view() timelines advance naturally
  await page.evaluate(async (y) => {
    const start = window.scrollY;
    for (let s = 0; s <= 12; s++) {
      window.scrollTo(0, start + ((y - start) * s) / 12);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  }, i * H);
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${tag}-${locale}-vp${i}.png` });
}
await browser.close();
console.log("done");
