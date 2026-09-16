// SCR-059 · /app/admin/branding on the M9 system (wave 8, B3) — REQ-DSG-021,
// REQ-ADM-015, REQ-DSG-019, DEC-127, against REAL local Supabase. Four
// states of the rebuilt screen: the platform default, an override saved
// (with the poster-gradient preview showing it and `brand_kit()` read back
// carrying `canvasRaise`), a malformed hex at its own field, and the reset
// confirmation open.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-branding-defaults.png
//   wave8-branding-override-saved.png
//   wave8-branding-field-error.png
//   wave8-branding-reset-confirm.png
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

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w8-branding-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الهوية الثانية', $1, 'B8', gen_random_uuid(), $2) returning id`,
    [`w8-branding-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "مشرفة الهوية الثانية" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
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

test("SCR-059: the platform defaults, before any org has ever saved a kit", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  await expect(page.getByRole("heading", { name: "هوية المؤسسة", level: 1 })).toBeVisible();

  // ★ DEC-145: locators under `/app` scope to `#main`, past the shell's own
  // forms and any orphaned streamed copy.
  const main = page.locator("#main");
  await expect(main.getByLabel("الخلفية", { exact: true })).toHaveValue("#ffffff");
  await expect(main.getByText("لا يوجد شعار مخصّص")).toBeVisible();

  const { rows } = await db.query(`select 1 from public.brand_kits where org_id = $1`, [orgId]);
  expect(rows).toEqual([]);

  await main.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-branding-defaults.png`, fullPage: true });
});

test("★ DEC-127: an override saves, the poster-gradient preview shows it, and brand_kit() reads canvasRaise back", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one project writes this org's kit");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  const main = page.locator("#main");

  // `canvasRaise` — the gradient's second stop (DEC-127) — is the token the
  // checklist names explicitly; changed on its own so the preview's
  // gradient swatch visibly shifts without touching anything else.
  await main.getByLabel("خلفية التدرّج", { exact: true }).fill("#3388ff");
  await main.getByRole("button", { name: "حفظ" }).click();
  // The outcome is a toast — its viewport is a shell-level sibling of
  // `#main`, so this one assertion is deliberately unscoped.
  await expect(page.getByText("تم حفظ هوية المؤسسة.")).toBeVisible();

  const { rows } = await db.query<{ brand_kit: { light: { canvasRaise: string } } }>(`select public.brand_kit($1) as brand_kit`, [orgId]);
  expect(rows[0].brand_kit.light.canvasRaise).toBe("#3388ff");

  await main.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-branding-override-saved.png`, fullPage: true });
});

test("REQ-UIX-010: a malformed hex shows an adjacent, icon-marked error at its own field", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  const main = page.locator("#main");

  const heading = main.getByLabel("لون العناوين", { exact: true });
  await heading.fill("#zzzzzz");
  await expect(main.getByText("أدخل قيمة لون صالحة بصيغة #rrggbb.")).toBeVisible();
  // Nothing was submitted — REQ-UIX-011: the value typed survives, the
  // error names the same field it sits under.
  await expect(heading).toHaveValue("#zzzzzz");

  await main.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-branding-field-error.png`, fullPage: true });
});

test("REQ-UIX-013: the reset dialog names the org's kit and states the consequence before the click", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/branding");
  const main = page.locator("#main");

  await main.getByRole("button", { name: "إعادة الضبط إلى هوية المنصة" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("سيُحذف تخصيص هذه المؤسسة")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "إعادة الضبط إلى هوية المنصة" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "إلغاء" })).toBeVisible();

  await page.screenshot({ path: `${SHOTS}/wave8-branding-reset-confirm.png`, fullPage: true });
});
