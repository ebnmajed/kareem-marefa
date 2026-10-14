// The capture's on-screen checks, shared by the Chromium and WebKit layout specs (story-media-capture-layout*.spec.ts).
// Not a spec itself: Playwright runs only `*.spec.ts`.
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const SIZES = [
  { width: 390, height: 844 },
  { width: 390, height: 664 },
] as const;

async function openDemo(page: Page, state: string) {
  const res = await page.goto("/ar/ui");
  test.skip(res?.status() === 404, "the gallery is off (KAREEM_GALLERY)");
  const capture = page.locator("[data-story-capture]");
  // ★ The gallery is the heaviest page in the app: under a full parallel run WebKit hydrates it well after it paints, and
  // a click on a button React does not yet own does nothing (the first WebKit run, 8/8 «no dialog»; alone it passes).
  // The click is repeated until the dialog answers — the harness waits for hydration, it never hides a dialog that fails.
  await expect(async () => {
    await page.locator('[data-demo="story-capture"]').first().getByRole("button", { name: state, exact: true }).click();
    await expect(capture).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return capture;
}

/** Visible, wholly inside the viewport, and the element actually hit at its centre. */
async function onScreen(page: Page, name: string, locator: ReturnType<Page["locator"]>) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, name).not.toBeNull();
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(vp.height);
  expect(box!.x, `${name} start`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} end`).toBeLessThanOrEqual(vp.width);
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (el === top || el.contains(top) || (el instanceof HTMLLabelElement && el.control === top));
  });
  expect(hit, `${name} is the topmost element at its centre`).toBe(true);
}

export function suite(engine: "chromium" | "webkit") {
  for (const size of SIZES) {
    test(`${engine} ${size.width}×${size.height}: close, mode, gallery, shutter and flip are on screen`, async ({ page }) => {
      await page.setViewportSize(size);
      const capture = await openDemo(page, "صورة");
      await onScreen(page, "close", capture.getByRole("button", { name: "إغلاق" }));
      await onScreen(page, "photo mode", capture.getByRole("radio", { name: "صورة" }));
      await onScreen(page, "video mode", capture.getByRole("radio", { name: "فيديو" }));
      await onScreen(page, "gallery", capture.locator("label", { hasText: "من الاستوديو" }));
      await onScreen(page, "shutter", capture.getByRole("button", { name: "التقط صورة" }));
      await onScreen(page, "flip", capture.getByRole("button", { name: "قلب الكاميرا" }));
      await page.screenshot({ path: join(SHOTS, `story-capture-${engine}-idle-${size.width}x${size.height}.png`) });
    });

    test(`${engine} ${size.width}×${size.height}: review's retake and publish are on screen`, async ({ page }) => {
      await page.setViewportSize(size);
      const capture = await openDemo(page, "مراجعة");
      await onScreen(page, "retake", capture.getByRole("button", { name: "أعد", exact: true }));
      await onScreen(page, "publish", capture.getByRole("button", { name: "انشر" }));
      await page.screenshot({ path: join(SHOTS, `story-capture-${engine}-review-${size.width}x${size.height}.png`) });
    });
  }
}
