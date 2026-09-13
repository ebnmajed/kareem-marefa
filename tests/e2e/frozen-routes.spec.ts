// The frozen public contract, as Playwright sees it (REQ-NFR-019).
//
// scripts/qa.mjs remains the CI gate for these routes — it is deeper and
// older. This spec exists so the Playwright stack is exercised on every run
// from day one, on the only pages that exist, and so the critical path in
// 13 §5 has somewhere to grow.
import { expect, test } from "@playwright/test";

test("/ lands on the Arabic page, RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ar$/);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ar");
});

test("the Arabic hero carries the tagline", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("شارك المعرفة");
});

test("/en is the same page, LTR", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("/ar/register shows the interest form with the role choice first", async ({ page }) => {
  await page.goto("/ar/register");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const form = page.locator("form").first();
  await expect(form).toBeVisible();
  await expect(form.getByRole("radio").first()).toBeVisible();
});

test("/og.png is a PNG", async ({ request }) => {
  const res = await request.get("/og.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
