// SCR-015 on the M9 system, wave 7 — ratings only (DEC-137, DEC-141).
//
// The one thing on this screen that can silently corrupt data is the direction
// the stars fill: a row that fills left-to-right in Arabic reads as one star
// when the member meant five (`09` SCR-015). So this measures it in a real
// renderer — star 1 is at the RIGHT, the leftmost star is five, choosing it
// stores 5 — and measures which way the browser's own arrow keys move in an
// RTL radio group rather than assuming it.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-rate-empty.png · -chosen.png · -error.png · -submitted.png
//   · -closed.png · -not-eligible.png
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
let userId = "";
const ids = { open: "", closed: "", notAttended: "" };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w7-rate-${tag}.example`;
  const org = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة التقييم', $1, 'WR', gen_random_uuid()) returning id`,
    [`e2e-w7-rate-${tag}`],
  );
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const venue = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userId = data.user.id;
  // Provision now, so the member row exists for the check-ins below.
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { data: envelope } = await client.rpc("provision_member");
  const memberId = (envelope as { member_id: string }).member_id;

  const session = async (title: string, daysAgo: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'ملخص الجلسة', $3, 'introductory', now() - make_interval(days => $5), 60, now() - make_interval(days => $5) + interval '1 hour', $4, 30, 'completed',
                 now() - make_interval(days => $5 + 1), now() - make_interval(days => $5))
         returning id`,
        [orgId, title, category.rows[0].id, venue.rows[0].id, daysAgo],
      )
    ).rows[0].id;
  const checkIn = async (sessionId: string, daysAgo: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'اختبار آلي', $3, tstzrange(now() - make_interval(days => $4 + 1), now() - make_interval(days => $4)))
         returning id`,
        [orgId, sessionId, memberId, daysAgo],
      )
    ).rows[0].id;

  ids.open = await session("كيف اختصرنا وقت التقارير الشهرية", 2);
  await checkIn(ids.open, 2);
  ids.closed = await session("مقدمة في قراءة الميزانية", 30);
  const closedCheckIn = await checkIn(ids.closed, 30);
  await db.query(
    `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, comment)
     values ($1, $2, $3, $4, 4, 5, 'مثال عملي واضح.')`,
    [orgId, ids.closed, memberId, closedCheckIn],
  );
  ids.notAttended = await session("جلسة لم أحضرها", 3);
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-rate-${name}.png`), fullPage: true });
  }
}

/** How many stars in a row are drawn filled — read from the painted fill, not from state. */
async function filled(page: Page, legend: string) {
  return page.getByRole("radiogroup", { name: new RegExp(legend) }).locator("path").evaluateAll((paths) =>
    paths.map((p) => getComputedStyle(p).fill !== "none"),
  );
}

test("empty: the promise, the window, two required star rows, nothing filled", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("قيّم الجلسة");
  await expect(page.getByText(/تقييمك مجهول للمُقدِّم/)).toBeVisible();
  await expect(page.getByText(/يُغلق باب التقييم في/)).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(2);
  expect(await filled(page, "تقييم الجلسة")).toEqual([false, false, false, false, false]);

  await capture(page, "empty");
});

test("★ the stars fill from the right: star 1 is rightmost, the leftmost is five, and five is what gets stored", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);

  const row = page.getByRole("radiogroup", { name: /تقييم الجلسة/ });
  const one = await row.getByRole("radio", { name: "نجمة واحدة" }).locator("xpath=..").boundingBox();
  const five = await row.getByRole("radio", { name: "5 نجوم" }).locator("xpath=..").boundingBox();
  expect(one!.x).toBeGreaterThan(five!.x);

  // Press the LEFTMOST star — what a member means by «five» in Arabic.
  await row.locator("label").last().click();
  await expect(row.getByRole("radio", { name: "5 نجوم" })).toBeChecked();
  expect(await filled(page, "تقييم الجلسة")).toEqual([true, true, true, true, true]);

  // Three, and the fill stops at the third from the right.
  await row.getByRole("radio", { name: "3 نجوم" }).check();
  expect(await filled(page, "تقييم الجلسة")).toEqual([true, true, true, false, false]);

  // The browser's own arrow keys, measured: in RTL, ArrowLeft should move toward the left — to four.
  await row.getByRole("radio", { name: "3 نجوم" }).focus();
  await page.keyboard.press("ArrowLeft");
  const afterLeft = await row.locator("input:checked").getAttribute("value");
  test.info().annotations.push({ type: "rtl-arrow-left-from-3", description: afterLeft ?? "none" });
  expect(afterLeft, "ArrowLeft in an RTL radio group moves toward the inline end").toBe("4");

  await row.getByRole("radio", { name: "5 نجوم" }).check();
  await capture(page, "chosen");
});

test("error: a missing row is a field error and a summary line, and the chosen row and the comment stay", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);

  await page.getByRole("radiogroup", { name: /تقييم الجلسة/ }).getByRole("radio", { name: "5 نجوم" }).check();
  await page.getByLabel("ملاحظات (اختياري)").fill("مثال عملي واضح.");
  await page.getByRole("button", { name: "إرسال التقييم" }).click();

  const summary = page.locator("form[novalidate] [role=alert]");
  await expect(summary).toContainText("لم نستطع إرسال تقييمك");
  await expect(summary.getByRole("link")).toHaveCount(1);
  await expect(page.locator("#presenterStars-error")).toHaveText("اختر عدد النجوم");
  await expect(page.getByRole("radiogroup", { name: /تقييم الجلسة/ }).getByRole("radio", { name: "5 نجوم" })).toBeChecked();
  await expect(page.getByLabel("ملاحظات (اختياري)")).toHaveValue("مثال عملي واضح.");

  await capture(page, "error");
});

test("submitted: the rating is stored as chosen and the page says so, with the stars", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);

  await page.getByRole("radiogroup", { name: /تقييم الجلسة/ }).locator("label").last().click();
  await page.getByRole("radiogroup", { name: /تقييم المُقدِّم/ }).getByRole("radio", { name: "4 نجوم" }).check();
  await page.getByRole("button", { name: "إرسال التقييم" }).click();

  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${ids.open}/rate\\?rated=1$`));
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "تم إرسال تقييمك" })).toBeVisible();
  await expect(page.getByRole("img", { name: "تقييم الجلسة: 5 نجوم" })).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديث التقييم" })).toBeVisible();

  const { rows } = await db.query<{ session_stars: number; presenter_stars: number }>(`select session_stars, presenter_stars from public.ratings where session_id = $1`, [ids.open]);
  expect(rows).toEqual([{ session_stars: 5, presenter_stars: 4 }]);

  await capture(page, "submitted");
});

test("closed: the saved rating, read-only, and no form", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.closed}/rate`);

  await expect(page.getByText("أُغلق باب التقييم لهذه الجلسة")).toBeVisible();
  await expect(page.getByRole("img", { name: "تقييم المُقدِّم: 5 نجوم" })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);

  await capture(page, "closed");
});

test("not eligible: the reason and the way back, no form", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.notAttended}/rate`);

  await expect(page.getByText("التقييم متاح لمن سجّل حضوره فقط")).toBeVisible();
  await expect(page.getByRole("link", { name: "العودة إلى الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${ids.notAttended}`);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);

  await capture(page, "not-eligible");
});
