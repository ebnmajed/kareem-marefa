// Wave 16 — moment 2, تسجيل الحضور, on the real SCR-014 (REQ-UIX-046, REQ-UIX-044,
// DEC-195 §2.1, DEC-197 §1), against real local Supabase.
//
// ★★ A moment cannot be verified in a gallery (DEC-195 §1): it is defined by WHEN
// it fires. So this walks the real action, the real return, the real back button
// and the real reload, and counts confetti layers with an init script that
// watches the whole document from before the first paint:
//   1. a live code → the moment plays (a layer appears), rests, and returns to the
//      event page 1.4 s after the lines are in — where no check-in link is offered;
//   2. ★ back → the check-in screen's static state, and NO layer;
//   3. ★ reload → the static state, and NO layer;
//   4. ★ a wrong code → an error, NO layer and no running animation;
//   5. ★ reduced motion → the complete static state, NO layer, and the same return;
//   6. ★ no JavaScript → the no-JS action still checks in, to `?success=1`, static.
//      `test.fixme` — F3: /app streams behind loading.tsx; without JS the content
//      never swaps in (STATUS F3). Not this screen's defect; kept as F3's test.
//
// Captures (phone, 390 × 844, honouring E2E_SHOTS_DIR):
//   wave16-checkin-check-in-animated.png — the moment at its rest
//   wave16-checkin-check-in-static.png   — the same, under reduced motion
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
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w16-checkin-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة لحظة الحضور', $1, 'WM', gen_random_uuid()) returning id`,
    [`w16-checkin-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // A team colour, so the burst carries it (DEC-195 §6.22).
  await db.query(`insert into public.companies (org_id, name, team_color) values ($1, 'شركة الاختبار', '#35d0ff')`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);
  // Live now, walk-ins allowed: any member of the org may check in with the room's code.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة لحظة الحضور', 'ملخص', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs in a fresh member (or staff), provisions through the real RPC, installs the cookies. */
async function signIn(context: BrowserContext, who: string, asAdmin = false): Promise<void> {
  const email = `${who}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `عضو ${who}` } });
  if (error && !/already/i.test(error.message)) throw error;
  if (data?.user) users.push(data.user.id);
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set company_id = (select id from public.companies where org_id = $2 limit 1) where id = $1`, [memberId, orgId]);
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function liveCode(context: BrowserContext, page: Page): Promise<string> {
  await signIn(context, "host", true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  const code = (await page.locator("#main p[dir='ltr']").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  return code;
}

/** Counts every confetti layer ever attached to the document, from before the first paint. */
async function countLayers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __layers: number };
    w.__layers = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.hasAttribute("data-confetti")) w.__layers += 1;
    }).observe(document, { childList: true, subtree: true });
  });
}
const layers = (page: Page) => page.evaluate(() => (window as unknown as { __layers: number }).__layers);

async function typeCode(page: Page, code: string) {
  const main = page.locator("#main");
  const boxes = main.locator("input[maxlength='1']");
  const assembled = main.locator('input[type="hidden"][name="code"]');
  // The boxes are a controlled client component: refill until the hidden field holds the code (hydrated).
  await expect(async () => {
    for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(code, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await main.getByRole("button", { name: "تسجيل الحضور" }).last().click();
}

async function shoot(page: Page, name: string) {
  if (test.info().project.name !== "phone") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

const moment = (page: Page) => page.locator("#main [data-moment='check-in']");
const eventUrl = () => new RegExp(`/ar/app/sessions/${sessionId}$`);

test("★ the moment plays from the check-in's own result, rests, and returns — and never again", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await countLayers(page);
  const code = await liveCode(context, page);
  await signIn(context, "sara");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await typeCode(page, code);

  // 1 — it plays, from the action's result: a layer, the three lines, and then it rests.
  await expect(moment(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#main").getByRole("status")).toContainText("أنت هنا!");
  await expect.poll(() => layers(page)).toBeGreaterThan(0);
  await expect(moment(page)).toHaveAttribute("data-phase", "static", { timeout: 5_000 });
  await expect(page.locator("#main [data-confetti]")).toHaveCount(0);
  await shoot(page, "wave16-checkin-check-in-animated");
  // No horizontal scroll at 390 px, during or after the burst.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // DEC-197 §1: 1.4 s after the lines are in, the event page — which offers no check-in link now (K3).
  await expect(page).toHaveURL(eventUrl(), { timeout: 15_000 });
  await expect(page.locator("#main").getByRole("link", { name: "تسجيل الحضور" })).toHaveCount(0);

  // 2 — ★ back: the check-in screen's static state, and no layer.
  await page.evaluate(() => ((window as unknown as { __layers: number }).__layers = 0));
  await page.goBack();
  await expect(moment(page)).toHaveAttribute("data-phase", "static");
  await expect(page.locator("#main input[maxlength='1']")).toHaveCount(0);
  await page.waitForTimeout(2_500); // longer than the whole sequence and its hold
  expect(await layers(page)).toBe(0);
  await expect(page).toHaveURL(/\/check-in$/); // a static state never returns on its own

  // 3 — ★ reload: the same, and no layer.
  await page.reload();
  await expect(moment(page)).toHaveAttribute("data-phase", "static");
  await page.waitForTimeout(2_500);
  expect(await layers(page)).toBe(0);
  await expect(page.locator("#main").getByRole("status")).toHaveCount(0);
  await expect(page).toHaveURL(/\/check-in$/);
});

test("★ a wrong code animates nothing — not the boxes, not the screen", async ({ context, page }) => {
  await countLayers(page);
  await signIn(context, "omar");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await typeCode(page, "ZZZZZZ");
  await expect(page).toHaveURL(/error=invalid_code&code=ZZZZZZ$/, { timeout: 15_000 });
  await expect(page.locator("#main").getByRole("alert").filter({ hasText: "الرمز غير صحيح" })).toBeVisible();
  expect(await layers(page)).toBe(0);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.("#main")).length);
  expect(running).toBe(0);
  await expect(moment(page)).toHaveCount(0);
});

test("★ reduced motion: the complete static state, no particle, and the same hold and return", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countLayers(page);
  const code = await liveCode(context, page);
  await signIn(context, "layla");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await typeCode(page, code);
  await expect(moment(page)).toHaveAttribute("data-phase", "static", { timeout: 15_000 });
  const status = page.locator("#main").getByRole("status");
  await expect(status).toContainText("أنت هنا!");
  await expect(status).toContainText("حضورك مسجَّل");
  await expect(page.locator("#main").getByRole("link", { name: "إلى صفحة الجلسة" })).toBeVisible();
  expect(await layers(page)).toBe(0);
  await shoot(page, "wave16-checkin-check-in-static");
  await expect(page).toHaveURL(eventUrl(), { timeout: 15_000 });
});

// Kept, not deleted: it becomes F3's test once `/app` renders without JS (the lead's ruling, gate run 2).
test("★ without JavaScript the no-JS action still checks in, to ?success=1, and the screen is static", async ({ browser }) => {
  test.fixme(true, "F3: /app streams behind loading.tsx; without JS the content never swaps in (STATUS F3)");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const code = await liveCode(context, page);
    await signIn(context, "noor");
    // Without JS the boxes cannot assemble the hidden field, so the code arrives as a refused
    // submission's carry-back would bring it (`?code=`): the SSR'd hidden field holds it.
    await page.goto(`/ar/app/sessions/${sessionId}/check-in?error=invalid_code&code=${code}`);
    await expect(page.locator('#main input[type="hidden"][name="code"]')).toHaveValue(code);
    await page.locator("#main").getByRole("button", { name: "تسجيل الحضور" }).last().click();
    await expect(page).toHaveURL(/\/check-in\?success=1$/, { timeout: 15_000 });
    await expect(moment(page)).toHaveAttribute("data-phase", "static");
    await expect(page.locator("#main").getByRole("status")).toContainText("أنت هنا!");
  } finally {
    await context.close();
  }
});
