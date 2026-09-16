// SCR-058 · /app/admin/emails on the M9 system (wave 8, K6) — REQ-ADM-014,
// REQ-NTF-007, REQ-NTF-008, against REAL local Supabase. What the screen does
// today — not the email studio: the catalogue with the matrix, a save the
// trigger refuses said at the field it names, a template saved and its default
// restored after a confirmation, the delivery log with a failure's reason; the
// moderator's not-found (REQ-ADM-020, DEC-134).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-console-emails-catalogue.png
//   wave8-console-emails-refused-save.png
//   wave8-console-emails-delivery-failure.png
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
const PROVIDER_ERROR = 'resend 422: {"statusCode":422,"message":"Invalid `to` field."}';

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w8-emails-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  const memberEmail = `sara@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة البريد', $1, 'EM', gen_random_uuid(), $2) returning id`,
    [`w8-emails-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة البريد"],
    [modEmail, "منظّم البريد"],
    [memberEmail, "سارة العتيبي"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provision(adminEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [await provision(modEmail)]);
  const saraId = await provision(memberEmail);
  // A send the provider refused this morning — the worker writes this row
  // (`send_notification.ts`); arranged directly here.
  await db.query(`insert into public.email_deliveries (org_id, member_id, key, status, error) values ($1, $2, 'MSG-reminder_1d', 'failed', $3)`, [orgId, saraId, PROVIDER_ERROR]);
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  // A refresh that fails leaves the jar empty and the page signed out — said
  // here, not as a label that never appears 30 s later.
  const { error: refreshError } = await client.auth.refreshSession();
  if (refreshError) throw refreshError;
  expect(jar.length, "the refreshed session wrote no cookies").toBeGreaterThan(0);
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("a moderator gets the streamed not-found page (REQ-ADM-020, DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/emails");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "البريد", level: 1 })).toHaveCount(0);
});

test("SCR-058 at 390 px: the catalogue with the matrix, and this morning's failure said at the top", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails");
  await expect(page.getByRole("heading", { name: "البريد", level: 1 })).toBeVisible();
  await expect(page.getByText("تعذّر إرسال رسالة واحدة خلال آخر سبعة أيام.", { exact: false })).toBeVisible();
  await expect(page.getByText("تصل دائمًا", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("يمكن للعضو إيقافها", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave8-console-emails-catalogue.png` });
});

test("REQ-NTF-007 at 390 px: the trigger's refusal lands at the body, naming the field, with what was typed kept", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");
  // The editor is open before anything is typed: a failure here names the
  // page that rendered instead (the phone run at 5a8f5bc timed out on the
  // label with nothing to say why).
  await expect(page.getByRole("heading", { name: "البريد", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "قالب «تذكير قبل الجلسة بيوم»", level: 2 })).toBeVisible();
  await page.getByLabel("الموضوع", { exact: false }).fill("جلستك غدًا");
  await page.getByLabel("النص", { exact: false }).first().fill("مرحبًا، نذكّرك بجلسة الغد.");
  await page.getByLabel("الحقول المطلوبة", { exact: true }).fill("title");
  await page.getByRole("button", { name: "احفظ القالب" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "لم يُحفظ القالب" })).toBeVisible();
  await expect(page.getByText("النص والموضوع لا يحتويان على الحقل title.").last()).toBeVisible();
  await expect(page.getByLabel("الموضوع", { exact: false })).toHaveValue("جلستك غدًا");
  const { rows } = await db.query(`select id from public.notification_templates where org_id = $1`, [orgId]);
  expect(rows).toHaveLength(0);
  await page.getByRole("alert").filter({ hasText: "لم يُحفظ القالب" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-emails-refused-save.png` });
});

test("REQ-NTF-007: a template saved, then its default restored after a confirmation", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's templates");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");
  // The editor is open before anything is typed: a failure here names the
  // page that rendered instead (the phone run at 5a8f5bc timed out on the
  // label with nothing to say why).
  await expect(page.getByRole("heading", { name: "البريد", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "قالب «تذكير قبل الجلسة بيوم»", level: 2 })).toBeVisible();
  await page.getByLabel("الموضوع", { exact: false }).fill("جلستك غدًا");
  await page.getByLabel("النص", { exact: false }).first().fill("مرحبًا، نذكّرك بجلسة {{title}} غدًا.");
  await page.getByLabel("الحقول المطلوبة", { exact: true }).fill("title");
  await page.getByRole("button", { name: "احفظ القالب" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ القالب" })).toBeVisible();
  await expect(page.getByText("تصل هذه الرسالة بقالب مؤسستك.")).toBeVisible();

  await page.getByRole("button", { name: "استعد القالب الافتراضي" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("لا يمكن استرجاع قالبك بعد ذلك");
  await confirm.getByRole("button", { name: "احذف قالب المؤسسة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "عادت الرسالة إلى القالب الافتراضي" })).toBeVisible();
  const { rows } = await db.query(`select id from public.notification_templates where org_id = $1`, [orgId]);
  expect(rows).toHaveLength(0);
});

test("REQ-NTF-008 at 390 px: the delivery log shows the failure with its reason, in words and in the provider's own", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails");
  await page.getByRole("link", { name: "اعرض الإخفاقات" }).click();
  await expect(page).toHaveURL(/view=log&status=failed/);
  const card = page.getByRole("listitem").filter({ hasText: "سارة العتيبي" });
  await expect(card).toContainText("فشلت");
  await expect(card).toContainText("رفض مزوّد البريد الرسالة.");
  await expect(card).toContainText("Invalid `to` field.");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-emails-delivery-failure.png` });
});
