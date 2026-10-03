// SCR-058 at 1280 and 390 — wave 23, REQ-UIX-112, `AdminEmailGallery.dc.html`, `AdminEmails.dc.html`,
// `AdminEmailAdd.dc.html`. The gallery: a card per message of `08` §1 (25), its chips, «سجل الإرسال» and «رسالة جديدة»,
// and the failures panel the board does not draw; captured at 1280 and at 390. The builder: the bar, the rail in the
// artboard's order, a block selected (الكتلة), the library armed («إضافة» with its slots), and «معاينة واختبار» with the
// org's real session — captured at 1280, the artboards' width.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `mailgal23-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة البريد', $1, 'MB', gen_random_uuid(), $2) returning id`,
    [`mailgal23-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة البريد" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test("the gallery: twenty-five cards, the chips, the two actions — at 1280 and at 390", async ({ context, page }) => {
  await signIn(context, adminEmail);
  const phone = test.info().project.name === "phone";
  if (!phone) await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/ar/app/admin/emails");
  await expect(main(page).getByRole("heading", { level: 1, name: "البريد" })).toBeVisible();
  const cards = main(page).getByRole("list", { name: "رسائل البريد" }).getByRole("listitem");
  await expect(cards).toHaveCount(25);
  await expect(cards.first()).toContainText("التصميم الافتراضي");
  await expect(main(page).getByRole("group", { name: "أنواع الرسائل" }).getByRole("link").first()).toContainText("الكل");
  await expect(main(page).getByRole("link", { name: "سجل الإرسال", exact: true })).toHaveAttribute("href", /\?view=log$/);
  // Nothing sideways at 390: the page is no wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/wave23-notify-058-gallery-${phone ? 390 : 1280}.png`, fullPage: true });

  await main(page).getByRole("button", { name: "رسالة جديدة", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "اختر رسالة" })).toBeVisible();
});

test("the builder at 1280: the bar, the rail in order, a block selected, the library armed, the preview", async ({ context, page }) => {
  test.skip(test.info().project.name === "phone", "the builder's artboards are 1280");
  await signIn(context, adminEmail);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/ar/app/admin/emails/MSG-reminder_1d");
  await expect(main(page).getByRole("heading", { level: 1, name: "تذكير قبل الجلسة بيوم" })).toBeVisible();
  await expect(main(page).getByRole("tab")).toHaveText(["إضافة", "الأنماط", "التخطيطات", /^الفحوصات/, "الكتل", "التخطيطات"]);
  await expect(main(page).locator("[data-canvas-target]").first()).toBeVisible();

  // A block selected — the button, as `AdminEmails.dc.html` draws it: الكتلة open, its handle bar shown.
  await main(page).locator("[data-canvas-target] > button").and(page.getByRole("button", { name: /^زر/ })).first().click();
  await expect(main(page).getByRole("tab", { name: "الكتلة", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(main(page).locator("[data-handle-bar][data-selected]")).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/wave23-notify-058-editor-block-1280.png` });

  // The library armed — «رمز QR» pressed and the dashed slots across the email, as `AdminEmailAdd.dc.html` draws.
  await main(page).getByRole("tab", { name: "إضافة", exact: true }).click();
  await main(page).getByRole("button", { name: "رمز QR", exact: true }).click();
  await expect(main(page).locator("[data-canvas-slot]").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave23-notify-058-editor-add-1280.png` });
  await main(page).getByRole("button", { name: "إلغاء", exact: true }).click();

  // «معاينة واختبار»: the one renderer, sample data named when the org has no rendered session; the test to my address.
  await main(page).getByRole("button", { name: "معاينة واختبار", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "معاينة واختبار" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("ببيانات نموذجية")).toBeVisible();
  await expect(sheet.getByRole("button", { name: new RegExp(`أرسل اختبارًا إلى ${adminEmail.replace(/[.]/g, "\\.")}`) })).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/wave23-notify-058-preview-1280.png` });
});
