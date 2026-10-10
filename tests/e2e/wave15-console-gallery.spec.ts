import { join } from "node:path";
import { expect, test } from "@playwright/test";

// wave 15 · console's captures (DEC-186 §9, contract 4): `data-table`,
// `combobox`, `menu`, `tabs`, `sheet` and `date-time` in the gallery, on
// both of the scope's grounds, at 390 px and at desktop width. The lead
// runs this against a build made with `KAREEM_GALLERY=1`; the gallery
// 404s otherwise (`proxy.ts`).
//
// A demo carries no scope of its own: the gallery's `playground.tsx`
// renders it once under the dark scope and once under the light one. Each
// demo's root is `data-demo="<primitive>"`, so a capture is the demo's own
// box on one ground — never the whole gallery, whose length moves every
// time another demo is wired (the pattern `wave15-scoring-gallery.spec.ts`
// already established).
//
// A demo not yet wired into `playground.tsx` is skipped, not failed: the
// lead wires each on its own commit.
//
// Captures land at
// `.qa-shots/rtl/wave15-console-<primitive>-<ground>-<width>.png`, honouring
// `E2E_SHOTS_DIR`.

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const PRIMITIVES = ["data-table", "combobox", "menu", "tabs", "sheet", "date-time"] as const;
// The scope's class is written in `ui/scope.tsx` alone; a test may select by it.
const GROUNDS = [
  { name: "dark", scope: ".theme-play:not(.theme-play-light)" },
  { name: "light", scope: ".theme-play.theme-play-light" },
] as const;

const demoOn = (primitive: string, scope: string) => `${scope} [data-demo="${primitive}"]`;
const WIDTHS = [
  { name: "390", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 900 } },
] as const;

/** Navigate to the gallery, wait for fonts, and freeze scrolling — the
 *  lead's own finding on `dialog` (`wave15-lead-gallery.spec.ts`): the page
 *  scrolls SMOOTHLY, and a press or a focus can start a scroll. A viewport
 *  capture taken mid-scroll shows the fixed layers and the page out of
 *  step — an undimmed band was measured, in a browser, to be nothing wrong
 *  with the product, only with the moment the picture was taken. */
async function gotoGallery(page: import("@playwright/test").Page) {
  const res = await page.goto("/ar/ui");
  expect(res?.status(), "the gallery needs KAREEM_GALLERY=1").toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
}

/** Wait until the page has stopped scrolling: three equal readings, a frame apart. */
async function still(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let last = -1;
        let equal = 0;
        let frames = 0;
        const step = () => {
          equal = scrollY === last ? equal + 1 : 0;
          last = scrollY;
          if (equal >= 3 || ++frames > 120) done();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

// The widths are set here, so one project is enough: the phone project would
// shoot the same boxes again at the same sizes.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "one project takes both widths");
});

for (const primitive of PRIMITIVES) {
  for (const width of WIDTHS) {
    test(`${primitive} at ${width.name}`, async ({ page }) => {
      await page.setViewportSize(width.size);
      await gotoGallery(page);

      test.skip((await page.locator(`[data-demo="${primitive}"]`).count()) === 0, `${primitive}'s demo is not wired into the gallery yet`);

      // No sideways scroll at 390 px (DEC-183 rule: logical properties, one column).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      for (const ground of GROUNDS) {
        const box = page.locator(demoOn(primitive, ground.scope));
        await expect(box).toHaveCount(1);
        await expect(box).toBeVisible();
        await box.scrollIntoViewIfNeeded();
        await still(page);
        await box.screenshot({ path: join(SHOTS, `wave15-console-${primitive}-${ground.name}-${width.name}.png`), animations: "disabled" });
      }
    });
  }
}

// ★ Found from the lead's `dialog` fault (`REQ-UIX-030`, DEC-186 §8): a
// popup's own frame reads `bg-canvas`, which follows the scope but is the
// GROUND — a popover told apart from the page beneath it by a line alone.
// Sync 1 ruled a popover and a sheet are told from the page by their
// SURFACE and a line, so each gained `pg:bg-surface`. Proven in a real
// browser, not jsdom, the same way `wave15-lead-gallery.spec.ts` proves it
// for `dialog` — `scopeComputes()` reads a utility's computed value from
// inside the scope so nothing here names a hex.
async function scopeComputes(page: import("@playwright/test").Page, scope: string, className: string, property: string) {
  return page.locator(scope).first().evaluate(
    (el, { className, property }) => {
      const probe = document.createElement("div");
      probe.className = className;
      el.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    },
    { className, property },
  );
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough; the popup surface does not depend on width");
  await page.setViewportSize({ width: 390, height: 844 });
});

