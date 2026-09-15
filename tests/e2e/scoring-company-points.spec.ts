// SCR-053's new "company rules" section and SCR-028's new "your company's
// points" breakdown, against REAL local Supabase — the admin rows and the
// board column the story's Definition of Done asks for. Same shape as
// tests/e2e/leaderboards.spec.ts and tests/e2e/scoring-screens.spec.ts.
//
// Needs supabase/proposed/scoring/0001_company_points.sql promoted into
// supabase/migrations/ first — the lead does that at a sync point.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let adminUserId = "";
let adminEmail = "";
let adminMemberId = "";
let companyId = "";
let companyName = "";
let sessionId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `company-pts-e2e-${tag}.example`;
  companyName = `شركة النقاط ${tag}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة نقاط الشركات', $1, 'CP', gen_random_uuid()) returning id`,
    [`company-pts-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id, numerals) values ($1, 'arabic_indic')`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: companyRows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, $2) returning id`, [
    orgId,
    companyName,
  ]);
  companyId = companyRows[0].id;
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة', 40) returning id`, [
    orgId,
  ]);
  const { rows: sessionRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة نقاط الشركات', 'ملخص', $2, 'introductory', now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour') returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessionRows[0].id;

  adminEmail = `admin@${domain}`;
  const { data: adminAuth, error } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "مشرف النقاط" },
  });
  if (error) throw error;
  adminUserId = adminAuth.user.id;
});

test.afterAll(async () => {
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

test("an admin edits the company rules on /app/admin/scoring, and the change applies forward only", async ({ context, page }) => {
  adminMemberId = await signIn(context);
  await db.query(`update public.members set org_role = 'admin', company_id = $1 where id = $2`, [companyId, adminMemberId]);
  await context.clearCookies();
  await signIn(context);

  await page.goto("/ar/app/admin/scoring");
  await expect(page.getByRole("heading", { name: "نقاط الشركات" })).toBeVisible();

  // The hosting rule's points field — a plain admin edit, same as the
  // member catalogue above it.
  const hostingForm = page.locator("li", { hasText: "استضافة جلسة" }).locator("form");
  await hostingForm.getByLabel("النقاط لكل جلسة مُستضافة").fill("42");
  await hostingForm.getByRole("button", { name: "حفظ" }).click();
  await expect(page).toHaveURL(/saved=1/);

  const [row] = (await db.query(`select points, version from public.company_scoring_rules where org_id = $1 and action_key = 'company_hosting'`, [orgId]))
    .rows as Array<{ points: number; version: number }>;
  expect(row).toMatchObject({ points: 42, version: 2 });

  // The stopgap host-company assignment form.
  await page.goto("/ar/app/admin/scoring");
  await page.getByLabel("معرّف الجلسة").fill(sessionId);
  await page.getByLabel("الشركة المستضيفة").selectOption({ label: companyName });
  await page.getByRole("button", { name: "حفظ", exact: true }).last().click();
  await expect(page).toHaveURL(/saved=1/);

  const [sessionRow] = (await db.query(`select host_company_id from public.sessions where id = $1`, [sessionId])).rows as Array<{
    host_company_id: string;
  }>;
  expect(sessionRow.host_company_id).toBe(companyId);
});

test("the company board's breakdown shows the company ledger's points, explained", async ({ context, page }) => {
  await db.query(
    `insert into public.company_points_ledger (org_id, company_id, amount, source, session_id, reason, idempotency_key, meta)
     values ($1, $2, 42, 'company_hosting', $3, 'استضافة جلسة', $4, '{}'::jsonb)`,
    [orgId, companyId, sessionId, `e2e:company_hosting:${sessionId}:${companyId}`],
  );

  await context.clearCookies();
  await signIn(context);
  await page.goto("/ar/app/leaderboards");

  const breakdown = page.locator("#company-breakdown");
  await expect(breakdown.getByRole("heading", { name: "كيف حصلت شركتك على نقاطها" })).toBeVisible();
  await expect(breakdown).toContainText("٤٢");
  await expect(breakdown).toContainText("استضافة جلسة");
});
