// K1 and K2 — `DEC-176`, `DEC-178`, `docs/plan/notes/console.md`'s "Wave 13 plan".
//
// K1: the rail's own leaf for the session settings hub needed no code
// (`admin-rail.tsx`'s `isCurrent()` already prefix-matches any route under
// `/app/admin/sessions/`) — this proves that reading against a real page,
// not just the source: «الجلسات» carries `aria-current="page"` three levels
// into the hub (`/app/admin/sessions/[id]/schedule`), and the phone drawer
// is where that has to be seen, since the rail itself is hidden below `md`.
//
// K2: `/app/admin/templates` redirects into `designer`'s tabbed
// posters | certificates view (`5cd672c`) — the address `16` §10.3's grid
// was missing, not a rebuild of the grid itself. Proves the redirect lands
// on real content (not the generic `/app` not-found page an unauthenticated
// probe of this exact path used to hit), the rail shows one «القوالب» leaf
// rather than the old two-child disclosure, and the tab strip's own href
// mode carries the `/ar` prefix correctly.
//
// Captures, phone project only, 390 × 844, viewport screenshots (not
// element screenshots — the fixed header/tab-bar chrome is exactly what an
// element shot would paint over, the lead's own finding on `sessions`' first
// pass at this):
//   wave13-console-templates-index.png     /app/admin/templates, tabbed on «الملصقات»
//   wave13-console-rail-hub-current.png    the phone drawer, «الجلسات» current inside the hub
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
  const domain = `wave13-console-tpl-${tag}.example`;
  email = `boss@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة القوالب', $1, 'TP', gen_random_uuid(), $2) returning id`,
    [`wave13-console-tpl-${tag}`, email],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'عام') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الرئيسية', 30) returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة تجريبية للقوالب', 'ملخص قصير.', $2, 'introductory', now() + interval '5 days', 60, now() + interval '5 days' + interval '1 hour', $3, 30, 'published', now())
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف القوالب" } });
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
async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave13-console-${name}.png`) });
}

test("K2: /app/admin/templates redirects into the tabbed library, not the generic not-found page", async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await goto(page, "/ar/app/admin/templates");
  await expect(page).toHaveURL(/\/ar\/app\/admin\/templates\/posters$/);

  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("قوالب الملصقات");
  const tabs = main.getByRole("tablist", { name: "أنواع القوالب" });
  await expect(tabs.getByRole("tab", { name: "الملصقات" })).toHaveAttribute("aria-selected", "true");
  const certTab = tabs.getByRole("tab", { name: "الشهادات" });
  await expect(certTab).toHaveAttribute("aria-selected", "false");
  await expect(certTab).toHaveAttribute("href", "/ar/app/admin/templates/certificates");

  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "the tab strip or the grid scrolls the page sideways at 390 px").toBe(false);

  await capture(page, "templates-index");
});

test("K1: the phone drawer marks «الجلسات» current three levels into the session hub", async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await goto(page, `/ar/app/admin/sessions/${sessionId}/schedule`);

  // The rail is hidden below `md` — the drawer is where this is actually seen.
  await expect(page.getByRole("navigation", { name: "لوحة إدارة المؤسسة" })).toBeHidden();
  await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const dialog = page.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });
  await expect(dialog).toBeVisible();

  const sessionsLink = dialog.getByRole("link", { name: "الجلسات" });
  await expect(sessionsLink).toHaveAttribute("aria-current", "page");
  await expect(sessionsLink).toHaveAttribute("href", "/ar/app/admin/sessions");
  // Nothing duplicates the hub's own strip — the rail never disclosed
  // anything below the sessions leaf, this wave or before it.
  await expect(dialog.getByRole("link", { name: "الجدولة" })).toHaveCount(0);

  await capture(page, "rail-hub-current");
});
