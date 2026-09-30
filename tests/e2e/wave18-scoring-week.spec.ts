// Wave 18 — the member's week on the home, and moments 3 and 5 SHARED with SCR-022 and the monthly board
// (REQ-UIX-055, DEC-206 §5, DEC-207 §1.3, §2), against REAL local Supabase. scoring's spec; the lead runs it.
//
//   ★★ One occurrence, two surfaces: the home first → SCR-022 and the board are silent for it; SCR-022 and the
//      board first → the home is silent.
//   ★★ The home acknowledges moment 3 with the level LAST SEEN, so SCR-022's level card still turns (F5).
//   ★  A hard load of the home paints the truth and records nothing; the copy the frame hides plays nothing.
//   ★  Under reduced motion the week is whole and still.
//
// Motion is counted, not guessed: an init script counts `Element.prototype.animate()` calls. Captures:
// `.qa-shots/rtl/wave18-scoring-home-{hud,rail}-{animated,static}-{390,1280}.png`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial", timeout: 120_000 });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let meEmail = "";
let meId = "";
let levels: { id: string }[] = [];
let myCompany = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  domain = `week-e2e-${tag}.example`;

  // The org's insert seeds the default levels (0 · 100 · 300 · 700 · 1500) and the monthly streak rule (0027).
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الأسبوع', $1, 'WK', gen_random_uuid()) returning id`,
    [`week-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: c1 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'صنف', '#ff4fb8') returning id`, [orgId]);
  const { rows: c2 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#3fd0ff') returning id`, [orgId]);

  // Three colleagues with points THIS month: سارة 300 (مواهب), فهد 110 (صنف), نورة 100 (مواهب).
  for (const [name, points, company] of [
    ["سارة القحطاني", 300, c2[0].id],
    ["فهد العنزي", 110, c1[0].id],
    ["نورة الحربي", 100, c2[0].id],
  ] as const) {
    const email = `${points}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, company_id) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, data.user.id, email, name, company],
    );
    await db.query(
      `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, $3, 'manual_adjustment', 'اختبار', $4)`,
      [orgId, rows[0].id, points, `e2e:week:${rows[0].id}`],
    );
  }

  meEmail = `me@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم الشهري" } });
  if (error) throw error;
  users.push(data.user.id);
  ({ rows: levels } = await db.query<{ id: string }>(`select id from public.levels where org_id = $1 order by sort_order`, [orgId]));
  // The member belongs to صنف, so the race outlines «فريقك».
  myCompany = c1[0].id;
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

/** Counts every `element.animate()` the page makes, from before its first script. */
async function countAnimations(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __animations: number };
    w.__animations = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      w.__animations += 1;
      return original.apply(this, args);
    };
  });
}
const animations = (page: Page) => page.evaluate(() => (window as unknown as { __animations: number }).__animations);

/**
 * ★ Clicks a link as the APP's own navigation — the gate at a9bd97df found the phone clicking a tab before React had
 * hydrated it, which is a plain browser navigation: a server paint, correctly silent, and the wrong thing to test.
 * So it waits until React owns the link, marks the window, clicks, and proves the window survived (a hard load
 * would have replaced it).
 */
/**
 * «Nothing moved» is only worth asserting once React owns the surface and a moment would have had time to run: the
 * longest sequence is the count-up, the flame, the bar and the turn — under three seconds. The one fixed wait in the
 * file, and it only ever makes a silence assertion stricter.
 */
async function settled(page: Page) {
  const surface = page.locator("#main [data-moment]").first();
  await expect.poll(() => surface.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(3000);
}

async function navigateInApp(page: Page, link: ReturnType<Page["locator"]>, url: RegExp) {
  await expect
    .poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"))), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate(() => ((window as unknown as { __inApp: boolean }).__inApp = true));
  await link.click();
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => (window as unknown as { __inApp?: boolean }).__inApp), "the navigation was the app's own, not a page load").toBe(true);
}

const desktop = () => test.info().project.name === "desktop";

