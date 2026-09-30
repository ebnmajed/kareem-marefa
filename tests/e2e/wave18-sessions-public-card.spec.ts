// SCR-007, rebuilt from `PublicCard.dc.html` — wave 18, REQ-UIX-059, STORY-UIX-043,
// DEC-206 §4.42 – §4.46, DEC-207 §1.4 and §2 (N1 – N3, Q3). Signed out, as a stranger
// holding a shared link.
//
// What the rebuild must hold, beside the two older specs that stay as evidence
// (`sessions-public-card`, `wave7-sessions-public-card`):
//   · the regions in the artboard's order — the brand row, the poster, the badge,
//     the `h1`, the time and the place, the one action, the members-only line, the
//     legal footer;
//   · ★ nothing DEC-066 does not allow: no seats, no presenter, no company, no amount;
//   · the placeholder at 4:5, whole;
//   · the action: «سجّل الدخول لحجز مقعدك» while a seat can be had, «سجّل الدخول
//     لعرض الجلسة» once it has ended (Q3), carrying the session either way;
//   · a cancelled session is the 404, as before (N2).
//
// Captures: `wave18-sessions-public-card-<state>-<390|1280>.png` — open, live, ended,
// missing. There is no 1280 artboard (§4.36); the 1280 capture shows the column centred.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

test.describe.configure({ mode: "serial" });

const ORG = "نادي البطاقة المُعاد بناؤها";
let db: pg.Client;
let orgId = "";
const ids = { open: "", live: "", ended: "", cancelled: "" };

test.beforeAll(async ({}, testInfo) => {
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const org = await one<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ($1, $2, 'PR', gen_random_uuid(), $3) returning id`,
    [ORG, `e2e-w18-card-${tag}`, `boss@e2e-w18-card-${tag}.example`],
  );
  orgId = org.id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  const category = await one<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const venue = await one<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الرياض', 'شارع لا يظهر') returning id`, [orgId]);

  const session = async (title: string, state: string, startOffset: string) =>
    (
      await one<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                      ends_at, time_zone, venue_id, capacity, state, published_at, completed_at,
                                      cancelled_at, cancellation_reason)
         values ($1, $2, 'نبذة لا تظهر على البطاقة العامة', $3, 'intermediate', 'ar',
                 now() + $5::interval, 60, now() + $5::interval + interval '60 minutes',
                 'Asia/Riyadh', $4, 40, $6::public.session_state,
                 case when $6 <> 'draft' then now() - interval '10 days' end,
                 case when $6 = 'completed' then now() + $5::interval + interval '60 minutes' end,
                 case when $6 = 'cancelled' then now() - interval '1 day' end,
                 -- \`sessions_check5\`: a cancelled session carries its reason.
                 case when $6 = 'cancelled' then 'أُلغيت لظرف طارئ' end)
         returning id`,
        [orgId, title, category.id, venue.id, startOffset, state],
      )
    ).id;

  ids.open = await session("لوحة تحكم لا يهجرها أحد بعد أسبوع", "published", "2 days");
  ids.live = await session("العرض في 5 شرائح", "published", "-20 minutes");
  ids.ended = await session("ما تعلّمناه من إطلاق فاشل", "completed", "-3 days");
  ids.cancelled = await session("جلسة أُلغيت", "cancelled", "4 days");
});

test.afterAll(async () => {
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db?.end();
});

async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

async function open(page: Page, id: string, desktop: boolean) {
  await page.context().clearCookies();
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  const response = await page.goto(`/ar/s/${id}`);
  await page.evaluate(() => document.fonts.ready);
  return response;
}

