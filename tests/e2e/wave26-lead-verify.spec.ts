// SCR-006 · `/verify/[code]`, rebuilt from `Verify.dc.html` — REQ-UIX-115, REQ-CRT-007, REQ-CRT-009, REQ-CRT-011.
//
// The page in its three states at 390, captured for the artboard, and the rules a screenshot cannot hold: the
// answer is a status, a revoked certificate never says why, ★ the SERIAL is nowhere on the page (the lookup's return
// type is the allowlist, A13 — the artboard lists it and it is not built), and an unknown code is not echoed back.
//
// It reads two verification codes from the local database (an issued and a revoked certificate, whatever the local
// data holds) and writes nothing. Without both it skips — `wave10-designer-reissue-and-days` issues and revokes its
// own and holds the same rules on fresh rows.
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import pg from "pg";

const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!process.env.E2E_SUPABASE_SERVICE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "/verify answers 404 on the unconfigured build (DEC-051)");
test.use({ viewport: { width: 390, height: 844 } });

type Row = { verification_code: string; serial: string; revocation_reason: string | null };
const found: { issued?: Row; revoked?: Row } = {};

test.beforeAll(async () => {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    for (const state of ["issued", "revoked"] as const) {
      const { rows } = await db.query<Row>(
        `select verification_code, serial, revocation_reason from public.certificates where state = $1::public.certificate_state and session_id is not null order by created_at desc limit 1`,
        [state],
      );
      found[state] = rows[0];
    }
  } finally {
    await db.end();
  }
});

async function capture(page: import("@playwright/test").Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/wave26-lead-verify-${name}-390.png`, fullPage: true });
}

test("a valid certificate: the answer is a status, the facts are the lookup's, and the serial is not on the page", async ({ page }) => {
  test.skip(!found.issued, "the local database holds no issued certificate");
  const { verification_code: code, serial } = found.issued!;
  const response = await page.goto(`/ar/verify/${code}`);
  expect(response?.headers()["x-robots-tag"] ?? "noindex").toContain("noindex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("التحقّق من شهادة");
  await expect(page.getByRole("img", { name: "كريم معرفة" })).toBeVisible();
  await expect(page.locator('p[role="status"]')).toHaveText("شهادة صالحة");
  const facts = page.locator("dl > div");
  expect(await facts.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator("dt").first()).toHaveText("الاسم");
  // ★ A13: the serial is not one of the facts — and not anywhere else either.
  await expect(page.getByText(serial)).toHaveCount(0);
  await expect(page.locator("dt").filter({ hasText: /^الرقم/ })).toHaveCount(0);
  // The address they came by, isolated and left-to-right.
  await expect(page.locator('bdi[dir="ltr"]')).toContainText(`/verify/${code}`);
  // Nothing leads into the product.
  await expect(page.locator("main a")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, "valid");
});

test("★ a revoked certificate still resolves, says so, and never says why", async ({ page }) => {
  test.skip(!found.revoked, "the local database holds no revoked certificate");
  const { verification_code: code, revocation_reason: reason } = found.revoked!;
  await page.goto(`/ar/verify/${code}`);
  await expect(page.locator('p[role="status"]')).toHaveText("شهادة ملغاة");
  expect(await page.locator("dl > div").count()).toBeGreaterThanOrEqual(3);
  if (reason) await expect(page.getByText(reason)).toHaveCount(0);
  await capture(page, "revoked");
});

test("an unknown code, a malformed one and a serial are one page, and the code is not echoed", async ({ page }) => {
  const unknown = "AAAAAAAAAAAAAAAAAAAAAAAA";
  for (const code of [unknown, "nope", found.issued?.serial ?? "KM-2026-000001"]) {
    await page.goto(`/ar/verify/${encodeURIComponent(code)}`);
    await expect(page.getByText("لا توجد شهادة بهذا الرمز")).toBeVisible();
    await expect(page.locator('p[role="status"]')).toHaveCount(0);
    await expect(page.locator("dl")).toHaveCount(0);
    await expect(page.locator("main").getByText(code)).toHaveCount(0);
  }
  await capture(page, "not-found");
});
