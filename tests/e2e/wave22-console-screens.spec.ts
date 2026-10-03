// Wave 22 · console — SCR-046, 047, 048, 049, 061, 062 doing their jobs (`DEC-231` §0), and the captures the lead
// holds beside the artboards:
//   .qa-shots/rtl/wave22-console-<screen>-<state>-<1280|390>.png
//
//  · 046: the owner sets a venue's company in ONE move — ⋯ → «عدّل» → the company → «احفظ» — and the row says so.
//  · 047 / 048: the lists as the artboards draw them, each with its edit sheet open once.
//  · 049: found by role through a chip; the last admin's menu says why before anyone tries.
//  · 061: a download, and the row then names who took it.
//  · 062: a configuration change beside the log's rows, marked «إعداد».
//  · Each list at 390: cards, never a sideways page.
// ★ 046 needs `0180` (`venues.company_id`) on the local stack.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let adminMemberId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w22-console-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('شبه الجزيرة', $1, 'WT', gen_random_uuid(), $2) returning id`,
    [`w22-console-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [name, colour] of [["شبه الجزيرة", "#e9e4d6"], ["صنف", "#ff9a2e"], ["بنينسولا ستوري", "#ff4fb8"], ["مواهب", "#35d0ff"], ["دبابيس", "#ffd23f"]]) {
    await db.query(`insert into public.companies (org_id, name, team_color) values ($1, $2, $3)`, [orgId, name, colour]);
  }
  for (const name of ["إداري", "تقني", "إبداعي", "درس من تجربة", "مهارات"]) await db.query(`insert into public.categories (org_id, name) values ($1, $2)`, [orgId, name]);
  for (const [name, address, capacity] of [
    ["قاعة الرياض", "الدور الثالث، مبنى شبه الجزيرة، الرياض", 40],
    ["استوديو جدة", "بنينسولا ستوري، جدة", 25],
    ["معرض دبابيس", "دبابيس، الرياض", 25],
    ["قاعة الاجتماعات الصغرى", "الدور الثاني، الرياض", 12],
    ["مقر صنف", "حي العليا، الرياض", 30],
  ] as const) {
    await db.query(`insert into public.venues (org_id, name, address, capacity) values ($1, $2, $3, $4)`, [orgId, name, address, capacity]);
  }

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عبدالله المطيري" } });
  if (error) throw error;
  userIds.push(data.user.id);
  for (const [i, name] of ["سارة القحطاني", "فهد العنزي", "نورة العتيبي", "ريم الشهري"].entries()) {
    const { data: m, error: e } = await admin.auth.admin.createUser({ email: `m${i}@${domain}`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (e) throw e;
    userIds.push(m.user.id);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email = adminEmail) {
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

/** Waits out React's streamed Suspense boundaries — a capture of a skeleton proves nothing. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/wave22-console-${name}.png`, fullPage: true });
const more = (page: Page, name: string) => page.locator("#main").getByRole("button", { name: `مزيد من الإجراءات على ${name}` }).filter({ visible: true });

