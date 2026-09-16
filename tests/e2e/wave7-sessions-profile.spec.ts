// SCR-020 on the M9 system, wave 7 — a profile in each tier (REQ-PRF-004, A33,
// DEC-137, DEC-141 ruling 4). The DAL decides the tier and is unit-tested
// there; this proves what a browser shows each viewer, and that the admin's
// rows never reach a member's page.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-profile-member.png · -self.png · -admin.png
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
let promoted = false;
const emails = { subject: "", colleague: "", admin: "" };
let subjectId = "";
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
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
  promoted = (await db.query(`select to_regprocedure('public.admin_member_profile(uuid)') is not null as ok`)).rows[0].ok;

  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w7-profile-${tag}.example`;
  const org = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الملفات', $1, 'WM', gen_random_uuid()) returning id`,
    [`e2e-w7-profile-${tag}`],
  );
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const company = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'الشركة الأولى') returning id`, [orgId]);
  const category = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const venue = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الابتكار', 40) returning id`, [orgId]);

  const ids: Record<string, string> = {};
  for (const [key, name] of [
    ["subject", "ريم العتيبي"],
    ["colleague", "سعد الحربي"],
    ["admin", "مشرف المؤسسة"],
  ] as const) {
    const email = `${key}@${domain}`;
    emails[key] = email;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    ids[key] = await provision(email);
  }
  subjectId = ids.subject;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`update public.members set company_id = $1, job_title = 'محلّلة بيانات', bio = 'أحب تبسيط التقارير الشهرية.' where id = $2`, [company.rows[0].id, subjectId]);
  await db.query(`insert into public.member_interests (org_id, member_id, category_id) values ($1, $2, $3)`, [orgId, subjectId, category.rows[0].id]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 140, 'manual_adjustment', 'اختبار', $3)`,
    [orgId, subjectId, `e2e:w7-profile:${subjectId}`],
  );

  const session = async (title: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'ملخص', $3, 'introductory', now() - interval '5 days', 60, now() - interval '5 days' + interval '1 hour', $4, 30, 'completed', now() - interval '6 days', now() - interval '5 days')
         returning id`,
        [orgId, title, category.rows[0].id, venue.rows[0].id],
      )
    ).rows[0].id;
  const presented = await session("كيف اختصرنا وقت التقارير الشهرية");
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, presented, subjectId]);
  const attended = await session("مقدمة في قراءة الميزانية");
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار آلي', $4, tstzrange(now() - interval '6 days', now() - interval '5 days'))`,
    [orgId, attended, subjectId, ids.admin],
  );
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
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

async function open(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/members/${subjectId}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-profile-${name}.png`), fullPage: true });
  }
}

test("member tier: who they are, what they earned, what they presented — and nothing an admin sees", async ({ context, page }) => {
  await signIn(context, emails.colleague);
  await open(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ريم العتيبي");
  await expect(page.getByText("الشركة الأولى")).toBeVisible();
  await expect(page.getByText("أحب تبسيط التقارير الشهرية.")).toBeVisible();
  await expect(page.locator("section", { has: page.locator("#standing") })).toContainText("140");
  await expect(page.getByRole("link", { name: /كيف اختصرنا وقت التقارير الشهرية/ })).toBeVisible();
  // A33: none of the admin's rows, and not the email.
  await expect(page.getByRole("heading", { name: "للمشرفين" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(emails.subject);
  await expect(page.getByText("مقدمة في قراءة الميزانية")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "عدّل ملفك" })).toHaveCount(0);

  await capture(page, "member");
});

test("self tier: the same profile, said to be what colleagues see, with the way to edit it", async ({ context, page }) => {
  await signIn(context, emails.subject);
  await open(page);

  await expect(page.getByText("هكذا يرى زملاؤك ملفك.")).toBeVisible();
  await expect(page.getByRole("link", { name: "عدّل ملفك" })).toHaveAttribute("href", "/ar/app/me");
  await expect(page.getByRole("heading", { name: "للمشرفين" })).toHaveCount(0);

  await capture(page, "self");
});

test("admin tier: the member tier plus email, attendance and the record", async ({ context, page }) => {
  test.skip(!promoted, "needs supabase/proposed/sessions/01_admin_member_profile.sql promoted (ask the lead)");
  await signIn(context, emails.admin);
  await open(page);

  const record = page.locator("section", { has: page.getByRole("heading", { name: "للمشرفين" }) });
  await expect(record).toBeVisible();
  await expect(record).toContainText(emails.subject);
  await expect(record).toContainText("مقدمة في قراءة الميزانية");

  await capture(page, "admin");
});

test("a moderator is the member tier (A33)", async ({ context, page }) => {
  await db.query(`update public.members set org_role = 'moderator' where org_id = $1 and email = $2`, [orgId, emails.colleague]);
  await signIn(context, emails.colleague);
  await open(page);
  await expect(page.getByRole("heading", { name: "للمشرفين" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(emails.subject);
});
