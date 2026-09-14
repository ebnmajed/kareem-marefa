import puppeteer, { type Browser, type Page } from "puppeteer-core";

// The headless Chromium the exports are rendered in — DEC-017, DEC-048, 06 §6.2.
//
// The worker drives a browser in ITS OWN IMAGE rather than calling a render
// route in the deployed app. That trades automatic code identity (recovered
// by @kareem/designer-runtime at one version, plus the CI parity gate) for
// guaranteed FONT identity, because a font fetch failing in production
// produces a plausible-looking poster with silently wrong Arabic — the D66
// nightmare, and the one failure that reaches a printed page.
//
// The launch flags are the parity harness's, verbatim, and that is the point:
// a golden made under one rasteriser configuration and an export made under
// another are not comparable, and Tier B's 0.1% threshold would be measuring
// the flags rather than the render.

/** One browser per process, launched lazily. A cold launch is ~300 ms and an
 *  A3 export is seconds, so relaunching per job would be affordable — but a
 *  shared browser also shares the font cache, which is the expensive part. */
let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) {
    // Never fall back to a downloaded Chromium: the image pins one binary and
    // the font set is installed against it (REQ-DSG-016).
    throw new Error("render: CHROME_PATH is not set — the worker image pins Chromium at /usr/bin/chromium");
  }
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-first-run",
      // Pin the two things that would otherwise vary between machines and
      // make a pixel comparison meaningless.
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
      // Containers run as root, where Chrome's sandbox refuses to start.
      // Opt-in rather than automatic: never drop the sandbox on a developer's
      // machine (the harness makes the same choice, for the same reason).
      ...(process.env.CHROME_NO_SANDBOX ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  const open = browser;
  browser = null;
  await open?.close();
}

/** A page sized to the artifact, torn down whatever happens. A leaked page in
 *  a long-lived worker is a leaked renderer process. */
export async function withPage<T>(width: number, height: number, fn: (page: Page) => Promise<T>): Promise<T> {
  const page = await (await getBrowser()).newPage();
  try {
    // deviceScaleFactor 1: the preset's pixel size IS the export's pixel size
    // (A29, «exact preset pixel size»). Scaling here and dividing later is how
    // an off-by-one crept into the OG card.
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}
