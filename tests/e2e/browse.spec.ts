// SCR-011 · /app/sessions — browse and search, against REAL local Supabase
// (REQ-DSC-003, REQ-DSC-005, REQ-DSC-007, REQ-SES-011). `console`'s first
// story this wave (DEC-048). Proves the real page wiring `searchSessions()`
// (content's DAL, unchanged) to the URL's own filter params, `<SearchFilters>`
// (content's) embedded in the responsive filter placement, and
// `<BookmarkButton>` (content's) toggled from a real card.
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
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let memberEmail = "";
let categoryAiId = "";
let sessionAiId = "";
let sessionTimeId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `browse-e2e-${tag}.example`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة التصفّح', $1, 'BR', gen_random_uuid()) returning id`,
    [`browse-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { rows: catRows } = await db.query<{ id: string }>(
    `insert into public.categories (org_id, name) values ($1, 'ذكاء اصطناعي'), ($1, 'إدارة الوقت') returning id`,
    [orgId],
  );
  categoryAiId = catRows[0].id;
  const categoryTimeId = catRows[1].id;
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة التصفّح', 40) returning id`, [orgId]);
  const venueId = venueRows[0].id;

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values
       ($1, 'جلسة الذكاء الاصطناعي التوليدي', 'نظرة عملية على أدوات الذكاء الاصطناعي.', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days' + interval '1 hour', $4, 30, 'published', now() - interval '1 day'),
       ($1, 'جلسة إدارة الوقت الفعّالة', 'أدوات وعادات لإدارة وقتك بذكاء.', $3, 'introductory', now() + interval '4 days', 60, now() + interval '4 days' + interval '1 hour', $4, 30, 'published', now() - interval '1 day')
     returning id`,
    [orgId, categoryAiId, categoryTimeId, venueId],
  );
  sessionAiId = sessRows[0].id;
  sessionTimeId = sessRows[1].id;

  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو التصفّح" } });
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("both sessions list on the unfiltered page", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  await expect(page.getByRole("heading", { name: "الجلسات", level: 1 })).toBeVisible();
  await expect(page.getByText("جلسة الذكاء الاصطناعي التوليدي")).toBeVisible();
  await expect(page.getByText("جلسة إدارة الوقت الفعّالة")).toBeVisible();
});

test("REQ-DSC-005: a category filter narrows the results, and its chip clears it (REQ-DSC-005)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions?category=${categoryAiId}`);

  await expect(page.getByText("جلسة الذكاء الاصطناعي التوليدي")).toBeVisible();
  await expect(page.getByText("جلسة إدارة الوقت الفعّالة")).not.toBeVisible();

  // The active filter is visible as a removable chip (content's own
  // filters-form.tsx renders the raw param value, so the chip's own text is
  // the category's id here — this test asserts on the mechanism, not the
  // label).
  const chip = page.getByRole("button", { name: new RegExp(categoryAiId) });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(/\/ar\/app\/sessions$/);
  await expect(page.getByText("جلسة إدارة الوقت الفعّالة")).toBeVisible();
});

test("REQ-DSC-003: a text search matches the session whose title carries it", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  await page.getByLabel("ابحث عن جلسة").fill("الذكاء الاصطناعي");
  await page.getByRole("button", { name: "تطبيق" }).click();
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByText("جلسة الذكاء الاصطناعي التوليدي")).toBeVisible();
  await expect(page.getByText("جلسة إدارة الوقت الفعّالة")).not.toBeVisible();
});

test("REQ-DSC-006: bookmarking from the list toggles the button and persists", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  const card = page.locator("li", { has: page.getByText("جلسة الذكاء الاصطناعي التوليدي") });
  await expect(card.getByRole("button", { name: "أضف إلى المحفوظات" })).toBeVisible();
  await card.getByRole("button", { name: "أضف إلى المحفوظات" }).click();
  await expect(card.getByRole("button", { name: "إزالة من المحفوظات" })).toBeVisible();

  const { rows } = await db.query(`select 1 from public.bookmarks where session_id = $1`, [sessionAiId]);
  expect(rows).toHaveLength(1);

  await page.reload();
  const cardAfterReload = page.locator("li", { has: page.getByText("جلسة الذكاء الاصطناعي التوليدي") });
  await expect(cardAfterReload.getByRole("button", { name: "إزالة من المحفوظات" })).toBeVisible();
});

test("the empty state offers a way back when a filter matches nothing", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions?q=لا-يوجد-شيء-بهذا-الاسم");
  await expect(page.getByText("لا جلسات تطابق بحثك")).toBeVisible();
  await page.getByRole("link", { name: "امسح الفلاتر" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/sessions$/);
  await expect(page.getByText("جلسة الذكاء الاصطناعي التوليدي")).toBeVisible();
});

test("SCR-011 at 390 px RTL: results read down the page, and the mobile filter sheet opens without sideways scroll", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  await review(page, "scr-011-browse");

  await page.getByRole("button", { name: "الفلاتر" }).click();
  await expect(page.getByRole("dialog", { name: "فلترة الجلسات" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `.qa-shots/rtl/scr-011-browse-filter-sheet-390-rtl-${test.info().project.name}.png`, fullPage: true });
});

// sessionTimeId is asserted indirectly (its title's absence) throughout;
// referencing it here keeps the seed's intent legible to a future reader.
void sessionTimeId;
