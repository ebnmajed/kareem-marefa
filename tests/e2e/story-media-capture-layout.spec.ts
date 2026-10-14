// ★ The capture's controls are ON SCREEN on a short phone (the owner's report of 2026-10-14: «there weren't any
// [controls]»; REQ-STO-011, DEC-093). The gallery's `story-capture` demo — no session, no camera — opened at 390 × 844
// and at 390 × 664 (an iPhone with Safari's toolbar showing). For each control: visible, inside the viewport, and the
// TOPMOST element at its centre, so nothing — the take, a toolbar, the frame — sits over it. Chromium always; WebKit
// (Safari's engine) too when it is installed (`E2E_WEBKIT=1`, or any local run).
//
// Run: `npx playwright test tests/e2e/story-media-capture-layout.spec.ts` (the stub serves the gallery: KAREEM_GALLERY=1).
// Captures: `.qa-shots/rtl/story-capture-<engine>-<state>-<w>x<h>.png`, honouring `E2E_SHOTS_DIR`.
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
  await page.locator('[data-demo="story-capture"]').first().getByRole("button", { name: state, exact: true }).click();
  const capture = page.locator("[data-story-capture]");
  await expect(capture).toBeVisible();
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

function suite(engine: "chromium" | "webkit") {
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

test.describe("chromium", () => {
  test.skip(({ browserName }) => browserName !== "chromium");
  suite("chromium");
});

test.describe("webkit", () => {
  test.skip(!!process.env.CI && process.env.E2E_WEBKIT !== "1", "WebKit is not installed in CI");
  test.use({ browserName: "webkit", isMobile: false, hasTouch: true });
  suite("webkit");
});
