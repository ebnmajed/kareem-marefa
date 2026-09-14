// REQ-NFR-007 — WCAG 2.2 AA on every key screen, by axe, against REAL local
// Supabase (STORY-NFR-004, the lead's closing pass of wave 4). One member,
// one admin, one published session; each screen is loaded, settled, and
// scanned with the WCAG 2.x A/AA rule tags. A `serious` or `critical`
// violation fails the screen and names the rule, the selector and the help
// URL, so the fix is a lookup rather than a hunt. `moderate` and `minor`
// findings are printed and do not fail — they are the manual half of
// 13 §2's "axe + manual", reviewed by a person.
//
// RTL is not a rule axe knows: the 390 px captures and the i18n unit tests
// cover it. What axe does catch that nothing else here does: a form control
// with no accessible name, a landmark used twice, a contrast failure on a
// token pair a template author never looked at, a focus order that skips.
import AxeBuilder from "@axe-core/playwright";
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
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let memberEmail = "";
let adminEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `a11y-e2e-${tag}.example`;
  memberEmail = `member@${domain}`;
  adminEmail = `admin@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة الوصول', $1, 'AY', gen_random_uuid(), $2) returning id`,
    [`a11y-e2e-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الوصول', 40) returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة الوصول الشامل', 'كيف نجعل كل شاشة قابلة للاستخدام بلوحة المفاتيح وقارئ الشاشة.', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days' + interval '1 hour', $3, 40, 'published', now())
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  for (const [email, name] of [[memberEmail, "عضو الوصول"], [adminEmail, "مشرفة الوصول"]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
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

async function scan(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main, [role=main]").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const advisory = results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  for (const v of advisory) console.log(`a11y advisory ${path}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.helpUrl}`);
  const report = blocking
    .map((v) => `${v.id} (${v.impact}) — ${v.help}\n  ${v.helpUrl}\n` + v.nodes.slice(0, 5).map((n) => `  ${n.target.join(" ")}`).join("\n"))
    .join("\n");
  expect(blocking, `${path}\n${report}`).toEqual([]);
}

test("SCR-002 sign-in, with no session", async ({ page }) => {
  await scan(page, "/ar/sign-in");
});

test("the member's screens: home, browse, the event page, me, leaderboards, notifications", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["/ar/app", "/ar/app/sessions", `/ar/app/sessions/${sessionId}`, "/ar/app/me", "/ar/app/leaderboards", "/ar/app/me/notifications", "/ar/app/propose"]) {
    await scan(page, path);
  }
});

test("the admin's screens: dashboard, sessions, members, branding, audit", async ({ context, page }) => {
  await signIn(context, adminEmail);
  for (const path of ["/ar/app/admin", "/ar/app/admin/sessions", "/ar/app/admin/members", "/ar/app/admin/branding", "/ar/app/admin/audit", "/ar/app/admin/templates"]) {
    await scan(page, path);
  }
});
