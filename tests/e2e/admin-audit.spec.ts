// SCR-062 · /app/admin/audit — against REAL local Supabase (REQ-ADM-018),
// rebuilt for wave 8 (K1) onto the M9 system. Proves: an admin sees the
// whole org's log and a moderator only their own actions (03 §5.10a); every
// action reads in Arabic; the filters narrow by action and by the org's own
// days — a range INCLUDES the day it ends on, which it did not before; the
// log pages fifty at a time; a member gets the streamed not-found (DEC-134).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-console-audit-filters-sheet.png
//   wave8-console-audit-filtered-admin.png
//   wave8-console-audit-filtered-moderator.png
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
let memberEmail = "";
let adminMemberId = "";
let modMemberId = "";
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `admin-audit-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة السجل', $1, 'AU', gen_random_uuid(), $2) returning id`,
    [`admin-audit-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة السجل"],
    [modEmail, "منظّم السجل"],
    [memberEmail, "عضو السجل"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  adminMemberId = await provisionMemberId(adminEmail);
  modMemberId = await provisionMemberId(modEmail);
  const memberId = await provisionMemberId(memberEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  // Arranged directly — this track's DAL only READS `audit_log`; every write
  // path is proven where it is written. The provisioning above wrote its own
  // `member.provisioned` rows too, as the system.
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, subject_id, reason) values ($1, $2, 'admin', 'member.role_changed', 'member', $3, 'ترقية عضو')`,
    [orgId, adminMemberId, memberId],
  );
  await db.query(`insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, reason) values ($1, $2, 'moderator', 'comment.removed', 'comment', 'محتوى مسيء')`, [
    orgId,
    modMemberId,
  ]);
  // Forty days old: outside «آخر سبعة أيام» and outside a range ending today.
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, reason, occurred_at) values ($1, $2, 'moderator', 'photo.removed', 'photo', 'صورة قديمة', now() - interval '40 days')`,
    [orgId, modMemberId],
  );
  // Fifty-five old publishes, a hundred days back — enough for two pages of one
  // action, and too old to push the rows above off the first page.
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, reason, occurred_at)
     select $1, $2, 'admin', 'session.published', 'session', 'نشر رقم ' || n, now() - interval '100 days' - n * interval '1 minute'
       from generate_series(1, 55) as n`,
    [orgId, adminMemberId],
  );
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
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Waits out React's streamed Suspense boundaries before strict locators. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/** The log renders a table from `md` and a card list below it; read whichever is on screen. */
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

test("a member gets the streamed not-found page, not the log (DEC-134)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/admin/audit");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "سجل التدقيق" })).toHaveCount(0);
});

test("REQ-ADM-018: an admin sees the whole org's log, each action in Arabic", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/audit");
  await expect(page.getByRole("heading", { name: "سجل التدقيق", level: 1 })).toBeVisible();
  await expect(shown(page, "ترقية عضو")).toBeVisible();
  await expect(shown(page, "تغيير دور عضو")).toBeVisible();
  await expect(shown(page, "محتوى مسيء")).toBeVisible();
  await expect(shown(page, "إزالة تعليق")).toBeVisible();
});

test("03 §5.10a: a moderator sees only their own actions, never the admin's, and no actor filter", async ({ context, page }) => {
  await signIn(context, modEmail);
  await goto(page, "/ar/app/admin/audit?period=30d");
  await expect(shown(page, "محتوى مسيء")).toBeVisible();
  await expect(page.getByText("ترقية عضو", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("الفاعل", { exact: true })).toHaveCount(0);
});

test("the action filter narrows the list, and its chip removes it", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the panel form is the desktop treatment; the sheet is captured on the phone");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/audit");
  await page.getByLabel("الإجراء", { exact: true }).selectOption("comment.removed");
  await page.getByRole("button", { name: "طبّق" }).click();
  await expect(page).toHaveURL(/action=comment\.removed/);
  await expect(shown(page, "محتوى مسيء")).toBeVisible();
  await expect(page.getByText("ترقية عضو", { exact: true })).toHaveCount(0);

  await page.getByRole("group", { name: "الفلاتر المطبّقة" }).getByRole("link", { name: /أزل الفلتر/ }).click();
  await expect(page).not.toHaveURL(/action=/);
  await expect(shown(page, "ترقية عضو")).toBeVisible();
});

test("★ a custom range includes the day it ends on, in the org's own days; «آخر سبعة أيام» leaves out older rows", async ({ context, page }) => {
  await signIn(context, adminEmail);
  const today = todayInRiyadh();
  await goto(page, `/ar/app/admin/audit?period=custom&from=${today}&to=${today}`);
  await expect(shown(page, "ترقية عضو")).toBeVisible();
  await expect(page.getByText("صورة قديمة", { exact: true })).toHaveCount(0);

  await goto(page, "/ar/app/admin/audit?period=7d");
  await expect(shown(page, "ترقية عضو")).toBeVisible();
  await expect(page.getByText("صورة قديمة", { exact: true })).toHaveCount(0);

  await goto(page, "/ar/app/admin/audit?period=30d");
  await expect(page.getByText("صورة قديمة", { exact: true })).toHaveCount(0);
  await goto(page, "/ar/app/admin/audit?action=photo.removed");
  await expect(shown(page, "صورة قديمة")).toBeVisible();
});

test("the log pages fifty at a time, and the older page holds the rest", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/audit?action=session.published");
  // Fifty is Arabic's «many» form: «50 إجراءً».
  await expect(page.getByText(/50 إجراءً، الأحدث أولًا/)).toBeVisible();
  await expect(shown(page, "نشر رقم 1")).toBeVisible();
  await expect(page.getByText("نشر رقم 55", { exact: true })).toHaveCount(0);

  await page.getByRole("navigation", { name: "صفحات السجل" }).getByRole("link", { name: /إجراءات أقدم/ }).click();
  await expect(page).toHaveURL(/before=/);
  await expect(shown(page, "نشر رقم 55")).toBeVisible();
  await expect(page.getByText("نشر رقم 1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "صفحات السجل" }).getByRole("link", { name: "عُد إلى الأحدث" })).toBeVisible();
});

test("SCR-062 at 390 px RTL: the filters in a sheet, the log as cards, never sideways — as an admin", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/audit");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.getByRole("button", { name: "تصفية", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "تصفية السجل" });
  await sheet.getByLabel("الإجراء", { exact: true }).selectOption("member.role_changed");
  await sheet.getByLabel("المدة", { exact: true }).selectOption("7d");
  await page.screenshot({ path: `${SHOTS}/wave8-console-audit-filters-sheet.png` });
  await sheet.getByRole("button", { name: "طبّق" }).click();

  await expect(page).toHaveURL(/action=member\.role_changed/);
  await expect(page.getByRole("button", { name: "تصفية (2)" })).toBeVisible();
  await expect(shown(page, "ترقية عضو")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the log must not scroll sideways at 390 px").toBe(true);
  await page.screenshot({ path: `${SHOTS}/wave8-console-audit-filtered-admin.png` });
});

test("SCR-062 at 390 px RTL: filtered, as a moderator", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, modEmail);
  await goto(page, "/ar/app/admin/audit?action=comment.removed&period=30d");
  await expect(shown(page, "محتوى مسيء")).toBeVisible();
  await expect(page.getByText("إجراءاتك أنت وحدها", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/wave8-console-audit-filtered-moderator.png` });
});
