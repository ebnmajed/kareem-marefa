// SCR-019 · /app/members — the directory, new in wave 19 (REQ-UIX-068, REQ-PRF-005, REQ-TEN-003, DEC-213
// §5.106 – §5.113, DEC-214). What a browser shows a member and an admin, against a real database:
//
//   · the regions in the artboard's order; «الأنشط أولًا» is the sessions DELIVERED, then the name;
//   · search by name or job title and the company chips are URLs; a member of another org, a deactivated member and
//     an anonymised one never appear for a member; an admin can show the deactivated, marked and not linked;
//   · ★ the list pages through the query string — a cold `?page=2` renders the first two pages and the «more» link
//     carries the next. Without JavaScript the case is `fixme` under F3 (DEC-198 §5): `/app` streams behind
//     `loading.tsx`, so no `/app` route renders its content without JavaScript.
//
// Captures (`E2E_SHOTS_DIR` or `.qa-shots/rtl`): `wave19-scoring-directory-{list,search,admin}-{390,1280}.png`.
import { mkdirSync } from "node:fs";
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
const DESKTOP = { width: 1280, height: 900 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let otherOrgId = "";
let domain = "";
let c1 = "";
let categoryId = "";
let venueId = "";
const emails = { viewer: "", admin: "" };
const users: string[] = [];

async function member(org: string, name: string | null, opts: { company?: string | null; title?: string | null; status?: "deactivated"; email?: string } = {}) {
  const email = opts.email ?? `${crypto.randomUUID()}@${domain}`;
  const { rows: u } = await db.query<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, '{}'::jsonb) returning id`, [email]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, company_id, job_title, status, deactivated_at, deactivated_reason)
     values ($1, $2, $3, $4, $5, $6, $7::public.member_status, $8, $9) returning id`,
    [org, u[0].id, email, name, opts.company ?? null, opts.title ?? null, opts.status ?? "active", opts.status ? new Date().toISOString() : null, opts.status ? "اختبار" : null],
  );
  return rows[0].id;
}

async function delivered(presenter: string, title: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() - interval '5 days', 60, now() - interval '5 days' + interval '1 hour', $4, 30, 'completed', now() - interval '6 days', now() - interval '5 days')
     returning id`,
    [orgId, title, categoryId, venueId],
  );
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, rows[0].id, presenter]);
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  domain = `w19-directory-${tag}.example`;

  const org = await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الدليل', $1, 'WD', gen_random_uuid()) returning id`, [`w19-dir-${tag}`]);
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  c1 = (await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId])).rows[0].id;
  categoryId = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId])).rows[0].id;
  venueId = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId])).rows[0].id;
  const c2 = (await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'صنف', '#ff9a2e') returning id`, [orgId])).rows[0].id;

  const other = await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة أخرى', $1, 'WO', gen_random_uuid()) returning id`, [`w19-dir-other-${tag}`]);
  otherOrgId = other.rows[0].id;
  await member(otherOrgId, "غريب من مؤسسة أخرى");

  const sara = await member(orgId, "سارة القحطاني", { company: c1, title: "مديرة المواهب" });
  const fahd = await member(orgId, "فهد العنزي", { company: c2, title: "مهندس بيانات" });
  await member(orgId, "نورة العتيبي");
  await member(orgId, "عضو معطَّل", { company: c1, status: "deactivated" });
  await delivered(sara, "الجلسة الأولى");
  await delivered(sara, "الجلسة الثانية");
  await delivered(fahd, "جلسة فهد");
  // Sara holds a level (the nightly evaluation, by hand — level 4 «كريم معرفة» at 700); the others hold none.
  await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 900, 'manual_adjustment', 'اختبار', $3)`, [orgId, sara, `e2e:w19-dir:${sara}`]);
  await db.query(`update public.points_balances set current_level_id = (select id from public.levels where org_id = $1 and sort_order = 4) where member_id = $2`, [orgId, sara]);
  // Enough members to page: 24 a page, so 26 «آخرون» and the four above make two pages (with the viewer, 30).
  for (let i = 1; i <= 26; i += 1) await member(orgId, `عضو تجريبي ${String(i).padStart(2, "0")}`);

  for (const key of ["viewer", "admin"] as const) {
    const email = `${key}@${domain}`;
    emails[key] = email;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: key === "admin" ? "مشرف الدليل" : "زائر الدليل" } });
    if (error) throw error;
    users.push(data.user.id);
  }
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  for (const id of [orgId, otherOrgId]) if (id) await db.query(`delete from public.orgs where id = $1`, [id]);
  if (domain) await db.query(`delete from auth.users where email like $1`, [`%@${domain}`]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string, role?: "admin") {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  if (role) await db.query(`update public.members set org_role = 'admin' where id = $1`, [(data as { member_id: string }).member_id]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const desktop = () => test.info().project.name === "desktop";

async function open(page: Page, query = "") {
  await page.setViewportSize(desktop() ? DESKTOP : PHONE);
  await page.goto(`/ar/app/members${query}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, state: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${state} scrolls sideways`).toBe(true);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave19-scoring-directory-${state}-${desktop() ? 1280 : 390}.png`), fullPage: true });
}

