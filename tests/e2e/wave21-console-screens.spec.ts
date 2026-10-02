// Wave 21 · console — SCR-040 and SCR-042 doing their jobs (`DEC-227` §0), and
// the captures the lead holds beside the artboards:
//   .qa-shots/rtl/wave21-console-<screen>-<state>-<1280|390>.png
//
//  · SCR-040: an admin opens /app/admin and reaches what waits in ONE move —
//    the «جلسات لم تُجدول بعد» tile lands on the sessions list narrowed to
//    exactly the undated sessions it counted.
//  · SCR-042 at 1280: found (search), filtered (a chip), acted on in bulk (two
//    sessions cancelled with one reason through the same transition).
//  · SCR-042 at 390: the same rows as cards; the page never scrolls sideways.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const ids: Record<string, string> = {};
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w21-console-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('شبه الجزيرة', $1, 'WC', gen_random_uuid(), $2) returning id`,
    [`w21-console-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان" } });
  if (error) throw error;
  userIds.push(data.user.id);

  const scheduled = async (key: string, title: string, startsIn: string, state = "published") => {
    const { rows: r } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
       values ($1, $2, 'ملخص', $3, 'introductory', now() + $4::interval, 60, now() + $4::interval + interval '1 hour', $5, 40, $6, now())
       returning id`,
      [orgId, title, cat[0].id, startsIn, venue[0].id, state],
    );
    ids[key] = r[0].id;
  };
  // `0010`'s checks: past `approved` a session names a place, and a cancelled one its reason — even undated.
  const undated = async (key: string, title: string, state: string) => {
    const cancelled = state === "cancelled";
    const { rows: r } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, state, venue_id, cancelled_at, cancellation_reason)
       values ($1, $2, 'ملخص', $3, 'introductory', $4, $5, $6, $7) returning id`,
      [orgId, title, cat[0].id, state, cancelled ? venue[0].id : null, cancelled ? new Date().toISOString() : null, cancelled ? "أُلغيت للاختبار" : null],
    );
    ids[key] = r[0].id;
  };
  await scheduled("soon", "لوحة تحكم لا يهجرها أحد بعد أسبوع", "1 day");
  await scheduled("later", "ما تعلّمناه من إطلاق فاشل", "5 days");
  await scheduled("lighting", "ورشة الإضاءة للمبتدئين", "3 days");
  for (let i = 1; i <= 8; i++) await scheduled(`extra${i}`, `جلسة إضافية ${i}`, `${10 + i} days`);
  await undated("draft", "الأقمشة: كيف تقرأ العيّنة قبل أن تشتريها", "draft");
  await undated("pending", "محضر الاجتماع الذي يُقرأ", "approved");
  await undated("gone", "جلسة التصوير الملغاة", "cancelled");
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Waits out React's streamed Suspense boundaries — a capture of a skeleton proves nothing. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/wave21-console-${name}.png`, fullPage: true });

test("SCR-040 at 1280: what waits is one move away — the undated tile opens exactly the undated sessions", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  await goto(page, "/ar/app/admin");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "لوحة المؤسسة" })).toBeVisible();
  await shot(page, "040-default-1280");

  const attention = main.locator("section", { has: page.getByRole("heading", { name: "يحتاج انتباهك" }) });
  const tile = attention.getByRole("link", { name: /جلسات لم تُجدول بعد/ });
  await expect(tile).toContainText("2"); // the draft and the approved one; the cancelled one is not waiting
  await tile.click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/sessions\?month=none$/);
  const table = main.getByRole("table");
  await expect(table.getByText("الأقمشة: كيف تقرأ العيّنة قبل أن تشتريها")).toBeVisible();
  await expect(table.getByText("محضر الاجتماع الذي يُقرأ")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3); // the header and the two it counted
  await expect(main.getByText("جلستان", { exact: true })).toBeVisible(); // the toolbar's count, not «جلستان محدّدتان»
});

test("SCR-042 at 1280: found, filtered, and two sessions cancelled in bulk with one reason", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  await goto(page, "/ar/app/admin/sessions");
  const main = page.locator("#main");
  await expect(main.getByText("1 – 9 من 14")).toBeVisible();
  await shot(page, "042-default-1280");

  // Find.
  const box = main.getByRole("searchbox", { name: "ابحث في جلسات المؤسسة" });
  await box.fill("إطلاق");
  await box.press("Enter");
  await expect(main.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(main.getByRole("table").getByText("ما تعلّمناه من إطلاق فاشل")).toBeVisible();

  // Filter: the status chip carries its value.
  await goto(page, "/ar/app/admin/sessions");
  await main.getByRole("button", { name: "الحالة: الكل" }).click();
  await page.getByRole("menuitem", { name: "مسودة" }).click();
  await expect(page).toHaveURL(/status=draft/);
  await expect(main.getByRole("button", { name: "الحالة: مسودة" })).toBeVisible();
  await expect(main.getByRole("table").getByRole("row")).toHaveCount(2);

  // Act on many.
  await goto(page, "/ar/app/admin/sessions");
  const table = main.getByRole("table");
  for (const title of ["لوحة تحكم لا يهجرها أحد بعد أسبوع", "ورشة الإضاءة للمبتدئين"]) {
    await table.getByRole("row", { name: new RegExp(title) }).getByRole("checkbox").check();
  }
  await expect(main.getByRole("searchbox")).toHaveCount(0); // the bulk bar stands where the toolbar stood
  await expect(main.getByText("جلستان محدّدتان")).toBeVisible();
  await shot(page, "042-selected-1280");
  await main.getByRole("button", { name: "ألغِ الجلسات" }).click();
  const dialog = page.getByRole("dialog", { name: "إلغاء جلستين؟" });
  await dialog.getByLabel(/سبب الإلغاء الذي سيصل الحاضرين/).fill("القاعة مغلقة للصيانة");
  await dialog.getByRole("button", { name: "تأكيد الإلغاء" }).click();
  await expect(page.getByRole("status")).toContainText("أُلغيت جلستان", { timeout: 15_000 });
  const { rows } = await db.query<{ state: string }>(`select state from public.sessions where id = any($1) order by title`, [[ids.soon, ids.lighting]]);
  expect(rows.map((r) => r.state)).toEqual(["cancelled", "cancelled"]);
  const { rows: untouched } = await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [ids.later]);
  expect(untouched[0].state).toBe("published");
});

test("SCR-042 at 390: the same rows as cards, the chips in one row, the page never sideways", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone treatment");
  await page.setViewportSize(PHONE);
  await signIn(context);
  await goto(page, "/ar/app/admin/sessions");
  const main = page.locator("#main");
  const cards = main.getByRole("list").filter({ has: page.getByRole("link", { name: "ما تعلّمناه من إطلاق فاشل" }) });
  await expect(cards.getByRole("link", { name: "ما تعلّمناه من إطلاق فاشل" })).toBeVisible();
  await expect(main.getByRole("table")).toBeHidden();
  await expect(main.getByRole("link", { name: "التالية" })).toBeHidden();
  await expect(main.getByRole("link", { name: "المزيد" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll sideways at 390 px").toBeLessThanOrEqual(0);
  await shot(page, "042-default-390");
});
