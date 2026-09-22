// Wave 11 · `platform` P1 — `job_exhausted` on the console (REQ-NFR-016,
// REQ-ADM-003, `docs/plan/notes/platform.md` W11.3).
//
// One dead `record_survey_response` job is arranged directly in graphile's
// table — the shape a permanently failing job leaves — and the super admin
// sees its TASK and a COUNT on the home and in SCR-084's job health, and never
// its payload: the payload carries a sentinel that must appear nowhere.
//
// The home reads `platform_job_health()`, which exists on `main`, so this spec
// runs before `0011_job_exhausted_alert` is promoted; the promotion changes only
// how a job RUNNING its last attempt is counted (tests/rls/alerts-exhausted).
//
// Captures (phone project, 390 × 844): `wave11-platform-home-exhausted.png`,
// `wave11-platform-metrics-exhausted.png`.

import AxeBuilder from "@axe-core/playwright";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TASK = "record_survey_response";
const main = (page: Page) => page.locator("#main");

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let platformEmail: string;
let platformUserId: string;
let jobId: string;
let sentinel: string;
let expected: number;

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  sentinel = `إجابة-سرية-${tag}`;

  platformEmail = `super@exhausted-${tag}.example`;
  const { data, error } = await admin.auth.admin.createUser({
    email: platformEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `مدير المنصة ${tag}` },
  });
  if (error) throw error;
  platformUserId = data.user.id;
  await db.query(`insert into public.platform_admins (auth_user_id) values ($1)`, [platformUserId]);

  // A dead job: every attempt used, not running, its next run far away. The
  // worker never picks it up again — which is exactly the silence this alerts on.
  const { rows } = await db.query<{ id: string }>(
    `select (graphile_worker.add_job($1, $2::json, max_attempts => 1, run_at => now() + interval '1 day')).id::text as id`,
    [TASK, JSON.stringify({ response_id: tag, survey_id: tag, answers: [{ text: sentinel }] })],
  );
  jobId = rows[0].id;
  await db.query(
    `update graphile_worker._private_jobs set attempts = max_attempts, last_error = $2, locked_at = null, locked_by = null
      where id = $1::bigint`,
    [jobId, `boom: ${sentinel}`],
  );
  // Whatever this machine already holds for the task, plus ours.
  const { rows: n } = await db.query<{ n: string }>(
    `select count(*)::text as n from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = $1 and j.attempts >= j.max_attempts and j.locked_at is null`,
    [TASK],
  );
  expected = Number(n[0].n);
});

test.afterAll(async () => {
  if (jobId) await db.query(`delete from graphile_worker._private_jobs where id = $1::bigint`, [jobId]);
  if (platformUserId) {
    await db.query(`delete from public.platform_admins where auth_user_id = $1`, [platformUserId]);
    await admin.auth.admin.deleteUser(platformUserId);
  }
  await db.end();
});

/** A super admin has no member row, so `provision_member()` is NOT called. */
async function signInPlatform(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: platformEmail, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function capture(page: Page, name: string) {
  if (test.info().project.name !== "phone") return;
  await page.setViewportSize(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

test("★ the home names the dead task and its count, never its payload", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform");
  expect(new URL(page.url()).pathname).toBe("/ar/app/platform");

  const attention = main(page).getByRole("region", { name: /يحتاج انتباهك/ });
  await expect(attention).not.toContainText("لا شيء يحتاج انتباهك");
  const list = attention.getByRole("list", { name: "مهام استنفدت محاولاتها" });
  const row = list.getByRole("listitem").filter({ hasText: TASK });
  await expect(row).toBeVisible();
  await expect(row.locator("bdi[dir=ltr]")).toHaveText(TASK);
  await expect(row).toContainText(expected === 1 ? "مهمة واحدة" : expected === 2 ? "مهمتان" : `${expected}`);
  await expect(page.locator("body")).not.toContainText(sentinel);

  const scan = await new AxeBuilder({ page }).include("#main").withTags(AXE_TAGS).analyze();
  expect(scan.violations).toEqual([]);
  await capture(page, "wave11-platform-home-exhausted");

  await attention.getByRole("link", { name: "عرض صحة المهام" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/platform\/metrics#jobs$/);
});

test("SCR-084's job health counts the same dead job, and shows no payload either", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/metrics");
  const jobs = main(page).getByRole("region", { name: /صحة المهام/ });
  await expect(jobs.getByText(TASK, { exact: true }).locator("visible=true").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(sentinel);
  await jobs.scrollIntoViewIfNeeded();
  await capture(page, "wave11-platform-metrics-exhausted");
});
