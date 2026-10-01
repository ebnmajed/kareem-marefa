// Wave 16 — moments 3 to 5 on the real screens (REQ-UIX-047, REQ-UIX-048, REQ-UIX-044, DEC-195, DEC-197),
// against REAL local Supabase. scoring's spec.
//
// What only a real screen can show (DEC-195 §1): WHEN a moment fires.
//   ★ a page the server painted does not play, and does not record anything as seen (DEC-197 §5);
//   ★ the app's own navigation to it plays it once, and the client that showed it records it;
//   ★ a reload, a back navigation, and ANOTHER PHONE after that are silent — the record is the server's
//     (`member_seen_marks`, 0162), not the browser's;
//   ★ the static state under reduced motion is complete, and is captured beside the animated one.
//
// A moment's motion is counted, not guessed: an init script counts `Element.prototype.animate()` calls.
// Captures: `.qa-shots/rtl/wave16-scoring-<moment>-{animated,static}.png`, phone project, 390 × 844.
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
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
// Each case drives several navigations and waits out a whole moment before asserting silence; the default 30 s is a
// cold server's first case on two projects at once.
test.describe.configure({ mode: "serial", timeout: 90_000 });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let meEmail = "";
let meId = "";
let mine = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  domain = `moments-e2e-${tag}.example`;

  // The org's insert seeds the default levels (0 · 100 · 300 · 700 · 1500) and the monthly streak rule (0027).
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة اللحظات', $1, 'MO', gen_random_uuid()) returning id`,
    [`moments-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: c1 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'صنف', '#ff4fb8') returning id`, [orgId]);
  const { rows: c2 } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#3fd0ff') returning id`, [orgId]);
  mine = c1[0].id;

  // Three colleagues with points: سارة 300 (مواهب), فهد 110 (صنف), نورة 100 (مواهب).
  for (const [name, points, company] of [
    ["سارة القحطاني", 300, c2[0].id],
    ["فهد العنزي", 110, mine],
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
      [orgId, rows[0].id, points, `e2e:moments:${rows[0].id}`],
    );
  }

  meEmail = `me@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم الشهري" } });
  if (error) throw error;
  users.push(data.user.id);
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

async function capture(page: Page, name: string) {
  if (test.info().project.name !== "phone") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave16-scoring-${name}.png`) });
}

/**
 * ★ Moment 4's shot is the LEVEL CARD, not the screen (the lead's finding: the level captures were the completion
 * frame saved twice, because the card already sat inside the first viewport). The card, turned, at 390 px — after
 * the turn for `animated`, the reached face with no shine for `static`.
 */
async function captureCard(page: Page, name: string) {
  if (test.info().project.name !== "phone") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize(PHONE);
  const card = page.locator("#main [data-layout=flip]");
  await expect(card.locator("[data-slot=flip-inner]")).toHaveClass(/rotate-y-180/);
  await expect(card.locator("[data-slot=shine]")).not.toHaveClass(/moment-shine/);
  await card.screenshot({ path: join(SHOTS, `wave16-scoring-${name}.png`) });
}

async function mark() {
  const { rows } = await db.query(`select * from public.member_seen_marks where member_id = $1`, [meId]);
  return rows[0] as Record<string, unknown> | undefined;
}

/** A fresh phone: its own browser context, its own storage, signed in as the same member. */
async function anotherPhone(browser: Browser, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const context = await browser.newContext({ viewport: PHONE, locale: "ar-SA", reducedMotion });
  await countAnimations(context);
  meId = await signIn(context, meEmail);
  return { context, page: await context.newPage() };
}

