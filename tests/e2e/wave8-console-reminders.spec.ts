// SCR-060 · /app/admin/reminders on the M9 system (wave 8, K3) — REQ-ADM-016,
// REQ-NTF-004, against REAL local Supabase. The schedule as rows of a number
// and a unit, a refusal at the row it concerns, a save that stores minutes and
// says so, and the moderator's not-found (REQ-ADM-020, DEC-134).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-console-reminders-field-error.png
//   wave8-console-reminders-saved.png
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w8-reminders-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة التذكيرات', $1, 'RM', gen_random_uuid(), $2) returning id`,
    [`w8-reminders-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة التذكيرات"],
    [modEmail, "منظّم التذكيرات"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  if (email === modEmail) {
    await db.query(`update public.members set org_role = 'moderator' where id = $1`, [(data as { member_id: string }).member_id]);
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Waits out React's streamed Suspense boundaries before strict locators. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("a moderator gets the streamed not-found page, not the schedule (REQ-ADM-020, DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/reminders");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "جدول التذكيرات" })).toHaveCount(0);
});

test("REQ-NTF-004: the default schedule reads in words, and each row in its own unit", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  await expect(page.getByRole("heading", { name: "جدول التذكيرات", level: 1 })).toBeVisible();
  const current = page.getByRole("heading", { name: "الجدول الحالي" }).locator("xpath=following-sibling::ul");
  await expect(current).toContainText("قبل 7 أيام");
  await expect(current).toContainText("قبل يوم");
  await expect(current).toContainText("قبل ساعتين");
  await expect(current).toContainText("دعوة التقييم: بعد ساعة من انتهاء الجلسة");
  await expect(page.getByLabel("التذكير 1", { exact: true })).toHaveValue("7");
  await expect(page.getByRole("combobox", { name: "التذكير 1 — الوحدة" })).toHaveValue("days");
});

test("SCR-060 at 390 px: a refusal lands at its row, and nothing is written", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  await page.getByLabel("التذكير 2", { exact: true }).fill("2");
  await page.getByRole("combobox", { name: "التذكير 2 — الوحدة" }).selectOption("minutes");
  await page.getByLabel("التذكير 3", { exact: true }).fill("7");
  await page.getByRole("combobox", { name: "التذكير 3 — الوحدة" }).selectOption("days");
  await page.getByRole("button", { name: "احفظ الجدول" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "لم يُحفظ الجدول" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link", { name: /التذكير 2/ })).toBeVisible();
  await expect(summary.getByRole("link", { name: /التذكير 3/ })).toBeVisible();
  // Each message appears twice by design — as the summary's link and under
  // its own field — so the field's copy is asserted through the control's
  // accessible description, which is also what proves the wiring.
  await expect(page.getByLabel("التذكير 2", { exact: true })).toHaveAccessibleDescription("أقصر مدة للتذكير خمس دقائق.");
  await expect(page.getByLabel("التذكير 3", { exact: true })).toHaveAccessibleDescription("هذه المدة في تذكير آخر.");
  await expect(page.locator('p[id^="reminder-offset-"][id$="-error"]').filter({ hasText: "أقصر مدة للتذكير خمس دقائق." })).toBeVisible();
  await expect(page.locator('p[id^="reminder-offset-"][id$="-error"]').filter({ hasText: "هذه المدة في تذكير آخر." })).toBeVisible();
  // What was typed survives the refusal (REQ-UIX-011).
  await expect(page.getByLabel("التذكير 2", { exact: true })).toHaveValue("2");
  // …the units too: React resets the form after the action, and a select's
  // default is never kept in step by React (`ui/select` keeps it, `dcd5f05`).
  await expect(page.getByRole("combobox", { name: "التذكير 2 — الوحدة" })).toHaveValue("minutes");
  await expect(page.getByRole("combobox", { name: "التذكير 3 — الوحدة" })).toHaveValue("days");

  const { rows } = await db.query<{ reminder_offsets_minutes: number[] }>(`select reminder_offsets_minutes from public.org_settings where org_id = $1`, [orgId]);
  expect(rows[0].reminder_offsets_minutes).toEqual([10080, 1440, 120]);

  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-reminders-field-error.png` });
});

test("REQ-ADM-016: a changed schedule saves in minutes, says so, and the page reads the new schedule back", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one project writes this org's schedule");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  await page.getByRole("button", { name: "أزل التذكير 3" }).click();
  await page.getByRole("button", { name: "أضف تذكيرًا" }).click();
  await expect(page.getByLabel("التذكير 3", { exact: true })).toBeFocused();
  await page.getByLabel("التذكير 3", { exact: true }).fill("3");
  await page.getByRole("combobox", { name: "التذكير 3 — الوحدة" }).selectOption("hours");
  await page.getByLabel("دعوة التقييم بعد انتهاء الجلسة", { exact: true }).fill("30");
  await page.getByRole("combobox", { name: "دعوة التقييم بعد انتهاء الجلسة — الوحدة" }).selectOption("minutes");
  await page.getByRole("button", { name: "احفظ الجدول" }).click();

  await expect(page.getByRole("status").filter({ hasText: "حُفظ الجدول وحُرّكت التذكيرات المعلّقة" })).toBeVisible();
  const current = page.getByRole("heading", { name: "الجدول الحالي" }).locator("xpath=following-sibling::ul");
  await expect(current).toContainText("قبل 3 ساعات");
  await expect(current).toContainText("دعوة التقييم: بعد 30 دقيقة من انتهاء الجلسة");
  const { rows } = await db.query<{ reminder_offsets_minutes: number[]; rating_prompt_delay_minutes: number }>(
    `select reminder_offsets_minutes, rating_prompt_delay_minutes from public.org_settings where org_id = $1`,
    [orgId],
  );
  expect(rows[0]).toEqual({ reminder_offsets_minutes: [10080, 1440, 180], rating_prompt_delay_minutes: 30 });
  await page.screenshot({ path: `${SHOTS}/wave8-console-reminders-saved.png` });
});