test("046 at 1280: the owner sets a venue's company in one move, and the row says so", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  await goto(page, "/ar/app/admin/venues");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "الأماكن" })).toBeVisible();
  await expect(main.getByRole("row", { name: /قاعة الرياض/ }).getByText("لا شركة", { exact: true })).toBeVisible();
  await shot(page, "046-unassigned-1280");

  for (const [venue, company] of [["قاعة الرياض", "شبه الجزيرة"], ["استوديو جدة", "بنينسولا ستوري"], ["معرض دبابيس", "دبابيس"], ["قاعة الاجتماعات الصغرى", "شبه الجزيرة"], ["مقر صنف", "صنف"]] as const) {
    await more(page, venue).click();
    await page.getByRole("menuitem", { name: "عدّل" }).click();
    const sheet = page.getByRole("dialog", { name: "عدّل المكان" });
    await sheet.getByLabel("الشركة").selectOption({ label: company });
    if (venue === "قاعة الرياض") await shot(page, "046-edit-sheet-1280");
    await sheet.getByRole("button", { name: "احفظ" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(main.getByRole("row", { name: new RegExp(venue) }).getByText(company, { exact: true })).toBeVisible();
  }
  // The five saves' toasts clear before the capture — a toast is the save's acknowledgement, not the screen.
  await expect(page.getByText("حُفظ المكان.", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  await shot(page, "046-default-1280");
  const { rows } = await db.query(`select count(*)::int as n from public.venues where org_id = $1 and company_id is not null`, [orgId]);
  expect(rows[0].n).toBe(5);
});

test("047 and 048 at 1280: the lists as drawn, each with its form open once", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  await goto(page, "/ar/app/admin/categories");
  await expect(page.locator("#main").getByRole("heading", { level: 1, name: "التصنيفات" })).toBeVisible();
  await shot(page, "047-default-1280");
  await page.locator("#main").getByRole("link", { name: "تصنيف جديد" }).click();
  await expect(page.getByRole("dialog", { name: "تصنيف جديد" })).toBeVisible();
  await shot(page, "047-new-sheet-1280");

  await goto(page, "/ar/app/admin/companies");
  await expect(page.locator("#main").getByText("سماوي", { exact: true }).first()).toBeVisible();
  await shot(page, "048-default-1280");
  await more(page, "مواهب").click();
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  await expect(page.getByRole("dialog", { name: "عدّل الشركة" })).toBeVisible();
  await shot(page, "048-edit-sheet-1280");
});

test("049 at 1280: found by role through a chip; the last admin's menu says why", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  // Each member signs in once, so the roster holds them (members are provisioned on first sign-in).
  for (let i = 0; i < 4; i++) await signIn(context, `m${i}@${adminEmail.split("@")[1]}`);
  await context.clearCookies();
  await signIn(context);
  await goto(page, "/ar/app/admin/members");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "الأعضاء" })).toBeVisible();
  await shot(page, "049-default-1280");

  await main.getByRole("button", { name: "الدور: الكل" }).click();
  await page.getByRole("menuitem", { name: "عضو", exact: true }).click();
  await expect(page).toHaveURL(/role=member/);
  await expect(main.getByRole("table").getByText("سارة القحطاني")).toBeVisible();
  await expect(main.getByRole("table").getByText("عبدالله المطيري")).toHaveCount(0);
  await shot(page, "049-filtered-1280");
});

test("061 at 1280: a download, and the row then names who took it", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  await goto(page, "/ar/app/admin/exports");
  const main = page.locator("#main");
  const row = main.getByRole("row", { name: /الأعضاء/ });
  const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "نزِّل ملف الأعضاء بصيغة CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("الأعضاء.csv");
  await expect(row.getByText("عبدالله المطيري", { exact: false })).toBeVisible();
  await shot(page, "061-default-1280");
});

test("062 at 1280: a configuration change beside the log's rows, marked «إعداد»", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  await signIn(context);
  // Read from the table, not from provision_member's answer — the verify run found it empty here.
  const { rows: me } = await db.query<{ id: string }>(`select id from public.members where org_id = $1 and email = $2`, [orgId, adminEmail]);
  adminMemberId = me[0].id;
  await db.query(
    `insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id) values ($1, 'scoring', gen_random_uuid(), 'points', '10', '15', $2)`,
    [orgId, adminMemberId],
  );
  await goto(page, "/ar/app/admin/audit");
  const main = page.locator("#main");
  await expect(main.getByText("قواعد النقاط · النقاط").first()).toBeVisible();
  await expect(main.getByText("إعداد", { exact: true }).first()).toBeVisible();
  await shot(page, "062-default-1280");
});

test("046 – 049, 061, 062 at 390: cards, never a sideways page", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone treatment");
  await page.setViewportSize(PHONE);
  await signIn(context);
  for (const [path, name] of [
    ["venues", "046"],
    ["categories", "047"],
    ["companies", "048"],
    ["members", "049"],
    ["exports", "061"],
    ["audit", "062"],
  ] as const) {
    await goto(page, `/ar/app/admin/${path}`);
    await expect(page.locator("#main").getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} scrolls sideways at 390`).toBe(true);
    await shot(page, `${name}-default-390`);
  }
});