test("moments 3 and 4 — the head of SCR-022: a server paint is silent; the app's own arrival plays once; a reload and another phone are silent", async ({ browser }) => {
  const one = await anotherPhone(browser);
  await db.query(`update public.members set company_id = $1 where id = $2`, [mine, meId]);

  // The completion pass paid 120 for a session; the nightly evaluation put the member at مشارِك نشِط (100).
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 120, 'check_in', 'تسجيل حضور مؤكَّد', $3)`,
    [orgId, meId, `e2e:moments:paid:${meId}`],
  );
  const { rows: levels } = await db.query<{ id: string; sort_order: number }>(`select id, sort_order from public.levels where org_id = $1 order by sort_order`, [orgId]);
  await db.query(`update public.points_balances set current_level_id = $1 where member_id = $2`, [levels[1].id, meId]);
  // What they last saw: nothing, at the first level.
  await db.query(`insert into public.member_seen_marks (member_id, org_id, points_total, level_id) values ($1, $2, 0, $3)`, [meId, orgId, levels[0].id]);

  const head = one.page.locator("#main [data-moment]").first();

  // ★ A hard load: the server painted the truth. Nothing plays, and nothing is recorded as seen.
  await one.page.goto("/ar/app/me/points");
  await expect(one.page.locator("#main strong", { hasText: "120" })).toBeVisible();
  await expect(head).toHaveAttribute("data-moment", "static");
  await settled(one.page);
  expect(await animations(one.page)).toBe(0);
  expect((await mark())?.points_total).toBe(0);

  // ★ The app's own navigation: moment 3 then moment 4 play once, and the client records what it showed.
  await one.page.goto("/ar/app/me");
  await navigateInApp(one.page, one.page.locator("#main").getByRole("link", { name: "نقاطي", exact: true }).first(), /\/ar\/app\/me\/points$/);
  await expect.poll(() => animations(one.page)).toBeGreaterThan(0);
  await expect(head).toHaveAttribute("data-moment", "static", { timeout: 20_000 });
  await expect.poll(async () => (await mark())?.points_total, { timeout: 20_000 }).toBe(120);
  expect((await mark())?.level_id).toBe(levels[1].id);
  await expect(one.page.locator("#main strong", { hasText: "120" })).toBeVisible();
  await expect(one.page.getByRole("group", { name: "مستوى جديد" })).toContainText("مشارِك نشِط");
  // The animated shots are taken only after the moment has PLAYED — the counter above is above zero.
  await capture(one.page, "completion-animated");
  await captureCard(one.page, "level-animated");

  // ★ A reload: silent, and the occurrence is seen — no delta, one face.
  await one.page.reload();
  await expect(head).toHaveAttribute("data-moment", "static");
  await settled(one.page);
  expect(await animations(one.page)).toBe(0);
  await expect(one.page.locator("#main [data-slot=delta]")).toHaveCount(0);

  // ★ Back and forward by the app's own history: silent.
  await one.page.goto("/ar/app/me");
  await one.page.goBack();
  await expect(one.page).toHaveURL(/\/ar\/app\/me\/points$/);
  await settled(one.page);
  expect(await animations(one.page)).toBe(0);
  await one.context.close();

  // ★★ Another phone, after the first recorded it: silent. The record is the server's, not the browser's.
  const two = await anotherPhone(browser);
  await two.page.goto("/ar/app/me");
  await navigateInApp(two.page, two.page.locator("#main").getByRole("link", { name: "نقاطي", exact: true }).first(), /\/ar\/app\/me\/points$/);
  await expect(two.page.locator("#main strong", { hasText: "120" })).toBeVisible();
  await settled(two.page);
  expect(await animations(two.page)).toBe(0);
  await expect(two.page.locator("#main [data-slot=delta]")).toHaveCount(0);
  await two.context.close();
});

test("moments 3 and 4 — the static state under reduced motion is complete, and is recorded as seen", async ({ browser }) => {
  const { rows: levels } = await db.query<{ id: string }>(`select id from public.levels where org_id = $1 order by sort_order`, [orgId]);
  await db.query(`update public.member_seen_marks set points_total = 0, points_entry_id = null, level_id = $2 where member_id = $1`, [meId, levels[0].id]);

  const calm = await anotherPhone(browser, "reduce");
  await calm.page.goto("/ar/app/me");
  await navigateInApp(calm.page, calm.page.locator("#main").getByRole("link", { name: "نقاطي", exact: true }).first(), /\/ar\/app\/me\/points$/);
  await expect(calm.page.locator("#main strong", { hasText: "120" })).toBeVisible();
  // The new balance, its delta and its words, the flame's line, the bar's line, the new face — and no motion.
  await expect(calm.page.locator("#main [data-slot=delta] bdi[dir=ltr]").first()).toHaveText("+120");
  await expect(calm.page.getByText("120 نقطة جديدة منذ زيارتك الأخيرة")).toBeAttached();
  await expect(calm.page.getByRole("group", { name: "مستوى جديد" })).toContainText("مشارِك نشِط");
  // ★ wave 20 (DEC-218, `SCR-022` rebuilt from `Points.dc.html`): the bar's line is the head's «"<next>" بعد N», beside
  // the level row, not inside the bar's slot — an expectation of copy that moved; the fraction below is unchanged.
  // ★★ The bar and its line state one fraction: «صاحب أثر» بعد 180 is 120 of 300, a 0.4 fill.
  await expect(calm.page.locator("#main #points-head").getByText("«صاحب أثر» بعد 180")).toBeVisible();
  expect(await calm.page.locator("#main [data-slot=level-bar] [data-slot=fill]").evaluate((el) => (el as HTMLElement).style.transform)).toBe("scaleX(0.4)");
  expect(await animations(calm.page)).toBe(0);
  await capture(calm.page, "completion-static");
  await captureCard(calm.page, "level-static");
  // Seen statically is seen.
  await expect.poll(async () => (await mark())?.points_total, { timeout: 15_000 }).toBe(120);
  await calm.context.close();
});

test("moment 5 — the boards: a rise plays once by the app's own navigation, a fall never moves", async ({ browser }) => {
  // The viewer (120) is second on the all-time board; they last saw themselves fourth.
  // The company race: صنف (the viewer's) second, its bar last seen shorter.
  await db.query(`select public.snapshot_leaderboard($1, 'company', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`, [orgId]);
  const { rows: snap } = await db.query<{ period_start: string }>(
    `select period_start::text from public.leaderboard_snapshots where org_id = $1 and kind = 'company' order by taken_at desc limit 1`,
    [orgId],
  );
  await db.query(
    `update public.member_seen_marks set all_time_rank = 4, company_period = $2, company_id = $3, company_rank = 2, company_fraction = 0.2 where member_id = $1`,
    [meId, snap[0].period_start, mine],
  );

  const one = await anotherPhone(browser);
  const board = (id: string) => one.page.locator(`#main #${id} [data-moment]`);

  // Arrive by the app's own navigation: from the monthly tab to the all-time tab.
  await one.page.goto("/ar/app/leaderboards?board=month");
  await navigateInApp(one.page, one.page.getByRole("tab", { name: "كل الأوقات" }), /\/ar\/app\/leaderboards$/);
  await expect.poll(() => animations(one.page)).toBeGreaterThan(0);
  await expect(board("all-time")).toHaveAttribute("data-moment", "static", { timeout: 15_000 });
  const rows = one.page.locator("#main #all-time ul").first().locator(":scope > li");
  await expect(rows.nth(1)).toContainText("ريم الشهري");
  await expect(rows.nth(1).locator("[data-slot=rise]")).toBeVisible();
  await expect(rows.nth(1).locator("img")).toHaveCount(0);
  await expect.poll(async () => (await mark())?.all_time_rank, { timeout: 15_000 }).toBe(2);
  await capture(one.page, "rank-members-animated");

  // The company race: the own bar grows.
  const before = await animations(one.page);
  await navigateInApp(one.page, one.page.getByRole("tab", { name: "سباق الشركات" }), /board=companies$/);
  await expect.poll(() => animations(one.page)).toBeGreaterThan(before);
  await expect(board("company")).toHaveAttribute("data-moment", "static", { timeout: 15_000 });
  await expect(one.page.locator("#main #company li", { hasText: "صنف" })).toContainText("فريقك");
  await expect.poll(async () => Number((await mark())?.company_fraction), { timeout: 15_000 }).toBeGreaterThan(0.2);
  await capture(one.page, "rank-companies-animated");

  // ★ A reload of each: silent.
  await one.page.goto("/ar/app/leaderboards");
  await settled(one.page);
  expect(await animations(one.page)).toBe(0);
  await expect(one.page.locator("#main #all-time [data-slot=rise]")).toHaveCount(0);
  await one.context.close();

  // ★★ A FALL never moves, and draws nothing: the viewer last saw themselves first.
  await db.query(`update public.member_seen_marks set all_time_rank = 1 where member_id = $1`, [meId]);
  const fell = await anotherPhone(browser);
  await fell.page.goto("/ar/app/leaderboards?board=month");
  await navigateInApp(fell.page, fell.page.getByRole("tab", { name: "كل الأوقات" }), /\/ar\/app\/leaderboards$/);
  await expect(fell.page.locator("#main #all-time ul").first().locator(":scope > li").nth(1)).toContainText("ريم الشهري");
  await expect.poll(async () => (await mark())?.all_time_rank, { timeout: 15_000 }).toBe(2);
  await settled(fell.page);
  expect(await animations(fell.page)).toBe(0);
  await expect(fell.page.locator("#main #all-time [data-slot=rise]")).toHaveCount(0);
  await fell.context.close();

  // ★★ The static state under reduced motion: the new order, the arrow shown; nothing moves.
  await db.query(`update public.member_seen_marks set all_time_rank = 4, company_rank = 2, company_fraction = 0.2 where member_id = $1`, [meId]);
  const calm = await anotherPhone(browser, "reduce");
  await calm.page.goto("/ar/app/leaderboards?board=month");
  await navigateInApp(calm.page, calm.page.getByRole("tab", { name: "كل الأوقات" }), /\/ar\/app\/leaderboards$/);
  const calmRows = calm.page.locator("#main #all-time ul").first().locator(":scope > li");
  await expect(calmRows.nth(1).locator("[data-slot=rise]")).toBeVisible();
  expect(await animations(calm.page)).toBe(0);
  await capture(calm.page, "rank-members-static");
  await navigateInApp(calm.page, calm.page.getByRole("tab", { name: "سباق الشركات" }), /board=companies$/);
  await expect(calm.page.locator("#main #company li", { hasText: "صنف" })).toContainText("فريقك");
  expect(await animations(calm.page)).toBe(0);
  await capture(calm.page, "rank-companies-static");
  await calm.context.close();
});
