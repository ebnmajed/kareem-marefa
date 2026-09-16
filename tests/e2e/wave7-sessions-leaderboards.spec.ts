// SCR-027 · SCR-028 on the M9 system, wave 7 — three boards as linked tabs
// (DEC-137, DEC-141 ruling 6). The review captures, and what only a browser
// shows: the tabs are links a member can share, the company race puts both
// metrics on every row, and nothing scrolls sideways at 390 px.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-leaderboards-members.png · -companies.png
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
let viewerEmail = "";
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
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w7-boards-${tag}.example`;
  const org = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة لوحات الصدارة', $1, 'WL', gen_random_uuid()) returning id`,
    [`e2e-w7-boards-${tag}`],
  );
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const companies = await db.query<{ id: string }>(
    `insert into public.companies (org_id, name) values ($1, 'الشركة الأولى'), ($1, 'الشركة الثانية') returning id`,
    [orgId],
  );

  const people: [string, string, number, number][] = [
    ["reem", "ريم العتيبي", 140, 0],
    ["saad", "سعد الحربي", 220, 0],
    ["noura", "نورة القحطاني", 95, 1],
    ["khalid", "خالد الشمري", 60, 1],
  ];
  for (const [local, name, points, company] of people) {
    const email = `${local}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const memberId = await provision(email);
    await db.query(`update public.members set company_id = $1 where id = $2`, [companies.rows[company].id, memberId]);
    await db.query(
      `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, $3, 'manual_adjustment', 'اختبار', $4)`,
      [orgId, memberId, points, `e2e:w7-boards:${memberId}`],
    );
    if (local === "reem") viewerEmail = email;
  }
  await db.query(`select public.snapshot_leaderboard($1, 'company', null, null, null, false)`, [orgId]);
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
  const { error } = await client.auth.signInWithPassword({ email: viewerEmail, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-leaderboards-${name}.png`), fullPage: true });
  }
}

test("members: the all-time board is the default tab, ranked, with the viewer marked and no faces", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/leaderboards");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحات الصدارة");
  await expect(page.getByRole("tab", { name: "كل الأوقات" })).toHaveAttribute("aria-selected", "true");
  const board = page.locator("#all-time");
  const names = await board.locator("li a").allTextContents();
  expect(names).toEqual(["سعد الحربي", "ريم العتيبي", "نورة القحطاني", "خالد الشمري"]);
  await expect(board.locator("li", { hasText: "ريم العتيبي" })).toContainText("أنت");
  await expect(board.locator("img")).toHaveCount(0);

  await capture(page, "members");
});

test("companies: its own linked tab, both metrics on every row, the ranking one marked", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/leaderboards");
  await page.getByRole("tab", { name: "سباق الشركات" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/leaderboards\?board=companies$/);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);

  const race = page.locator("#company");
  for (const name of ["الشركة الأولى", "الشركة الثانية"]) {
    const row = race.locator("li", { hasText: name });
    await expect(row.getByText("مجموع النقاط")).toBeVisible();
    await expect(row.getByText("نقاط لكل عضو نشط")).toBeVisible();
    await expect(row.getByText("الترتيب حسبه")).toHaveCount(1);
  }
  await expect(page.locator("#company-breakdown")).toBeVisible();

  await capture(page, "companies");
});
