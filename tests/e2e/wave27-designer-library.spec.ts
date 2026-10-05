// Wave 27 — an org owns its templates (REQ-DSG-035, STORY-DSG-017, STORY-DSG-018; DEC-254 §3, DEC-255).
//
// A brand-new org — inserted the way a fixture or the owner's hand inserts one, so the trigger on `orgs` is what seeds
// it — opens SCR-055 and finds its OWN library, in ONE list: five poster families, six certificate compositions, the
// three certificate defaults named, no «قوالب المنصة», no «انسخ لتعدّل». A seeded template opens in the studio in place.
// Retiring the last live template of a kind the code falls back on is refused, and the toast says why in one line (D6).
//
// ★ Needs M1 (0007 – 0009) in the local chain — the lead promotes it in PR C.
// Captures at `.qa-shots/rtl/wave27-designer-055-<state>-<1280|390>.png`, honouring `E2E_SHOTS_DIR`. Writes run once,
// on the desktop project.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";

let service: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const userIds: string[] = [];

const main = (page: Page) => page.locator("#main");
const width = (info: TestInfo) => (info.project.name === "phone" ? "390" : "1280");
const shot = (page: Page, info: TestInfo, state: string) =>
  page.screenshot({ path: `${SHOTS}/wave27-designer-055-${state}-${width(info)}.png`, fullPage: true });
const desktopOnly = (info: TestInfo) => test.skip(info.project.name === "phone", "the writes run once, on the desktop project");
const card = (page: Page, name: string) => main(page).locator("article", { has: page.getByRole("heading", { name, exact: true, level: 3 }) });

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Settled: every card preview on screen has rendered (a skeleton proves nothing). */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  const previews = main(page).locator("[data-template-preview]");
  const n = await previews.count();
  for (let i = 0; i < n; i++) {
    await previews.nth(i).scrollIntoViewIfNeeded();
    await expect(previews.nth(i)).toHaveAttribute("data-rendered", "true", { timeout: 15_000 });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.beforeAll(async ({}, testInfo) => {
  service = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `library27-${tag}.example`;
  adminEmail = `admin@${domain}`;

  // ★ No template is inserted here: the trigger on `orgs` seeds the library the moment this row exists.
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المكتبة', $1, 'LB', gen_random_uuid(), $2) returning id`,
    [`library27-${tag}`, adminEmail],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { data, error } = await service.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مديرة المكتبة" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: e1 } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (e1) throw e1;
  const { error: e2 } = await client.rpc("provision_member");
  if (e2) throw e2;
  await db.query(
    `update public.members set display_name = 'مديرة المكتبة', org_role = 'admin', claims_version = claims_version + 1 where org_id = $1 and email = $2`,
    [orgId, adminEmail],
  );
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("055 · a new org's posters: its own five, in one list — no platform section, no «انسخ لتعدّل»", async ({ page, context }, info) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("القوالب");
  await expect(main(page).getByRole("heading", { level: 2, name: /قوالب مؤسستك/ })).toContainText("5");
  await expect(main(page).getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(main(page).getByText("قوالب المنصة")).toHaveCount(0);
  for (const name of ["جلسة", "ورشة", "حوار", "لقاء", "إعلان"]) {
    await expect(card(page, name)).toBeVisible();
    await expect(card(page, name)).toContainText("افتراضي");
  }
  await card(page, "جلسة").getByRole("button", { name: "إجراءات أخرى" }).click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  expect(items).toContain("افتح في المصمّم");
  expect(items).not.toContain("انسخ لتعدّل");
  await page.keyboard.press("Escape");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "the grid scrolls the page sideways").toBe(false);
  await settled(page);
  await shot(page, info, "posters");
});

test("055 · a new org's certificates: six compositions and its own three defaults named", async ({ page, context }, info) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(main(page).getByRole("heading", { level: 2, name: /قوالب مؤسستك/ })).toContainText("6");
  const defaults = main(page).getByLabel("القوالب الافتراضية");
  for (const name of ["شهادة حضور أفقية", "شهادة تقديم أفقية", "شهادة إنجاز أفقية"]) await expect(defaults).toContainText(name);
  await expect(defaults).not.toContainText("المنصة");
  await settled(page);
  await shot(page, info, "certificates");
});

test("055 · a seeded template opens in the studio, in place — the org edits its baseline, it does not copy it", async ({ page, context }, info) => {
  desktopOnly(info);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/templates/posters");
  await card(page, "جلسة").getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "افتح في المصمّم" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/designer\/[0-9a-f-]{36}/);
  // The working document is the seeded template's own draft — no new template was created to get here.
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.design_templates where org_id = $1`, [orgId]);
  expect(rows[0].n).toBe(11);
});

test("055 · ★ D6 — retiring the last attendance template is refused, in one line", async ({ page, context }, info) => {
  desktopOnly(info);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/templates/certificates");
  const retire = async (name: string) => {
    await card(page, name).getByRole("button", { name: "إجراءات أخرى" }).click();
    await page.getByRole("menuitem", { name: "أحِله للتقاعد" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "أحِله للتقاعد" }).click();
  };
  // The portrait goes: another attendance template is still live.
  await retire("شهادة حضور عمودية");
  await expect(page.getByText("أُحيل القالب للتقاعد.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The landscape is the last: refused, and nothing changes.
  await retire("شهادة حضور أفقية");
  await expect(page.getByText("لا يمكن إحالته للتقاعد: هو آخر قالب منشور لهذا النوع.", { exact: true })).toBeVisible();
  const { rows } = await db.query<{ live: number }>(
    `select count(*)::int as live from public.design_templates where org_id = $1 and family = 'attendance' and retired_at is null`,
    [orgId],
  );
  expect(rows[0].live).toBe(1);
  await page.screenshot({ path: `${SHOTS}/wave27-designer-055-retire-refused-${width(info)}.png` });
});
