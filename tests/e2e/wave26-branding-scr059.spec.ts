// SCR-059 · /app/admin/branding rebuilt from `AdminBranding.dc.html` (wave 26, PR B) — REQ-UIX-116, REQ-ADM-015,
// REQ-DSG-021, DEC-208, DEC-251 §3, against REAL local Supabase, on the desktop project at the artboard's 1280.
//
// The states, each captured at `${E2E_SHOTS_DIR}/wave26-branding-scr059-<state>-1280.png`:
//   read-default   — no kit row: the platform default, every colour a swatch with its value written
//   edit           — «عدّل»: edit mode names its state
//   edit-changed   — two changes: the unsaved count, Save naming it
//   edit-refused   — ★★ a canvas the DATABASE refuses (`0144`): the failing pair inline, the value kept, nothing written
//   read-saved     — a palette the database accepts: back to read mode with the saved mark from the row
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
const DESKTOP = { width: 1280, height: 800 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w26-branding-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('شبه الجزيرة', $1, 'WBK', gen_random_uuid(), $2) returning id`,
    [`w26-branding-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الهوية" } });
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

async function settle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, state: string) {
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/wave26-branding-scr059-${state}-1280.png`, fullPage: true });
}

test("★ SCR-059 read first, edit, the database's refusal on the screen, and a save's mark", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "SCR-059's artboard is drawn at 1280");
  await page.setViewportSize(DESKTOP);
  await signIn(context, adminEmail);
  const main = page.locator("#main");

  // Read mode, the platform default — read from `brand_kit()`, never typed here.
  await page.goto("/ar/app/admin/branding");
  await expect(main.getByRole("heading", { name: "هوية المؤسسة", level: 1 })).toBeVisible();
  const { rows: kit } = await db.query<{ brand_kit: { light: Record<string, string>; dark: Record<string, string> } }>(`select public.brand_kit($1) as brand_kit`, [orgId]);
  await expect(main.getByText(kit[0].brand_kit.dark.node.toUpperCase()).first()).toBeVisible();
  await expect(main.getByText("تغذّي الملصقات والشهادات والبريد — لا التطبيق")).toBeVisible();
  await expect(main.getByText("لا يوجد شعار مخصّص")).toBeVisible();
  // ★ DEC-201: the kit never reaches the app — no form control in read mode, nothing styled from it.
  await expect(main.getByRole("textbox")).toHaveCount(0);
  await capture(page, "read-default");

  // Edit mode names its state.
  await main.getByRole("link", { name: "عدّل" }).click();
  await expect(main.getByRole("heading", { name: "تعديل الهوية" })).toBeVisible();
  await capture(page, "edit");

  // Two changes: counted, and Save names the count.
  await main.getByLabel("لون العناوين").fill("#12131b");
  await main.getByLabel(/^الخلفية/).fill("#8a5a1f");
  await expect(main.getByText("تغييران غير محفوظين")).toBeVisible();
  await expect(main.getByRole("button", { name: "حفظ (2)" })).toBeVisible();
  await capture(page, "edit-changed");

  // ★★ The database refuses: the pair is named inline, the value is kept, nothing is written.
  await main.getByRole("button", { name: "حفظ (2)" }).click();
  await expect(main.getByRole("alert").filter({ hasText: "شارة «جارية الآن» لا تُقرأ على خلفية الوضع الفاتح" })).toBeVisible();
  await expect(main.getByLabel(/^الخلفية/)).toHaveValue("#8a5a1f");
  expect((await db.query(`select 1 from public.brand_kits where org_id = $1`, [orgId])).rows).toEqual([]);
  await capture(page, "edit-refused");

  // A palette the database accepts: read mode again, the value written beside its swatch, the saved mark from the row.
  await main.getByLabel(/^الخلفية/).fill("#f4f6f9");
  await main.getByRole("button", { name: /^حفظ/ }).click();
  await expect(main.getByRole("link", { name: "عدّل" })).toBeVisible();
  await expect(main.getByText("#F4F6F9").first()).toBeVisible();
  await expect(main.getByText(/حُفظ ·/)).toBeVisible();
  const { rows } = await db.query<{ light_canvas: string }>(`select light_canvas from public.brand_kits where org_id = $1`, [orgId]);
  expect(rows[0]?.light_canvas).toBe("#f4f6f9");
  await capture(page, "read-saved");
});
