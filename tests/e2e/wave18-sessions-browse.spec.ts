// SCR-011 · /app/sessions — browse, rebuilt in wave 18 from `Browse.dc.html` (REQ-UIX-060,
// STORY-UIX-045, DEC-206 §4.63 – §4.65, DEC-207). The older specs stay as evidence
// (`browse`, `timeline`, `bookmarks`); this one holds what the rebuild adds.
//
//   · the regions in the artboard's order — the title (with the bell on the phone), the search
//     field, one chip row with «المزيد», the eight tags, the date groups;
//   · a live session stands in «هذا الأسبوع», a full one says how many wait, the viewer's own
//     seat is said first, and the amount is the org's rule («+35» when the rule says 35, §4.45);
//   · the ended ones stand behind ONE link with their count;
//   · search replaces the groups with one «نتائج» group, and the shell's phone search lands on
//     the page's field (`#browse-search`, DEC-207 §2);
//   · at 1280 the game rail stands beside the list, «التالية لك» in it.
//
// Captures: `wave18-sessions-browse-<state>-<390|1280>.png` — default, search, filtered-empty.
// No 1280 artboard exists (§4.36): the 1280 capture is the frame's content column.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let userId = "";
const otherUsers: string[] = [];
let email = "";
let categoryId = "";
const T = {
  live: "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية",
  mine: "لوحة تحكم لا يهجرها أحد بعد أسبوع",
  full: "ورشة الإضاءة للمبتدئين: ثلاث لمبات تكفي",
  later: "الأقمشة: كيف تقرأ العيّنة قبل أن تشتريها",
  ended: "ما تعلّمناه من إطلاق فاشل",
};

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w18-browse-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة التصفّح', $1, 'WB', gen_random_uuid()) returning id`, [`w18-browse-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // The rule is read, never a literal: 35 here, so a «+50» or a «+20» on screen is a defect.
  await db.query(`update public.scoring_rules set points = 35, enabled = true where org_id = $1 and action_key = 'check_in'`, [orgId]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;

  categoryId = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name) values ($1, 'قاعة الرياض') returning id`, [orgId])).rows[0].id;
  const session = async (title: string, state: string, offset: string, capacity: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, state, starts_at, duration_minutes, ends_at, capacity, venue_id, time_zone, published_at, completed_at)
         values ($1, $2, 'نبذة.', $3, 'introductory', $5::public.session_state, now() + $4::interval, 60, now() + $4::interval + interval '1 hour', $6, $7, 'Asia/Riyadh',
                 now() - interval '10 days', case when $5 = 'completed' then now() + $4::interval + interval '1 hour' end)
         returning id`,
        [orgId, title, categoryId, offset, state, capacity, venue],
      )
    ).rows[0].id;
  await session(T.live, "published", "-20 minutes", 40);
  const mineId = await session(T.mine, "published", "1 day", 40);
  const fullId = await session(T.full, "published", "2 days", 1);
  await session(T.later, "published", "70 days", 25);
  await session(T.ended, "completed", "-3 days", 40);

  const tagRow = (await db.query<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'تقارير', 'تقارير') returning id`, [orgId])).rows[0].id;
  await db.query(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [orgId, mineId, tagRow]);

  // Someone else holds the full session's one seat, and four wait.
  for (let i = 0; i < 5; i++) {
    const otherEmail = `other-${i}@${domain}`;
    const user = await admin.auth.admin.createUser({ email: otherEmail, password: PASSWORD, email_confirm: true });
    if (user.error) throw user.error;
    otherUsers.push(user.data.user.id);
    const other = (
      await db.query<{ id: string }>(`insert into public.members (org_id, auth_user_id, email, display_name) values ($1, $2, $3, $4) returning id`, [
        orgId,
        user.data.user.id,
        otherEmail,
        `عضو ${i + 1}`,
      ])
    ).rows[0].id;
    // `rsvps_check`: a waitlisted row carries its position (1, 2, …) and a confirmed one none.
    await db.query(`insert into public.rsvps (org_id, session_id, member_id, status, waitlist_position) values ($1, $2, $3, $4, $5)`, [
      orgId,
      fullId,
      other,
      i === 0 ? "confirmed" : "waitlisted",
      i === 0 ? null : i,
    ]);
  }
  const memberId = await provision();
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, mineId, memberId]);
});

test.afterAll(async () => {
  for (const id of [userId, ...otherUsers]) if (id) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

let cookies: { name: string; value: string }[] = [];

async function provision(): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  cookies = [...jar];
  return (data as { member_id: string }).member_id;
}

async function signIn(context: BrowserContext) {
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function streamed(p: Page) {
  await expect(p.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await p.evaluate(() => document.fonts.ready);
}

async function capture(p: Page, state: string, desktop: boolean) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `wave18-sessions-browse-${state}-${desktop ? 1280 : 390}.png`), fullPage: true });
}

test("the regions in the artboard's order, the rows as drawn, and the rule's amount", async ({ context, page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  await signIn(context);
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto("/ar/app/sessions");
  await streamed(page);

  const main = page.locator("#main");
  const order = await main.evaluate((root) => {
    const all = [...root.querySelectorAll("*")];
    const at = (sel: string) => all.indexOf(root.querySelector(sel) as Element);
    return [at("h1"), at("#browse-search"), at('nav[aria-label="تصفية الجلسات"]'), at('ul[aria-label="الوسوم الأكثر استخدامًا"]'), at("section ol")];
  });
  expect(order.every((n) => n >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  const rows = main.locator("ol article");
  // ★ A live session stands in «هذا الأسبوع» under its badge.
  const week = main.getByRole("region", { name: /هذا الأسبوع/ });
  await expect(week.locator("article").filter({ hasText: T.live })).toContainText("جارية الآن");
  await expect(rows.filter({ hasText: T.mine })).toContainText("مقعدك محجوز");
  await expect(rows.filter({ hasText: T.full })).toContainText("ممتلئة، 4 في الانتظار");
  await expect(main.getByRole("region", { name: /لاحقًا/ })).toContainText(T.later);
  // ★ The rule's amount, never a literal (§4.45).
  await expect(rows.filter({ hasText: T.mine })).toContainText("+35");
  await expect(main.locator("ol")).not.toContainText("+50");
  // ★ No sort control (§4.63).
  await expect(main.getByRole("button", { name: /ترتيب|الأعلى تقييمًا/ })).toHaveCount(0);
  // ★ The ended ones behind ONE link, with their count.
  await expect(main.getByRole("region", { name: "سابقة" }).getByRole("link", { name: "عرض جلسة مكتملة واحدة" })).toHaveAttribute("href", "/ar/app/sessions?status=ended");
  await expect(rows.filter({ hasText: T.ended })).toHaveCount(0);

  // At 1280 the game rail stands beside the list, with «التالية لك».
  if (desktop) await expect(main.getByRole("region", { name: "التالية لك" })).toContainText(T.mine);
  await capture(page, "default", desktop);
});

test("★ the shell's phone search lands on the page's field, and search replaces the groups with «نتائج»", async ({ context, page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  await signIn(context);
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto("/ar/app/sessions#browse-search");
  await streamed(page);
  const field = page.locator("#main").getByRole("searchbox", { name: "ابحث في الجلسات" });
  await expect(field).toHaveAttribute("id", "browse-search");
  await field.fill("الإضاءة");
  await field.press("Enter");
  await expect(page).toHaveURL(/q=/);
  await streamed(page);
  const main = page.locator("#main");
  await expect(main.getByRole("region", { name: /نتائج/ })).toContainText(T.full);
  await expect(main.getByRole("region", { name: /هذا الأسبوع/ })).toHaveCount(0);
  await capture(page, "search", desktop);
});

test("filtered-empty names the filter and offers to drop it; the applied filters stay visible and removable", async ({ context, page }, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  await signIn(context);
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto(`/ar/app/sessions?category=${categoryId}&level=advanced`);
  await streamed(page);
  const main = page.locator("#main");
  await expect(main.getByText("لا جلسات تطابق «⁨متقدم⁩» مع بقية عوامل التصفية")).toBeVisible();
  const applied = main.getByRole("list", { name: "عوامل التصفية المطبّقة" });
  await expect(applied.getByText("التصنيف: إداري")).toBeVisible();
  await expect(applied.getByText("المستوى: متقدم")).toBeVisible();
  await capture(page, "filtered-empty", desktop);
});
