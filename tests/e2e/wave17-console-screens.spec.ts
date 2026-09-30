// K4 — `DEC-199` §1.1, `REQ-UIX-053`, `docs/plan/notes/console.md`'s "Wave 17 plan".
//
// The console on the dark ground, at 390 px: the six data-dense primitives on REAL screens, and the register. Each
// screen is checked for the two things a capture cannot say — the page sits inside the playground's scope with no
// `.theme-dark` island, and nothing scrolls the page sideways — and then captured for the lead to open in bands.
// The lead runs this on the next production build; a viewport screenshot, never `fullPage`.
//
// Captures, phone project only, 390 × 844:
//   wave17-console-sessions-table.png   `data-table` (row rules, sticky head, the live badge) and the rail's current leaf
//   wave17-console-members-table.png    `data-table`'s card list below `md`, its bulk bar
//   wave17-console-companies-menu.png   `menu` open over the table (does its edge read?)
//   wave17-console-audit-sheet.png      `sheet` open: scrim and edge, the `date-time` fields inside
//   wave17-console-schedule-picker.png  `date-time`'s popover open
//   wave17-console-rail-drawer.png      the phone drawer (`sheet`) with «الجلسات» current
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
let sessionId = "";
let email = "";
let userId = "";

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "both captures are the phone treatment — the rail is a drawer, and this is the width the review is about");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave17-console-scr-${tag}.example`;
  email = `staff@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الكونسول', $1, 'CS', gen_random_uuid(), $2) returning id`,
    [`wave17-console-scr-${tag}`, email],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.companies (org_id, name) values ($1, 'شركة المسح')`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'عام') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الرئيسية', 30) returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة تجريبية للكونسول', 'ملخص قصير.', $2, 'introductory', now() + interval '5 days', 60, now() + interval '5 days' + interval '1 hour', $3, 30, 'published', now())
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف الكونسول" } });
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

/** Waits out React's streamed Suspense boundaries — `console.spec.ts`'s own
 *  `goto()`, restated here rather than imported (each spec is self-contained). */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/** A plain viewport screenshot at the current scroll position — never
 *  `fullPage` and never a locator's own screenshot, both of which can paint
 *  around or ignore the fixed header/tab-bar chrome that is exactly what the
 *  review is checking. */
async function capture(page: Page, name: string, open = false) {
  expect(page.viewportSize()).toEqual(PHONE);
  // An open menu, popover or sheet closes on blur: leave focus and scroll alone for those.
  if (!open) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave17-console-${name}.png`) });
}


/** The register's two facts, per screen: inside the scope, no old-look island, no sideways page. */
async function register(page: Page) {
  expect(await page.locator(".theme-play").count(), "the console is inside the playground's scope").toBeGreaterThan(0);
  expect(await page.locator("#main .theme-dark, #main.theme-dark").count(), "a .theme-dark island under the scope").toBe(0);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "the page scrolls sideways at 390 px").toBe(false);
}

test.beforeEach(async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
});

test("the sessions table on the dark ground", async ({ page }) => {
  await goto(page, "/ar/app/admin/sessions");
  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toBeVisible();
  await register(page);
  await capture(page, "sessions-table");
});

test("the members table on the dark ground", async ({ page }) => {
  await goto(page, "/ar/app/admin/members");
  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toBeVisible();
  await register(page);
  await capture(page, "members-table");
});

test("the companies row menu is legible over the table", async ({ page }) => {
  await goto(page, "/ar/app/admin/companies");
  await register(page);
  // The row's button is named by its colour (`wave15-console-team-colour.spec.ts`): a new company has none.
  const trigger = page.locator("#main").getByRole("button", { name: /بلا لون/ }).first();
  test.skip((await trigger.count()) === 0, "no company row in this org — the menu has nothing to open on");
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await capture(page, "companies-menu", true);
});

test("the audit filters sheet on the dark ground", async ({ page }) => {
  await goto(page, "/ar/app/admin/audit");
  await register(page);
  await page.locator("#main").getByRole("button", { name: /تصفية/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, "audit-sheet", true);
});

test("the schedule's date picker popover on the dark ground", async ({ page }) => {
  await goto(page, `/ar/app/admin/sessions/${sessionId}/schedule`);
  await register(page);
  await page.locator('#main [aria-haspopup="dialog"]').first().click();
  await expect(page.locator('#main [role="dialog"]').first()).toBeVisible();
  await capture(page, "schedule-picker", true);
});

test("the phone drawer on the dark ground", async ({ page }) => {
  await goto(page, "/ar/app/admin/sessions");
  await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const dialog = page.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "الجلسات" })).toHaveAttribute("aria-current", "page");
  await capture(page, "rail-drawer", true);
});
