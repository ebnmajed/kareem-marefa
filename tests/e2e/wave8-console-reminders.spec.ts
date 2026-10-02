// SCR-060 · /app/admin/reminders (wave 8, K3) — REQ-ADM-016, REQ-NTF-004, against REAL local Supabase. The
// moderator's not-found (REQ-ADM-020, DEC-134), the schedule read in its own units, a refusal at the row it concerns
// with nothing written, and a save that stores minutes and says so.
// ★ Wave 22 (ledger): the page was rebuilt from `AdminReminders.dc.html` (`DEC-232` §1.3) — read by default, three
// fixed rows and the prompt, edited through «عدّل». Selectors moved; the database read-backs did not.
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
// `globals.css` scrolls smoothly unless motion is reduced, so a viewport
// capture taken after a scroll — ours or Playwright's own before a fill —
// fired mid-animation and showed the top of the page (the lead's sync-2
// finding on the scoring captures). Reduced motion makes every scroll instant.
test.use({ reducedMotion: "reduce" });

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
  await expect(page.locator("#main").getByRole("heading", { name: "التذكيرات", exact: true })).toHaveCount(0);
});

test("REQ-NTF-004: the default schedule reads in words, each row in its own unit", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "the table reads at desktop width; the phone stack is the wave-22 spec's");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "التذكيرات", level: 1 })).toBeVisible();
  const table = main.getByRole("table", { name: "التذكيرات" });
  await expect(table).toContainText("7 أيام");
  await expect(table).toContainText("يوم");
  await expect(table).toContainText("ساعتان");
  await expect(table).toContainText("بعد ساعة من الانتهاء");
  await main.getByRole("link", { name: "عدّل" }).click();
  await expect(main.getByRole("spinbutton", { name: /^التذكير قبل الجلسة بأسبوع — التوقيت/ })).toHaveValue("7");
  await expect(main.getByRole("combobox", { name: "التذكير قبل الجلسة بأسبوع — التوقيت — الوحدة" })).toHaveValue("days");
});

test("SCR-060 at 390 px: a refusal lands at its row, and nothing is written", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders?edit");
  const main = page.locator("#main");
  const week = main.getByRole("spinbutton", { name: /^التذكير قبل الجلسة بأسبوع — التوقيت/ });
  await week.fill("2");
  await main.getByRole("combobox", { name: "التذكير قبل الجلسة بأسبوع — التوقيت — الوحدة" }).selectOption("minutes");
  await main.getByRole("button", { name: /^احفظ/ }).click();

  const summary = main.getByRole("alert").filter({ hasText: "لم يُحفظ الجدول" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link", { name: /التذكير قبل الجلسة بأسبوع/ })).toBeVisible();
  await expect(week).toHaveAccessibleDescription("بين 6 و8 أيام.");
  // What was typed survives the refusal (REQ-UIX-011), the unit too.
  await expect(week).toHaveValue("2");
  await expect(main.getByRole("combobox", { name: "التذكير قبل الجلسة بأسبوع — التوقيت — الوحدة" })).toHaveValue("minutes");

  const { rows } = await db.query<{ reminder_offsets_minutes: number[] }>(`select reminder_offsets_minutes from public.org_settings where org_id = $1`, [orgId]);
  expect(rows[0].reminder_offsets_minutes).toEqual([10080, 1440, 120]);

  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-reminders-field-error.png` });
});

test("REQ-ADM-016: a changed schedule saves in minutes, says so, and the page reads the new schedule back", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one project writes this org's schedule");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders?edit");
  const main = page.locator("#main");
  await main.getByRole("spinbutton", { name: /^التذكير قبل الجلسة بساعتين — التوقيت/ }).fill("140");
  await main.getByRole("combobox", { name: "التذكير قبل الجلسة بساعتين — التوقيت — الوحدة" }).selectOption("minutes");
  await main.getByRole("spinbutton", { name: /^دعوة التقييم — التوقيت/ }).fill("30");
  await main.getByRole("combobox", { name: "دعوة التقييم — التوقيت — الوحدة" }).selectOption("minutes");
  await main.getByRole("button", { name: /^احفظ/ }).click();

  await expect(page.getByRole("status").filter({ hasText: /^حُفظ$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/reminders$/);
  await expect(main).toContainText("140 دقيقة");
  await expect(main).toContainText("بعد 30 دقيقة من الانتهاء");
  const { rows } = await db.query<{ reminder_offsets_minutes: number[]; rating_prompt_delay_minutes: number }>(
    `select reminder_offsets_minutes, rating_prompt_delay_minutes from public.org_settings where org_id = $1`,
    [orgId],
  );
  expect(rows[0]).toEqual({ reminder_offsets_minutes: [10080, 1440, 140], rating_prompt_delay_minutes: 30 });
  await page.screenshot({ path: `${SHOTS}/wave8-console-reminders-saved.png` });
});
