// SCR-059 · /app/admin/branding, wave 11 (DEC-166 §2, B1) — the status-colour
// contrast guard, against REAL local Supabase: `save_brand_kit()` now refuses
// a palette on which `--color-live`/`--color-ended`/`--color-live-on-dark`
// would read below SC 1.4.3's 4.5:1 against the org's own canvas/surface
// (`supabase/migrations/0144_status_contrast_guard.sql`), and the screen
// surfaces the refusal through `errors.statusContrast`.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave11-branding-status-contrast-refused.png
//   wave11-branding-status-contrast-accepted.png
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
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== "phone") return;

  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w11-branding-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة تباين الحالة', $1, 'WC', gen_random_uuid(), $2) returning id`,
    [`w11-branding-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "مشرفة تباين الحالة" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  if (!db) return;
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

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ DEC-166: a canvas colour that would fail a status badge's AA is refused, the toast names why, the field keeps what was typed", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  const main = page.locator("#main");

  // #8a5a1f is globals.css's own --color-live (:51) — a canvas equal to it
  // is exactly 1:1 against `--color-live` as text, nowhere near 4.5:1.
  const canvas = main.getByLabel("الخلفية", { exact: true });
  await canvas.fill("#8a5a1f");
  await main.getByRole("button", { name: "حفظ" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "تباين شارات الحالة" }),
  ).toBeVisible();

  // Controlled input: nothing typed was lost to a native form reset.
  await expect(canvas).toHaveValue("#8a5a1f");

  // Nothing was written — the guard runs before the insert.
  const { rows } = await db.query(`select 1 from public.brand_kits where org_id = $1`, [orgId]);
  expect(rows).toEqual([]);

  await page.screenshot({ path: `${SHOTS}/wave11-branding-status-contrast-refused.png`, fullPage: true });
});

test("★ DEC-166: a canvas colour far from every status colour saves normally", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  const main = page.locator("#main");

  const canvas = main.getByLabel("الخلفية", { exact: true });
  await canvas.fill("#f4f6f9");
  await main.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم حفظ هوية المؤسسة." })).toBeVisible();

  const { rows } = await db.query<{ light_canvas: string }>(`select light_canvas from public.brand_kits where org_id = $1`, [orgId]);
  expect(rows[0]?.light_canvas).toBe("#f4f6f9");

  await page.screenshot({ path: `${SHOTS}/wave11-branding-status-contrast-accepted.png`, fullPage: true });
});