/** The week this project shows: the rail from `lg`, the HUD below it — the other copy is in the HTML, not displayed. */
const weekOf = (page: Page) =>
  desktop() ? page.locator("#main aside [data-moment-copy]").first() : page.locator("#main [data-moment-copy]").filter({ has: page.getByRole("region", { name: "حصيلتك هذا الشهر" }) });

/**
 * ★ The week has arrived and its displayed copy owns the moments — the controller is mounted. Before this, «no
 * animation yet» means nothing: under load (this spec beside `content`'s, four workers) the home's streamed week
 * can land seconds after the URL changes. The generous timeout is that load, not a guess at the moment's length.
 */
async function weekReady(page: Page) {
  await expect(weekOf(page)).toHaveAttribute("data-moment-copy", "displayed", { timeout: 30_000 });
  await expect(weekOf(page)).toHaveAttribute("data-moment", /playing|static/, { timeout: 30_000 });
}

async function capture(page: Page, surface: "hud" | "rail", state: "animated" | "static") {
  mkdirSync(SHOTS, { recursive: true });
  const size = desktop() ? DESKTOP : PHONE;
  await page.setViewportSize(size);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave18-scoring-home-${surface}-${state}-${size.width}.png`) });
}

async function mark() {
  const { rows } = await db.query(`select * from public.member_seen_marks where member_id = $1`, [meId]);
  return rows[0] as Record<string, unknown> | undefined;
}

async function anotherPhone(browser: Browser, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const context = await browser.newContext({ viewport: desktop() ? DESKTOP : PHONE, locale: "ar-SA", reducedMotion });
  await countAnimations(context);
  meId = await signIn(context, meEmail);
  return { context, page: await context.newPage() };
}

/** The month's provisional snapshot, as the nightly job takes it. */
async function snapshot() {
  await db.query(
    `select public.snapshot_leaderboard($1, 'monthly', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`,
    [orgId],
  );
  await db.query(
    `select public.snapshot_leaderboard($1, 'company', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`,
    [orgId],
  );
}

/**
 * A paid completion, a level reached, and marks that say the member saw the old figure, the old level and a rank
 * two places lower than the one the snapshot gives them — so moment 5 is always a RISE.
 *
 * ★ Every case derives its own expectations from the database (the lead's gate at ca1b5b04): a case run on its
 * own (`:265`) does not inherit the points an earlier case paid, so a rank written into the spec was a rank of a
 * different run. Returns the new balance and the rank the snapshot gives the member.
 */
async function anOccurrence(amount: number): Promise<{ total: number; rank: number }> {
  await db.query(`update public.members set company_id = $1 where id = $2`, [myCompany, meId]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, $3, 'check_in', 'تسجيل حضور مؤكَّد', $4)`,
    [orgId, meId, amount, `e2e:week:paid:${meId}:${amount}:${Date.now()}`],
  );
  await snapshot();
  const { rows } = await db.query<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [meId]);
  const total = rows[0].total_points;
  const { rows: ranked } = await db.query<{ rank: number }>(
    `select e.rank from public.leaderboard_entries e join public.leaderboard_snapshots s on s.id = e.snapshot_id
      where s.org_id = $1 and s.kind = 'monthly' and s.period_start = date_trunc('month', now())::date and e.member_id = $2`,
    [orgId, meId],
  );
  const rank = ranked[0].rank;
  await db.query(`update public.points_balances set current_level_id = $1 where member_id = $2`, [levels[1].id, meId]);
  await db.query(
    `insert into public.member_seen_marks (member_id, org_id, points_total, level_id, monthly_period, monthly_rank)
     values ($1, $2, $3, $4, date_trunc('month', now())::date, $5)
     on conflict (member_id) do update set points_entry_id = null, points_total = excluded.points_total, level_id = excluded.level_id,
       monthly_period = excluded.monthly_period, monthly_rank = excluded.monthly_rank`,
    [meId, orgId, total - amount, levels[0].id, rank + 2],
  );
  return { total, rank };
}

const homeTab = (page: Page) => page.getByRole("link", { name: "الرئيسية", exact: true }).filter({ visible: true }).first();

