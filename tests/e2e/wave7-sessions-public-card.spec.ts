// SCR-007 on the M9 system — the public session card, signed out (DEC-066,
// DEC-134 item 4, DEC-141). Wave 7's review captures, and the two things the
// rebuild must not lose:
//
//   1. a card that is not there answers a REAL 404 — to a browser as well as a
//      crawler, because Next streams metadata differently for the two — and
//      says so in Arabic;
//   2. the status badge comes from the clock alone: nothing while the session
//      is open, «انتهت» once it has ended, and the ended wash never dims it.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-public-card-open.png · -ended.png · -missing.png
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE = { width: 390, height: 844 };
const NOBODY = "11111111-2222-3333-4444-555555555555";

test.skip(!SERVICE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let openId = "";
let endedId = "";
let draftId = "";

test.beforeAll(async ({}, testInfo) => {
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

  const org = await one<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('نادي البطاقة العامة', $1, 'PW', gen_random_uuid(), $2) returning id`,
    [`e2e-w7-card-${tag}`, `boss@e2e-w7-card-${tag}.example`],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [org.id]);
  const category = await one<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [org.id]);
  const venue = await one<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الابتكار', 'شارع لا يظهر') returning id`, [org.id]);

  // No poster render on either: the card draws the house placeholder, which is
  // the case a freshly published session is in until the worker has run.
  const session = async (title: string, state: string, startOffset: string) =>
    (
      await one<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                      ends_at, time_zone, venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'نبذة لا تظهر على البطاقة العامة', $3, 'intermediate', 'ar',
                 now() + $5::interval, 90, now() + $5::interval + interval '90 minutes',
                 'Asia/Riyadh', $4, 30, $6::public.session_state,
                 case when $6 in ('published', 'completed') then now() - interval '10 days' end,
                 case when $6 = 'completed' then now() + $5::interval + interval '90 minutes' end)
         returning id`,
        [org.id, title, category.id, venue.id, startOffset, state],
      )
    ).id;

  openId = await session("كيف نكتب تقريرًا يُقرأ", "published", "3 days");
  endedId = await session("ما تعلّمناه من أتمتة الفواتير", "completed", "-4 days");
  draftId = await session("مسودة لا تُشارَك", "draft", "5 days");
});

test.afterAll(async () => {
  await db?.end();
});

async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

/** A 390 px RTL review: no sideways scroll, then the picture — phone project only, so the cited path is written once. */
async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-public-card-${name}.png`), fullPage: true });
  }
}

test("an open session's card shows no status badge, one primary action, and the placeholder poster", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize(PHONE);
  const response = await page.goto(`/ar/s/${openId}`);
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("كيف نكتب تقريرًا يُقرأ");
  // «التسجيل مفتوح» would be a claim about seats the card cannot see (DEC-141).
  await expect(page.getByText("التسجيل مفتوح")).toHaveCount(0);
  await expect(page.getByText("انتهت")).toHaveCount(0);

  const cta = page.getByRole("link", { name: "سجّل الدخول لحجز مقعدك" });
  await expect(cta).toHaveAttribute("href", `/ar/sign-in?next=${encodeURIComponent(`/ar/app/sessions/${openId}`)}`);
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("body")).not.toContainText("نبذة لا تظهر على البطاقة العامة");
  await expect(page.locator("body")).not.toContainText("شارع لا يظهر");

  await capture(page, "open");
});

test("an ended session's card says «انتهت», and the wash never reaches the badge", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize(PHONE);
  const response = await page.goto(`/ar/s/${endedId}`);
  expect(response?.status()).toBe(200);

  const badge = page.getByText("انتهت", { exact: true });
  await expect(badge).toBeVisible();
  // DEC-123 item 1: the badge composites over nothing that is dimmed.
  const dimmed = await badge.evaluate((el) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (Number(cs.opacity) < 1 || cs.filter !== "none") return true;
    }
    return false;
  });
  expect(dimmed).toBe(false);

  await capture(page, "ended");
});

test("a card that is not there is a real 404 to a browser and to a crawler, in Arabic, and confirms nothing", async ({ page, context, request }) => {
  await context.clearCookies();
  await page.setViewportSize(PHONE);

  for (const id of [NOBODY, draftId, "not-a-uuid"]) {
    expect((await request.get(`/ar/s/${id}`)).status(), `crawler: ${id}`).toBe(404);
  }
  for (const id of [NOBODY, "not-a-uuid"]) {
    const res = await page.goto(`/ar/s/${id}`);
    expect(res?.status(), `browser: ${id}`).toBe(404);
  }

  const res = await page.goto(`/ar/s/${draftId}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("هذه الجلسة غير متاحة");
  await expect(page.getByRole("link", { name: "إلى الصفحة الرئيسية" })).toHaveAttribute("href", "/ar");
  await expect(page.locator("body")).not.toContainText("مسودة لا تُشارَك");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await capture(page, "missing");
});
