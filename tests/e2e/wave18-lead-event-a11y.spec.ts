// Wave 18, PR B — the accessibility sweep over the three rebuilt screens in every phase (REQ-NFR-007, REQ-UIX-061,
// REQ-UIX-062; STORY-UIX-048 … 050). `a11y.spec.ts` scans the event page OPEN only; this adds the live and ended
// phases, check-in (SCR-014) and the host view (SCR-016), at the phone's 390 and at desktop width, with the same
// tags and the same bar: no serious or critical axe violation.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
const ids = { open: "", live: "", done: "" };
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w18-a11y-${tag}.example`;
  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الوصول', $1, 'WA', gen_random_uuid()) returning id`,
      [`w18-a11y-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الرياض', 'الدور الثالث') returning id`, [orgId])).rows[0].id;
  const session = async (state: string, offset: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id,
                                      time_zone, published_at, completed_at, check_in_open, allow_walk_ins)
         values ($1, 'جلسة الوصول الشامل', 'كيف نجعل كل شاشة قابلة للاستخدام.', $2, 'introductory', 'ar', $4::public.session_state,
                 now() + $3::interval, 60, now() + $3::interval + interval '1 hour', 40, $5, 'Asia/Riyadh', now() - interval '10 days',
                 case when $4 = 'completed' then now() + $3::interval + interval '1 hour' end, $4 = 'in_progress', true)
         returning id`,
        [orgId, category, offset, state, venue],
      )
    ).rows[0].id;
  ids.open = await session("published", "2 days");
  ids.live = await session("in_progress", "-12 minutes");
  ids.done = await session("completed", "-1 day");
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: string, asAdmin = false): Promise<string> {
  const email = `${who}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `عضو ${who}` } });
  if (error) throw error;
  users.push(data.user.id);
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

/** Scans one page and returns its serious and critical violations as a report line, or "" when clean. */
async function scan(page: Page, path: string): Promise<string> {
  await page.goto(path);
  await expect(page.locator("#main")).toBeVisible();
  // Every streamed region in place — a scan of a skeleton proves nothing.
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.locator("#main .animate-pulse")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of results.violations.filter((v) => !blocking.includes(v))) console.log(`a11y advisory ${path}: ${v.id} (${v.impact}) ×${v.nodes.length}`);
  if (blocking.length === 0) return "";
  return `${path}\n` + blocking.map((v) => `${v.id} (${v.impact}) — ${v.help}\n` + v.nodes.slice(0, 5).map((n) => `  ${n.target.join(" ")}`).join("\n")).join("\n");
}

/** Every page is scanned before anything fails, so one finding never hides the next page's. */
async function sweep(page: Page, paths: string[]) {
  const reports: string[] = [];
  for (const path of paths) reports.push(await scan(page, path));
  expect(reports.filter(Boolean).join("\n\n")).toBe("");
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
});

test("a member: the event page open, live and ended, and check-in", async ({ context, page }) => {
  const memberId = await signIn(context, "member");
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.live, memberId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.done, memberId]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'حضر الجلسة', $3, 'empty'::tstzrange)`,
    [orgId, ids.done, memberId],
  );
  await sweep(page, [
    `/ar/app/sessions/${ids.open}`,
    `/ar/app/sessions/${ids.live}`,
    `/ar/app/sessions/${ids.done}`,
    `/ar/app/sessions/${ids.live}/check-in`,
    // ★ A refused code: the alert state is a screen of its own.
    `/ar/app/sessions/${ids.live}/check-in?error=invalid_code&code=ZZZZZZ`,
  ]);
});

test("staff: the host view", async ({ context, page }) => {
  await signIn(context, "staff", true);
  await sweep(page, [`/ar/app/sessions/${ids.live}/host`]);
});
