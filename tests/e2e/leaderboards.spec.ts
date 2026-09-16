// SCR-027/SCR-028 · /app/leaderboards against REAL local Supabase
// (STORY-LDR-001…004). Same shape as tests/e2e/points.spec.ts.
//
// Needs supabase/proposed/scoring/000{8,9}*.sql promoted into
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
let leaderUserId = "";
let leaderEmail = "";
let leaderMemberId = "";
let companyId = "";
let companyName = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // desktop and phone share one database (TEAM.md §5's trap) — a tag by
  // time alone can collide when both workers hit beforeAll in the same
  // millisecond, which is exactly what happened once here.
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `leaderboards-e2e-${tag}.example`;
  companyName = `شركة اللوحة ${tag}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة لوحات الصدارة', $1, 'LE', gen_random_uuid()) returning id`,
    [`leaderboards-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: companyRows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, $2) returning id`, [orgId, companyName]);
  companyId = companyRows[0].id;

  leaderEmail = `leader@${domain}`;
  const { data: leaderAuth, error } = await admin.auth.admin.createUser({
    email: leaderEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "قائد اللوحة" },
  });
  if (error) throw error;
  leaderUserId = leaderAuth.user.id;
});

test.afterAll(async () => {
  if (leaderUserId) await admin.auth.admin.deleteUser(leaderUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

test("a member sees the all-time board, and both metrics on the company race", async ({ context, page }) => {
  leaderMemberId = await signIn(context, leaderEmail);
  await db.query(`update public.members set company_id = $1 where id = $2`, [companyId, leaderMemberId]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 65, 'manual_adjustment', 'اختبار', $3)`,
    [orgId, leaderMemberId, `e2e:ldr:${leaderMemberId}`],
  );

  await page.goto("/ar/app/leaderboards");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحات الصدارة");
  const allTimeSection = page.locator("#all-time");
  await expect(allTimeSection.getByText("قائد اللوحة")).toBeVisible();
  await expect(allTimeSection).toContainText("65");
  await expect(allTimeSection.getByText("أنت")).toBeVisible();

  // The company board — a snapshot must exist for a row to appear, so
  // build one directly (what worker/src/tasks/snapshot_leaderboards.ts
  // would do on its own schedule).
  await db.query(`select public.snapshot_leaderboard($1, 'company', null, null, null, false)`, [orgId]);
  // Wave 7 (DEC-141 ruling 6): the company race is its own linked tab.
  await page.goto("/ar/app/leaderboards?board=companies");
  const companySection = page.locator("#company");
  // Scoped to the row itself: both metric labels appear on every row, and the
  // ranking one carries «الترتيب حسبه» (REQ-LDR-004, REQ-LDR-005).
  const companyRow = companySection.locator("li", { hasText: companyName });
  await expect(companyRow).toBeVisible();
  await expect(companyRow.getByText("مجموع النقاط")).toBeVisible();
  await expect(companyRow.getByText("نقاط لكل عضو نشط")).toBeVisible();
  await expect(companyRow.getByText("الترتيب حسبه")).toHaveCount(1);
});