async function capture(page: Page, state: string, desktop: boolean) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave18-sessions-public-card-${state}-${desktop ? 1280 : 390}.png`), fullPage: true });
}

test("open: the regions in the artboard's order, and nothing DEC-066 does not allow", async ({ page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  expect((await open(page, ids.open, desktop))?.status()).toBe(200);

  // The order of the page, read from the DOM: the brand row, the poster, the h1, the time and
  // the place, the action, the members-only line, the footer.
  const order = await page.evaluate(() => {
    const at = (el: Element | null) => (el ? [...document.querySelectorAll("*")].indexOf(el) : -1);
    return [
      at(document.querySelector("header svg")),
      at(document.querySelector('[data-slot="poster-placeholder"]')),
      at(document.querySelector("h1")),
      at(document.querySelector("dl")),
      at(document.querySelector('a[href*="/sign-in"]')),
      at(document.querySelector("footer")),
    ];
  });
  expect(order.every((n) => n >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  await expect(page.locator("header")).toContainText(`من تنظيم ${ORG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة تحكم لا يهجرها أحد بعد أسبوع");
  await expect(page.getByText("قاعة الرياض")).toBeVisible();
  // No badge while open: «التسجيل مفتوح» would be a claim about seats (DEC-206 §4.43).
  await expect(page.getByText("التسجيل مفتوح")).toHaveCount(0);

  // ★ DEC-066 (§4.42): no seats, no presenter, no company, no amount, no abstract, no address.
  const body = page.locator("body");
  for (const absent of ["من 40", "تقدّمها", "+", "نبذة لا تظهر على البطاقة العامة", "شارع لا يظهر"]) await expect(body).not.toContainText(absent);

  // The placeholder is whole at 4:5.
  const box = (await page.locator('[data-slot="poster-placeholder"]').boundingBox())!;
  expect(box.height / box.width).toBeGreaterThanOrEqual(1.24);

  const cta = page.getByRole("link", { name: "سجّل الدخول لحجز مقعدك" });
  await expect(cta).toHaveAttribute("href", `/ar/sign-in?next=${encodeURIComponent(`/ar/app/sessions/${ids.open}`)}`);
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText(`صفحة الجلسة الكاملة، والتعليقات والصور، لأعضاء ${ORG}.`, { exact: false })).toBeVisible();
  await expect(page.getByText("الحضور في القاعة فقط.")).toBeVisible();

  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute("href", "/ar/legal/privacy");
  await expect(footer.getByRole("link", { name: "الشروط والأحكام" })).toHaveAttribute("href", "/ar/legal/terms");
  await expect(page.locator("a[href^='http']")).toHaveCount(0);

  await capture(page, "open", desktop);
});

test("live: the clock's badge, and the same one action", async ({ page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  expect((await open(page, ids.live, desktop))?.status()).toBe(200);
  await expect(page.getByText("جارية الآن", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "سجّل الدخول لحجز مقعدك" })).toBeVisible();
  await capture(page, "live", desktop);
});

test("ended: «انتهت», the wash on the poster only, and an action that promises no seat (Q3)", async ({ page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  expect((await open(page, ids.ended, desktop))?.status()).toBe(200);
  const badge = page.getByText("انتهت", { exact: true });
  await expect(badge).toBeVisible();
  expect(
    await badge.evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) if (Number(getComputedStyle(n).opacity) < 1 || getComputedStyle(n).filter !== "none") return true;
      return false;
    }),
  ).toBe(false);
  await expect(page.getByRole("link", { name: "سجّل الدخول لعرض الجلسة" })).toHaveAttribute(
    "href",
    `/ar/sign-in?next=${encodeURIComponent(`/ar/app/sessions/${ids.ended}`)}`,
  );
  await expect(page.getByRole("link", { name: "سجّل الدخول لحجز مقعدك" })).toHaveCount(0);
  await capture(page, "ended", desktop);
});

test("a cancelled session is the real 404, in the card's frame, naming no org (N2)", async ({ page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  expect((await open(page, ids.cancelled, desktop))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("هذه الجلسة غير متاحة");
  await expect(page.locator("body")).not.toContainText(ORG);
  await expect(page.locator("footer").getByRole("link", { name: "سياسة الخصوصية" })).toBeVisible();
  await capture(page, "missing", desktop);
});
