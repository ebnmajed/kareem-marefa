import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://localhost:3000/ar";
const OUT = "/private/tmp/claude-501/-Users-yamanreda-Desktop-kareem-marefa/8c25ab8a-f8e5-44d2-823c-84bb8753b3a0/scratchpad";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

// Click mid-curtain (2700ms) — curtain is ~1/3 lifted. Does it snap back down?
for (const clickAt of [2700, 2900]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await sleep(clickAt);

  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector(".sting");
      const cs = el && getComputedStyle(el);
      const m = cs?.transform;
      const y = !m || m === "none" ? 0 : parseFloat(m.split(",").pop().replace(")", ""));
      return {
        display: cs?.display,
        opacity: cs && +(+cs.opacity).toFixed(2),
        y: Math.round(y),
        anim: cs?.animationName,
        covered: cs?.display !== "none" && +cs.opacity > 0.05 && y > -850,
      };
    });

  console.log(`\n--- click at ${clickAt}ms (curtain runs 2450→3050ms) ---`);
  const b = await read();
  console.log(`  before: y=${b.y}px op=${b.opacity} anim=${b.anim} → covering hero? ${b.covered}`);
  await page.mouse.click(700, 750);
  for (const t of [0, 40, 80, 120, 200, 300]) {
    if (t) await sleep(t === 40 ? 40 : 40);
    const a = await read();
    console.log(`  +${String(t).padStart(3)}ms: y=${String(a.y).padStart(5)}px op=${a.opacity} anim=${a.anim} → covering hero? ${a.covered}`);
    if (t === 0) await page.screenshot({ path: `${OUT}/skip-${clickAt}-t0.png` });
  }
  await page.close();
}

await browser.close();
