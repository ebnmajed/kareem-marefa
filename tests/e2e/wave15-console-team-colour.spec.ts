// K2 — `DEC-183` §4.11, `DEC-186` §8, `docs/plan/notes/console.md`'s "Wave 15
// plan": SCR-048's team colour, in TODAY's look (the scope is not this
// screen's — nothing under `/app/admin` moves this wave). An org admin picks
// one of the seven named colours, or «بلا لون», through the per-row menu;
// no free hex is offered; the choice is audited.
//
// Capture, phone project only, 390 × 844, viewport screenshot (not an
// element screenshot — `wave13-console-templates.spec.ts`'s own finding):
//   wave15-console-team-colour.png   /app/admin/companies, the menu open
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE = { width: 390, height: 844 };
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let companyId = "";
let email = "";
let userId = "";

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the one capture is the phone treatment");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave15-console-tc-${tag}.example`;
  email = `boss@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الألوان', $1, 'TC', gen_random_uuid(), $2) returning id`,
    [`wave15-console-tc-${tag}`, email],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: co } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة الاختبار') returning id`, [orgId]);
  companyId = co[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف الألوان" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (!db) return;
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

/** Waits out React's streamed Suspense boundaries. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave15-console-${name}.png`) });
}

test("K2: a company starts with «بلا لون», the menu offers the seven named colours and no free hex, and a choice is audited", async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await goto(page, "/ar/app/admin/companies");

  const main = page.locator("#main");
  const row = main.getByRole("button", { name: /بلا لون/ }).first();
  await expect(row).toBeVisible();
  await row.click();

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // The seven named colours, and only those — never a free hex field or a
  // native colour input.
  for (const name of ["فضي", "يوسفي", "فوشي", "سماوي", "ذهبي", "بنفسجي", "نعناعي", "بلا لون"]) {
    await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  }
  await expect(page.locator('input[type="color"]')).toHaveCount(0);

  await capture(page, "team-colour");

  await menu.getByRole("menuitem", { name: "سماوي" }).click();
  await expect(page.getByRole("button", { name: /سماوي/ }).first()).toBeVisible();

  await expect
    .poll(async () => {
      const audit = await db.query(
        `select before, after from public.audit_log where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [orgId, companyId],
      );
      return audit.rows;
    })
    .toEqual([{ before: { teamColor: null }, after: { teamColor: "#35d0ff" } }]);
});
