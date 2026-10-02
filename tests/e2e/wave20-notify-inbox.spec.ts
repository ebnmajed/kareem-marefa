// Wave 20 — SCR-026, the inbox rebuilt from `Notifications.dc.html` (REQ-UIX-076, REQ-NTF-006, DEC-218 §2.4).
//
// What a component test cannot prove: «عرض الأقدم» against the real database, where 31 notifications written in ONE
// statement share one `created_at` — the case a timestamp-only cursor repeats or skips (D8). And one item opened:
// marked read in the database, and the member on the session. Captures at 390 px for the lead to hold beside the
// artboard: `.qa-shots/rtl/wave20-notify-inbox-<state>-390.png`, honouring `E2E_SHOTS_DIR`.
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
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let memberId = "";
let email = "";
let sessionId = "";
const sessionTitle = "العرض في 5 شرائح";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w20-inbox-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الإشعارات', $1, 'IN', gen_random_uuid()) returning id`,
    [`w20-inbox-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'عروض') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة جدة', 40) returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'نبذة', $3, 'introductory', now() + interval '2 days', 60, now() + interval '2 days 1 hour', $4, 40, 'published', now())
     returning id`,
    [orgId, sessionTitle, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize()).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave20-notify-inbox-${state}-390.png`), fullPage: true });
}

test("empty — the inbox says so, and «ما يصلني» leads to the settings", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me/notifications");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "الإشعارات" })).toBeVisible();
  await expect(main.getByText("لا إشعارات بعد")).toBeVisible();
  await expect(main.getByRole("link", { name: /ما يصلني/ })).toHaveAttribute("href", "/ar/app/me/settings");
  await capture(page, "empty");
});

test("★ 31 items written in ONE statement share one created_at — «عرض الأقدم» lists each exactly once", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await db.query(
    `insert into public.notifications (org_id, member_id, key, payload)
     select $1, $2, 'MSG-badge_earned', jsonb_build_object('name', 'شارة ' || g) from generate_series(1, 31) g`,
    [orgId, memberId],
  );
  const { rows: instants } = await db.query<{ n: string }>(`select count(distinct created_at) n from public.notifications where member_id = $1`, [memberId]);
  expect(instants[0].n).toBe("1");

  await page.goto("/ar/app/me/notifications");
  const main = page.locator("#main");
  const names = async () => main.locator("article bdi").allTextContents();
  const first = await names();
  expect(first).toHaveLength(30);
  await capture(page, "unread");

  await main.getByRole("link", { name: "عرض الأقدم" }).click();
  await expect(main.locator("article")).toHaveCount(1);
  const second = await names();
  expect(new Set([...first, ...second]).size).toBe(31);
  await expect(main.getByRole("link", { name: "عرض الأقدم" })).toHaveCount(0);
});

test("opening an item with a session marks it read and lands on the session; mark-all empties the unread", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await db.query(`select public.notify($1, $2, 'my_sessions', jsonb_build_object('session_id', $3::uuid, 'title', $4::text), 'MSG-rsvp_confirmed')`, [
    orgId,
    memberId,
    sessionId,
    sessionTitle,
  ]);
  await page.goto("/ar/app/me/notifications");
  const main = page.locator("#main");
  await main.locator("li", { hasText: "تأكّد مقعدك" }).getByRole("button", { name: "فتح الجلسة" }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${sessionId}$`));
  const { rows } = await db.query<{ read: boolean }>(
    `select read_at is not null as read from public.notifications where member_id = $1 and key = 'MSG-rsvp_confirmed'`,
    [memberId],
  );
  expect(rows).toEqual([{ read: true }]);

  await page.goto("/ar/app/me/notifications");
  await main.getByRole("button", { name: "تعليم الكل كمقروء" }).click();
  await expect(main.getByText("لا شيء غير مقروء").first()).toBeVisible();
  await expect(main.getByRole("button", { name: "تعليم الكل كمقروء" })).toHaveCount(0);
  await capture(page, "all-read");
});