/** Press `trigger` until `popover` is visible — found in CI (`f5e0664f`): a
 *  cold page's picker button is in the HTML before its handler attaches, so
 *  the first press can land on nothing. The dark ground, being first, is
 *  the one that meets a cold page; it never reproduced on a warm local
 *  machine. Checks BEFORE pressing, because a second press on a popover
 *  that DID open closes it again — no fixed sleep, `toPass()` retries the
 *  whole check-then-press instead. */
async function openPopover(trigger: import("@playwright/test").Locator, popover: import("@playwright/test").Locator) {
  await expect(async () => {
    if (!(await popover.isVisible())) await trigger.click();
    await expect(popover).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

for (const ground of GROUNDS) {
  test(`the sheet's content is the scope's SURFACE, ${ground.name} ground`, async ({ page }) => {
    await gotoGallery(page);
    const demo = page.locator(demoOn("sheet", ground.scope));
    test.skip((await demo.count()) === 0, "sheet's demo is not wired into the gallery yet");

    const sheet = page.locator(ground.scope).getByRole("dialog", { name: "تصفية النتائج" });
    await openPopover(demo.getByRole("button", { name: "ورقة سفلية" }), sheet);
    // ★ Wave 29 (DEC-280, REQ-UIX-126): a sheet now RISES into place (and its scrim fades) outside the console. Measure
    // it where it lands, not mid-flight: wait for its own animations and the scrim's to finish.
    await sheet.evaluate((el) =>
      Promise.all([...el.getAnimations(), ...((el.previousElementSibling as HTMLElement | null)?.getAnimations() ?? [])].map((a) => a.finished)),
    );
    const computed = await sheet.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });
    expect(computed.background).toBe(await scopeComputes(page, ground.scope, "bg-surface", "background-color"));
    expect(computed.color).toBe(await scopeComputes(page, ground.scope, "text-fg-body", "color"));

    // Measured, not judged from a picture: the scrim covers the whole
    // screen and a BOTTOM sheet's own frame reaches the screen's bottom
    // edge — the lead's own finding, restated here for the sheet (`still()`
    // above is what makes the picture agree with these numbers).
    const boxes = await sheet.evaluate((el) => {
      const scrim = (el.previousElementSibling as HTMLElement).getBoundingClientRect();
      const content = el.getBoundingClientRect();
      return {
        scrim: { top: scrim.top, left: scrim.left, width: scrim.width, height: scrim.height },
        content: { bottom: content.bottom },
        innerWidth,
        innerHeight,
      };
    });
    expect(boxes.scrim.top).toBe(0);
    expect(boxes.scrim.left).toBe(0);
    expect(boxes.scrim.width).toBe(boxes.innerWidth);
    expect(boxes.scrim.height).toBe(boxes.innerHeight);
    expect(boxes.content.bottom).toBe(boxes.innerHeight);

    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-console-sheet-popup-${ground.name}-390.png`), animations: "disabled" });
  });

  test(`the menu's content is the scope's SURFACE, ${ground.name} ground`, async ({ page }) => {
    await gotoGallery(page);
    const demo = page.locator(demoOn("menu", ground.scope));
    test.skip((await demo.count()) === 0, "menu's demo is not wired into the gallery yet");

    const menu = page.locator(ground.scope).getByRole("menu");
    await openPopover(demo.getByRole("button", { name: "القائمة" }), menu);
    const computed = await menu.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });
    expect(computed.background).toBe(await scopeComputes(page, ground.scope, "bg-surface", "background-color"));

    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-console-menu-popup-${ground.name}-390.png`), animations: "disabled" });
  });

  test(`the combobox's listbox is the scope's SURFACE, ${ground.name} ground`, async ({ page }) => {
    await gotoGallery(page);
    const demo = page.locator(demoOn("combobox", ground.scope));
    test.skip((await demo.count()) === 0, "combobox's demo is not wired into the gallery yet");

    const listbox = page.locator(ground.scope).getByRole("listbox");
    await openPopover(demo.getByRole("combobox").first(), listbox);
    const computed = await listbox.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });
    expect(computed.background).toBe(await scopeComputes(page, ground.scope, "bg-surface", "background-color"));

    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-console-combobox-popup-${ground.name}-390.png`), animations: "disabled" });
  });

  test(`the date picker's popover is the scope's SURFACE, ${ground.name} ground`, async ({ page }) => {
    await gotoGallery(page);
    const demo = page.locator(demoOn("date-time", ground.scope));
    test.skip((await demo.count()) === 0, "date-time's demo is not wired into the gallery yet");

    const popover = page.locator(ground.scope).getByRole("dialog");
    await openPopover(demo.getByRole("button").first(), popover);
    const computed = await popover.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });
    expect(computed.background).toBe(await scopeComputes(page, ground.scope, "bg-surface", "background-color"));

    await still(page);
    await page.screenshot({ path: join(SHOTS, `wave15-console-date-time-popup-${ground.name}-390.png`), animations: "disabled" });
  });
}