test("★★ the home first: moments 3 and 5 play on the week; SCR-022 and the monthly board are silent for them — and the level card still turns", async ({ browser }) => {
  const one = await anotherPhone(browser);
  const { total, rank } = await anOccurrence(120);

  // ★ A hard load of the home: the truth, painted; nothing plays, nothing is recorded.
  await one.page.goto("/ar/app");
  await weekReady(one.page);
  await settled(one.page);
  expect(await animations(one.page)).toBe(0);
  expect((await mark())?.points_total).toBe(total - 120);

  // ★ The app's own arrival: the week plays, and records the points and the rank — with the level LAST SEEN.
  await one.page.goto("/ar/app/me");
  await navigateInApp(one.page, homeTab(one.page), /\/ar\/app$/);
  await weekReady(one.page);
  await expect.poll(() => animations(one.page), { message: "the week's moments played on the app's own arrival", timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await mark())?.points_total, { timeout: 20_000 }).toBe(total);
  await expect.poll(async () => (await mark())?.monthly_rank, { timeout: 20_000 }).toBe(rank);
  expect((await mark())?.level_id, "the week passes the level through (DEC-207 §1.3)").toBe(levels[0].id);
  await capture(one.page, desktop() ? "rail" : "hud", "animated");

  // ★ SCR-022 in-app: moment 3 is silent (no delta) — but moment 4, the level, is still SCR-022's and turns.
  await one.page.goto("/ar/app/me");
  await navigateInApp(one.page, one.page.locator("#main").getByRole("link", { name: "نقاطي", exact: true }).first(), /\/ar\/app\/me\/points$/);
  await expect(one.page.locator("#main [data-slot=delta]")).toHaveCount(0);
  await expect.poll(async () => (await mark())?.level_id, { timeout: 20_000 }).toBe(levels[1].id);

  // ★ The monthly board in-app: the rank is seen; nothing moves.
  await one.page.goto("/ar/app/leaderboards");
  await navigateInApp(one.page, one.page.getByRole("tab", { name: "هذا الشهر" }), /board=month$/);
  const before = await animations(one.page);
  await settled(one.page);
  expect(await animations(one.page)).toBe(before);
  await one.context.close();
});

test("★★ SCR-022 and the board first: the home is silent for what they showed", async ({ browser }) => {
  const two = await anotherPhone(browser);
  const { total, rank } = await anOccurrence(30);

  await two.page.goto("/ar/app/me");
  await navigateInApp(two.page, two.page.locator("#main").getByRole("link", { name: "نقاطي", exact: true }).first(), /\/ar\/app\/me\/points$/);
  await expect.poll(async () => (await mark())?.points_total, { timeout: 20_000 }).toBe(total);
  await two.page.goto("/ar/app/leaderboards");
  await navigateInApp(two.page, two.page.getByRole("tab", { name: "هذا الشهر" }), /board=month$/);
  await expect.poll(async () => (await mark())?.monthly_rank, { timeout: 20_000 }).toBe(rank);

  // Now the home, in-app: nothing of the week moves.
  await navigateInApp(two.page, homeTab(two.page), /\/ar\/app$/);
  await weekReady(two.page);
  const before = await animations(two.page);
  await settled(two.page);
  expect(await animations(two.page)).toBe(before);
  await expect(weekOf(two.page)).toHaveAttribute("data-moment", "static");
  await two.context.close();
});

test("★ the static state under reduced motion is whole — and recorded as seen", async ({ browser }) => {
  const calm = await anotherPhone(browser, "reduce");
  const { total } = await anOccurrence(20);
  await calm.page.goto("/ar/app/me");
  await navigateInApp(calm.page, homeTab(calm.page), /\/ar\/app$/);
  await weekReady(calm.page);
  await settled(calm.page);
  expect(await animations(calm.page)).toBe(0);
  const week = weekOf(calm.page);
  await expect(week.locator("[data-slot=delta]").first()).toBeVisible();
  await expect(week.locator("[data-slot=rise]").first()).toBeVisible();
  await expect.poll(async () => (await mark())?.points_total, { timeout: 20_000 }).toBe(total);
  expect((await mark())?.level_id).toBe(levels[0].id);
  await capture(calm.page, desktop() ? "rail" : "hud", "static");
  await calm.context.close();
});