test("a member: the regions in order, the most active first, a noun phrase, no one from elsewhere", async ({ context, page }) => {
  await signIn(context, emails.viewer);
  await open(page);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1 })).toContainText("الأعضاء");
  await expect(main.getByRole("searchbox", { name: "ابحث في الأعضاء" })).toBeVisible();
  await expect(main.getByRole("navigation", { name: "الشركات" })).toBeVisible();
  const rows = main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem");
  await expect(rows.first()).toContainText("سارة القحطاني");
  await expect(rows.first()).toContainText("جلستان مقدَّمتان");
  // ★ The level badge on a row (DEC-213 §5.111), in its ramp stop; a member with no level has none.
  await expect(rows.first().locator("[data-level]")).toHaveText("كريم معرفة");
  await expect(rows.first().locator("[data-level]")).toHaveAttribute("data-level", "4");
  await expect(rows.nth(1).locator("[data-level]")).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("فهد العنزي");
  await expect(main.getByText("غريب من مؤسسة أخرى")).toHaveCount(0);
  await expect(main.getByText("عضو معطَّل")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "أظهر المعطَّلين" })).toHaveCount(0);
  await expect(main.getByText("24 من 30")).toBeVisible();
  await capture(page, "list");
});

test("search by job title and a company chip are URLs", async ({ context, page }) => {
  await signIn(context, emails.viewer);
  await open(page);
  const main = page.locator("#main");
  await main.getByRole("searchbox", { name: "ابحث في الأعضاء" }).fill("مهندس");
  await main.getByRole("searchbox", { name: "ابحث في الأعضاء" }).press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem")).toHaveCount(1);
  await expect(main.getByRole("region", { name: "قائمة الأعضاء" })).toContainText("فهد العنزي");
  await capture(page, "search");

  await open(page);
  await main.getByRole("navigation", { name: "الشركات" }).getByRole("link", { name: "مواهب" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${c1}`));
  await expect(main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem")).toHaveCount(1);

  await open(page, "?q=لا-أحد-بهذا-الاسم");
  await expect(main.getByText("لا أحد بهذا الاسم")).toBeVisible();
});

test("★ the URL is the state: a cold ?page=2 renders the first two pages, and «more» carries the next", async ({ context, page }) => {
  await signIn(context, emails.viewer);
  await open(page);
  const main = page.locator("#main");
  await expect(main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem")).toHaveCount(24);
  await expect(main.getByRole("link", { name: "المزيد" })).toHaveAttribute("href", /page=2/);
  // A fresh page load of the second page — no client state carried over.
  await page.goto("/ar/app/members?page=2");
  await expect(main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem")).toHaveCount(30);
  await expect(main.getByRole("link", { name: "المزيد" })).toHaveCount(0);
});

test("without JavaScript, a cold ?page=2 renders the first two pages", async ({ browser }) => {
  // ★ F3 (DEC-198 §5): every `/app` route streams behind its `loading.tsx`, and without JavaScript the skeleton
  // never swaps out — measured here at gate run 1 (an empty `#main`). The directory's paging is a link and a URL, so
  // it needs nothing more once F3 is fixed; the case stands ready for that day.
  test.fixme(true, "F3: /app streams behind loading.tsx; without JS the content never swaps in (DEC-198 §5)");
  const context = await browser.newContext({ javaScriptEnabled: false });
  await signIn(context, emails.viewer);
  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/members?page=2");
  await expect(page.locator("#main").getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem")).toHaveCount(30);
  await context.close();
});

test("an admin can show the deactivated, marked in words and not linked", async ({ context, page }) => {
  await signIn(context, emails.admin, "admin");
  await open(page);
  const main = page.locator("#main");
  await expect(main.getByText("عضو معطَّل")).toHaveCount(0);
  await main.getByRole("link", { name: "أظهر المعطَّلين" }).click();
  await expect(page).toHaveURL(/inactive=1/);
  await main.getByRole("searchbox", { name: "ابحث في الأعضاء" }).fill("معطَّل");
  await main.getByRole("searchbox", { name: "ابحث في الأعضاء" }).press("Enter");
  const row = main.getByRole("region", { name: "قائمة الأعضاء" }).getByRole("listitem").filter({ hasText: "عضو معطَّل" });
  await expect(row).toContainText("معطَّل");
  await expect(row.getByRole("link")).toHaveCount(0);
  await capture(page, "admin");
});

test("★ a row opens the profile, and the two screens say the same «presented» and the same level (DEC-214 §2)", async ({ context, page }) => {
  await signIn(context, emails.viewer);
  await open(page);
  const row = page.locator("#main").getByRole("link", { name: /سارة القحطاني/ });
  await expect(row).toContainText("جلستان مقدَّمتان");
  await row.click();
  await expect(page).toHaveURL(/\/ar\/app\/members\/[0-9a-f-]{36}$/);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("سارة القحطاني");
  // The heading's figure: the same delivered count the row said.
  await expect(main.locator("section", { has: page.locator("#presented") }).locator("h2 + span")).toHaveText("2");
  if (desktop()) await expect(main.locator('[data-slot="profile-header"]')).toContainText("جلستان مقدَّمتان");
  await expect(main.locator("section", { has: page.locator("#standing") })).toContainText("كريم معرفة");
});
