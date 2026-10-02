// Wave 20, PR B — SCR-027 and SCR-028 rebuilt from `Board.dc.html` and `Companies.dc.html` (REQ-UIX-078, REQ-UIX-079,
// DEC-216 §2.2, DEC-218 §3.4, DEC-219 §2 as corrected). scoring's spec; the lead runs it on a production build.
//
//   · ★ the boards open on THIS WEEK, summed live: the podium, «ترتيبك» always visible, «حتى الجمعة»;
//   · ★ the movement is «منذ زيارتك الأخيرة»: a rise since the weekly mark plays once by the app's own arrival, the
//     mark is written (`mark_board_seen('weekly', …)`), and a reload is silent;
//   · the category menu on «كل الأوقات» reads the per-category board;
//   · ★ the company race is the quarter's cup: the card from a `company` snapshot whose period is a quarter, the
//     month's race never mistaken for it.
// Captures: `.qa-shots/rtl/wave20-scoring-<027|028>-<state>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
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
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial", timeout: 120_000 });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let meEmail = "";
let meId = "";
let categoryId = "";
let mine = "";
const users: string[] = [];
const desktop = () => test.info().project.name === "desktop";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `boards-e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة اللوحات', $1, 'BD', gen_random_uuid()) returning id`,
    [`boards-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تقني') returning id`, [orgId]);
  categoryId = cat[0].id;
  const { rows: c1 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'صنف', '#ff9a2e') returning id`, [orgId]);
  const { rows: c2 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId]);
  mine = c1[0].id;

  // Four colleagues with points THIS WEEK, so the viewer (130) is fifth and below the podium.
  for (const [name, points, company] of [
    ["سارة القحطاني", 210, c2[0].id],
    ["فهد العنزي", 160, c2[0].id],
    ["محمد الدوسري", 150, c1[0].id],
    ["نورة العتيبي", 140, c1[0].id],
  ] as const) {
    const email = `${points}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, company_id) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, data.user.id, email, name, company],
    );
    await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, $3, 'manual_adjustment', 'اختبار', $4)`, [orgId, rows[0].id, points, `e2e:boards:${rows[0].id}`]);
  }

  meEmail = `me@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان" } });
  if (error) throw error;
  users.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: meEmail, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set company_id = $1 where id = $2`, [mine, id]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

async function capture(page: Page, screen: "027" | "028", state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave20-scoring-${screen}-${state}-${desktop() ? 1280 : 390}.png`), fullPage: true });
}

async function navigateInApp(page: Page, link: ReturnType<Page["locator"]>, url: RegExp) {
  await expect.poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"))), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => ((window as unknown as { __inApp: boolean }).__inApp = true));
  await link.click();
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => (window as unknown as { __inApp?: boolean }).__inApp), "the navigation was the app's own").toBe(true);
}

const weekMark = async () => (await db.query<{ weekly_rank: number | null }>(`select weekly_rank from public.member_seen_marks where member_id = $1`, [meId])).rows[0]?.weekly_rank ?? null;

test("★★ this week, live: the default window, the podium, «ترتيبك», and a rise since the last visit plays once", async ({ browser }) => {
  const context = await browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  meId = await signIn(context);
  await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 130, 'manual_adjustment', 'اختبار', $3)`, [orgId, meId, `e2e:boards:me:${meId}`]);
  // Last seen seventh this week: the board now says fifth — a rise of two.
  const { rows: wk } = await db.query<{ start: string }>(
    `select (d - ((extract(dow from d)::int + 1) % 7))::text as start from (select (now() at time zone 'Asia/Riyadh')::date as d) x`,
  );
  await db.query(
    `insert into public.member_seen_marks (member_id, org_id, weekly_period, weekly_rank) values ($1, $2, $3, 7)
     on conflict (member_id) do update set weekly_period = excluded.weekly_period, weekly_rank = 7`,
    [meId, orgId, wk[0].start],
  );

  const page = await context.newPage();
  await page.goto("/ar/app");
  await navigateInApp(page, page.getByRole("link", { name: /الترتيب|لوحة الصدارة/ }).filter({ visible: true }).first(), /\/ar\/app\/leaderboards$/);

  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toHaveText("لوحات الصدارة");
  await expect(page.getByRole("tab", { name: "هذا الأسبوع" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#main").getByText("حتى الجمعة")).toBeVisible();
  const week = page.locator("#main #weekly");
  await expect(week.locator("[data-slot=podium] > li")).toHaveCount(3);
  const card = week.locator("[data-slot=rank-card]");
  await expect(card).toContainText("#5");
  await expect(card).toContainText("فوقك");
  await expect(card.locator("[data-slot=rise]")).toBeVisible();
  await expect(week.locator("[data-slot=board-rows] > li", { hasText: "يمان" })).toContainText("أنت");
  await expect(week.locator("img")).toHaveCount(0);
  await expect.poll(weekMark, { timeout: 20_000 }).toBe(5);
  await capture(page, "027", "week");

  // ★ A reload is silent: the mark is the rank now.
  await page.reload();
  await expect(page.locator("#main #weekly [data-slot=rank-card]")).toContainText("#5");
  await expect(page.locator("#main #weekly [data-slot=rank-card] [data-slot=rise]")).toHaveCount(0);
  await context.close();
});

test("the category menu on «كل الأوقات» reads the per-category board", async ({ browser }) => {
  const context = await browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(context);
  await db.query(`select public.snapshot_leaderboard($1, 'topic', null, null, $2, false)`, [orgId, categoryId]);
  const page = await context.newPage();
  await page.goto(`/ar/app/leaderboards?board=all&category=${categoryId}`);
  await expect(page.locator("#main").getByRole("button", { name: /التصنيف: تقني/ })).toBeVisible();
  await expect(page.locator("#main #all-time [data-slot=rank-card]")).toContainText("لا ترتيب بعد");
  await page.goto("/ar/app/leaderboards?board=all");
  await expect(page.locator("#main").getByRole("button", { name: "حسب التصنيف" })).toBeVisible();
  await capture(page, "027", "all-time");
  await context.close();
});

test("★★ the company race is the quarter's cup — and the month's snapshot is never taken for it", async ({ browser }) => {
  const context = await browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(context);
  const page = await context.newPage();

  // Only the month's company snapshot: no cup yet — the month's race, labelled.
  await db.query(`select public.snapshot_leaderboard($1, 'company', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`, [orgId]);
  await page.goto("/ar/app/leaderboards?board=companies");
  await expect(page.locator("#main").getByText("سباق هذا الشهر")).toBeVisible();
  await expect(page.locator("#main #company [data-slot=board-rows] > li", { hasText: "صنف" })).toContainText("فريقك");

  // The quarter's, taken after the month's that night: the cup card, and its race.
  await db.query(`select public.snapshot_leaderboard($1, 'company', date_trunc('quarter', now())::date, (date_trunc('quarter', now()) + interval '3 months')::date, null, false)`, [orgId]);
  await page.reload();
  await expect(page.locator("#main").getByRole("heading", { name: /كأس الربع/ })).toBeVisible();
  await expect(page.locator("#main")).toContainText(/الجولة \d من 3/);
  await expect(page.locator("#main")).toContainText("تُسلَّم في اللقاء السنوي");
  await expect(page.locator("#main")).toContainText("الترتيب حسبه: نقاط لكل عضو نشط");
  await expect(page.locator("#main")).not.toContainText("بلا ترتيب");
  await expect(page.locator("#main #company-breakdown").getByRole("heading", { name: "كيف حصلت شركتك على نقاطها" })).toBeVisible();
  await capture(page, "028", "cup");
  await context.close();
});
