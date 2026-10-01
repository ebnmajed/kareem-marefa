// SCR-020 · /app/members/[id] — rebuilt in wave 19 (REQ-UIX-069, REQ-PRF-004, REQ-LDR-008, A33, DEC-213
// §5.114 – §5.123, DEC-214). What a browser shows each tier, against a real database:
//
//   · the regions in the artboard's order; the level, the balance, this month's and the all-time rank, the badges
//     with «N من M», the sessions presented with the delivered count, the photos; ★ no week anywhere;
//   · ★ an opted-out member, seen by a colleague: «—» for the balance and both ranks, no progress line, the level
//     still shown; the member themselves sees every figure;
//   · the self tier's note and links; the admin's record; ★ desktop at 1280: a 1fr / 380 body, no game rail.
//
// Captures (`E2E_SHOTS_DIR` or `.qa-shots/rtl`): `wave19-scoring-profile-{member,opted-out,self,admin}-{390,1280}.png`.
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
let subjectId = "";
const emails = { subject: "", colleague: "", admin: "" };
const users: string[] = [];

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w19-profile-${tag}.example`;
  // The org's insert seeds the default levels (0 · 100 · 300 · 700 · 1500) and the badge catalogue (0027, 0083).
  const org = await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الملف', $1, 'WP', gen_random_uuid()) returning id`, [`w19-profile-${tag}`]);
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const company = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId]);
  const category = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const venue = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);

  const ids: Record<string, string> = {};
  for (const [key, name] of [
    ["subject", "سارة القحطاني"],
    ["colleague", "فهد العنزي"],
    ["admin", "مشرف المؤسسة"],
  ] as const) {
    const email = `${key}@${domain}`;
    emails[key] = email;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    users.push(data.user.id);
    ids[key] = await provision(email);
  }
  subjectId = ids.subject;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`update public.members set company_id = $1, job_title = 'مديرة المواهب', bio = 'أبني فرق المواهب من الصفر.' where id = $2`, [company.rows[0].id, subjectId]);
  await db.query(`insert into public.member_interests (org_id, member_id, category_id) values ($1, $2, $3)`, [orgId, subjectId, category.rows[0].id]);
  await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 1240, 'manual_adjustment', 'اختبار', $3)`, [orgId, subjectId, `e2e:w19-profile:${subjectId}`]);
  // The nightly evaluation, by hand: level 4 «كريم معرفة» at 700, the next 1500.
  await db.query(`update public.points_balances set current_level_id = (select id from public.levels where org_id = $1 and sort_order = 4) where member_id = $2`, [orgId, subjectId]);
  await db.query(
    `insert into public.member_badges (org_id, member_id, badge_id) select $1, $2, id from public.badges where org_id = $1 and key in ('first_check_in', 'first_session')`,
    [orgId, subjectId],
  );

  const session = async (title: string, state: "completed" | "published", days: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'ملخص', $3, 'introductory', now() + ($5 || ' days')::interval, 60, now() + ($5 || ' days')::interval + interval '1 hour', $4, 30, $6, now() - interval '10 days',
                 case when $6 = 'completed' then now() + ($5 || ' days')::interval + interval '1 hour' end)
         returning id`,
        [orgId, title, category.rows[0].id, venue.rows[0].id, String(days), state],
      )
    ).rows[0].id;
  for (const [title, state, days] of [
    ["مقابلة العمل من الجهة الأخرى للطاولة", "completed", -20],
    ["التفاوض على الراتب بلا حرج", "completed", -40],
    ["وصف وظيفي صادق في 200 كلمة", "completed", -60],
    ["العرض في 5 شرائح", "published", 7],
  ] as const) {
    const id = await session(title, state, days);
    await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, id, subjectId]);
  }
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
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

const desktop = () => test.info().project.name === "desktop";

async function open(page: Page) {
  await page.setViewportSize(desktop() ? DESKTOP : PHONE);
  await page.goto(`/ar/app/members/${subjectId}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, state: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${state} scrolls sideways`).toBe(true);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave19-scoring-profile-${state}-${desktop() ? 1280 : 390}.png`), fullPage: true });
}

test("member tier: the regions in order, the standing with the month and all time, the badges, the sessions", async ({ context, page }) => {
  await signIn(context, emails.colleague);
  await open(page);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("سارة القحطاني");
  await expect(main.getByRole("navigation", { name: "مسار التنقّل" })).toContainText("مواهب");
  const standing = main.locator("section", { has: page.locator("#standing") });
  await expect(standing).toContainText("1,240");
  await expect(standing).toContainText("هذا الشهر");
  await expect(standing).toContainText("كل الأوقات");
  await expect(main).not.toContainText("الأسبوع");
  await expect(main.locator("section", { has: page.locator("#badges") })).toContainText(/2 من \d+/);
  const presented = main.locator("section", { has: page.locator("#presented") });
  await expect(presented.locator("h2")).toHaveText("الجلسات المقدَّمة");
  await expect(presented).toContainText("3");
  await expect(main).not.toContainText("متوسط التقييم");
  await expect(main.getByRole("heading", { name: "للمشرفين" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "عدّل ملفك" })).toHaveCount(0);
  if (desktop()) {
    // ★ 1fr / 380, no game rail: the badges stand beside the sessions, and no rail aside exists.
    const sessions = await presented.boundingBox();
    const badges = await main.locator("section", { has: page.locator("#badges") }).boundingBox();
    expect(badges!.width).toBeGreaterThan(370);
    expect(badges!.width).toBeLessThan(390);
    expect(Math.abs(badges!.y - sessions!.y)).toBeLessThan(40);
    await expect(main.locator("aside")).toHaveCount(0);
  } else {
    await expect(main.getByRole("button", { name: "مشاركة الملف" })).toBeVisible();
  }
  await capture(page, "member");
});

test("★ opted out, seen by a colleague: «—» for the balance and both ranks, the level still shown", async ({ context, page }) => {
  await db.query(`update public.members set leaderboard_opt_out = true where id = $1`, [subjectId]);
  await signIn(context, emails.colleague);
  await open(page);
  const standing = page.locator("#main section", { has: page.locator("#standing") });
  await expect(standing).toContainText("كريم معرفة");
  await expect(standing).not.toContainText("1,240");
  await expect(standing).not.toContainText("بقي");
  await expect(standing).toContainText("—");
  await capture(page, "opted-out");
});

test("self tier: every figure of their own, the note and the links into the hub", async ({ context, page }) => {
  await signIn(context, emails.subject);
  await open(page);
  const main = page.locator("#main");
  await expect(main.getByText("هكذا يرى زملاؤك ملفك.")).toBeVisible();
  await expect(main.getByRole("link", { name: "عدّل ملفك" })).toHaveAttribute("href", "/ar/app/me");
  await expect(main.locator("section", { has: page.locator("#standing") })).toContainText("1,240");
  await expect(main.getByRole("region", { name: "في حسابك" }).getByRole("link")).toHaveCount(3);
  await expect(main).not.toContainText(emails.subject);
  await capture(page, "self");
  await db.query(`update public.members set leaderboard_opt_out = false where id = $1`, [subjectId]);
});

test("admin tier: the record, with the email", async ({ context, page }) => {
  await signIn(context, emails.admin);
  await open(page);
  const record = page.locator("#main section", { has: page.getByRole("heading", { name: "للمشرفين" }) });
  await expect(record).toBeVisible();
  await expect(record).toContainText(emails.subject);
  await capture(page, "admin");
});
