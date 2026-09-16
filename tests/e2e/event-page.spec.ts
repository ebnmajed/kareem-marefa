// SCR-012 · the event page, rebuilt in wave 6 — REQ-SES-013, REQ-UIX-004,
// REQ-UIX-015, REQ-UIX-017, `16` §5.4.2, §6.1 note 2, §6.3, DEC-130.
//
// What this proves against the real page, on both projects:
//   · the two-state action card is a SERVER render: reserve, reload, and the
//     card is the after state — «أضِف إلى تقويمك» where «احجز مقعدك» was;
//   · exactly ONE primary per width, inside the region «الحضور» — in the card
//     from `md`, in the bottom action bar below it — and never two fixed
//     bottom bars;
//   · an ended session offers no register control anywhere (ask 4);
//   · nothing fixed or sticky covers the focused element, tabbing the whole
//     page (SC 2.4.11), and a sub-nav jump lands below the sticky layers.
//
// The 390 px RTL captures for the definition of done are taken on the phone
// project only, LAST in their test: `fullPage` scrolls the document to stitch
// the image, which moves every fixed layer.
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
// `E2E_SHOTS_DIR` lets a look-only run against a dev server keep its pictures
// out of the directory the review reads.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

// These pages stream several server reads after a navigation or a server
// action, and the gate runs them while other suites share one local Supabase.
// Five seconds measured the machine, not the page.
const expect = baseExpect.configure({ timeout: 15_000 });

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
const users: string[] = [];
let email = "";
let memberId = "";
let openSessionId = "";
let endedSessionId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // Desktop and phone workers share one database: tag by worker AND time.
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `event-e2e-${tag}.example`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة صفحة الجلسة', $1, 'EV', gen_random_uuid()) returning id`,
    [`event-e2e-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address) values ($1, 'القاعة الكبرى', 'المبنى أ، الدور الثاني') returning id`,
    [orgId],
  );
  const { rows: company } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'الشركة الأولى') returning id`, [orgId]);

  // A presenter with a real profile: job title, company, bio as written.
  const presenter = await admin.auth.admin.createUser({ email: `presenter@${domain}`, password: PASSWORD, email_confirm: true });
  if (presenter.error) throw presenter.error;
  users.push(presenter.data.user.id);
  const { rows: presenterRow } = await db.query<{ id: string }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, job_title, bio, company_id)
     values ($1, $2, $3, 'سعد الحربي', 'مدير التخطيط', 'قدّم جلسات في التخطيط والتقارير.', $4) returning id`,
    [orgId, presenter.data.user.id, `presenter@${domain}`, company[0].id],
  );

  const { rows: open } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id, published_at)
     values ($1, 'كيف اختصرنا وقت التقارير الشهرية', 'قضينا سنة كاملة نُخرج تقرير الأداء الشهري يدويًا.', $2, 'introductory', 'ar', 'published',
             now() + interval '5 days', 60, now() + interval '5 days 1 hour', 60, $3, now() - interval '1 day')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  openSessionId = open[0].id;

  const { rows: ended } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id, published_at, completed_at)
     values ($1, 'مقدمة في قراءة الميزانية', 'جلسة انتهت.', $2, 'introductory', 'ar', 'completed',
             now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour', 30, $3, now() - interval '9 days', now() - interval '2 days')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  endedSessionId = ended[0].id;

  for (const sessionId of [openSessionId, endedSessionId]) {
    await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterRow[0].id]);
  }
  const { rows: tagRows } = await db.query<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'تقارير', 'تقارير') returning id`, [orgId]);
  await db.query(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [orgId, openSessionId, tagRows[0].id]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
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

async function capture(page: Page, name: string) {
  // Every streamed section has arrived: a capture of a Suspense fallback is a
  // capture of nothing.
  await page.waitForLoadState("networkidle");
  mkdirSync(SHOTS, { recursive: true });
  // The whole page, for the review of every section — where `fullPage`
  // stitching paints the fixed action bar mid-page, over whatever was on screen
  // when it was taken…
  await page.screenshot({ path: join(SHOTS, `wave6-sessions-${name}.png`), fullPage: true });
  // …and the first screen exactly as a phone shows it, bar at the bottom.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: join(SHOTS, `wave6-sessions-${name}-viewport.png`) });
}

/** Fixed or sticky elements, visible, anchored to the bottom edge of the viewport. */
async function fixedBottomBars(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") return false;
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) return false;
      return Math.abs(r.bottom - window.innerHeight) < 2;
    }).length,
  );
}

test("before reserving: one primary «احجز مقعدك», no calendar, the hero and the facts above the action", async ({ context, page }, testInfo) => {
  await signIn(context);
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/ar/app/sessions/${openSessionId}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("كيف اختصرنا وقت التقارير الشهرية");
  await expect(page.getByText("التسجيل مفتوح").first()).toBeVisible();
  // REQ-SES-011: the language is on the page, above the action.
  await expect(page.getByText("العربية").first()).toBeVisible();

  const region = page.getByRole("region", { name: "الحضور" });
  // Exactly one visible primary at this width, and it is in the region.
  await expect(page.getByRole("button", { name: "احجز مقعدك" })).toHaveCount(1);
  await expect(region.getByRole("button", { name: "احجز مقعدك" })).toBeVisible();
  // Commitment before convenience (§5.4): no calendar before a seat.
  await expect(page.getByRole("button", { name: "أضِف إلى تقويمك" })).toHaveCount(0);

  // The presenter, as they wrote themselves — and no rating anywhere (§25 Q5).
  await expect(page.getByRole("region", { name: "المُقدِّم" }).getByText("مدير التخطيط · الشركة الأولى")).toBeVisible();
  await expect(page.getByText(/تقييم \d/)).toHaveCount(0);

  // A tag links to the filtered timeline.
  await expect(page.getByRole("link", { name: "تقارير" })).toHaveAttribute("href", /\/ar\/app\/sessions\?tag=/);

  expect(await fixedBottomBars(page), "at most one fixed bottom bar").toBeLessThanOrEqual(1);

  if (testInfo.project.name === "phone") {
    // The primary is reachable in the first screen, at every scroll position.
    const reserve = region.getByRole("button", { name: "احجز مقعدك" });
    const box = await reserve.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await capture(page, "event-before");
  }
});

test("★ after reserving: the same card, re-rendered — «أضِف إلى تقويمك» where «احجز مقعدك» was, and it survives a reload", async ({ context, page }, testInfo) => {
  memberId = await signIn(context);
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  // Each project reserves once; clear any seat from the other worker's run.
  await db.query(`delete from public.rsvps where session_id = $1 and member_id = $2`, [openSessionId, memberId]);

  await page.goto(`/ar/app/sessions/${openSessionId}`);
  // Hydrated first: a press before React owns the form is a race the member
  // never runs, and not what this test is about.
  await page.waitForLoadState("networkidle");
  await page.getByRole("region", { name: "الحضور" }).getByRole("button", { name: "احجز مقعدك" }).click();
  await expect(page.getByText("تم تأكيد حجزك")).toBeVisible();

  await page.reload();
  const region = page.getByRole("region", { name: "الحضور" });
  await expect(region.getByText("تم تأكيد حجزك")).toBeVisible();
  await expect(region.getByRole("button", { name: "أضِف إلى تقويمك" })).toBeVisible();
  await expect(page.getByRole("button", { name: "أضِف إلى تقويمك" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "احجز مقعدك" })).toHaveCount(0);
  await expect(region.getByRole("button", { name: "إلغاء الحجز" })).toBeVisible();

  // The providers are behind the one button.
  await region.getByRole("button", { name: "أضِف إلى تقويمك" }).click();
  await expect(page.getByRole("menuitem", { name: "تقويم Google" })).toBeVisible();
  await page.keyboard.press("Escape");

  if (testInfo.project.name === "phone") await capture(page, "event-after");
  await db.query(`delete from public.rsvps where session_id = $1 and member_id = $2`, [openSessionId, memberId]);
});

test("★ an ended session: the ribbon, «حضرت», «قيّم الجلسة» — and no register control anywhere (ask 4)", async ({ context, page }, testInfo) => {
  memberId = await signIn(context);
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  await db.query(`delete from public.check_ins where session_id = $1 and member_id = $2`, [endedSessionId, memberId]);
  await db.query(`delete from public.rsvps where session_id = $1 and member_id = $2`, [endedSessionId, memberId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, endedSessionId, memberId]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار آلي', $3, tstzrange(now() - interval '3 days', now() - interval '2 days'))`,
    [orgId, endedSessionId, memberId],
  );

  await page.goto(`/ar/app/sessions/${endedSessionId}`);
  await expect(page.getByText(/انتهت هذه الجلسة يوم/)).toBeVisible();
  const region = page.getByRole("region", { name: "الحضور" });
  await expect(region.getByText("حضرت")).toBeVisible();
  await expect(region.getByRole("link", { name: "قيّم الجلسة" })).toBeVisible();
  // One call to rate on the page, once everything has streamed: while the card
  // carries it, the rating section does not repeat it.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "قيّم الجلسة" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "التقييم" })).toHaveCount(0);
  for (const name of ["احجز مقعدك", "إلغاء الحجز", "غادر قائمة الانتظار", "أضِف إلى تقويمك"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  if (testInfo.project.name === "phone") await capture(page, "event-ended");
});

test("★ nothing fixed or sticky covers the focused element, tabbing the whole page (SC 2.4.11)", async ({ context, page }, testInfo) => {
  await signIn(context);
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  else await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/ar/app/sessions/${openSessionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const obscured: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    // Let the browser's focus scroll finish (it animates under smooth
    // scrolling) and the page's own clearance run after it.
    await page.waitForTimeout(500);
    const hit = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused || focused === document.body) return null;
      const f = focused.getBoundingClientRect();
      if (f.width === 0 || f.height === 0) return null;
      for (const el of document.querySelectorAll("body *")) {
        const s = getComputedStyle(el);
        if (s.position !== "fixed" && s.position !== "sticky") continue;
        if (s.display === "none" || s.visibility === "hidden") continue;
        // A control inside the layer is not covered by it.
        if (el.contains(focused)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const left = Math.max(f.left, r.left);
        const right = Math.min(f.right, r.right);
        const top = Math.max(f.top, r.top);
        const bottom = Math.min(f.bottom, r.bottom);
        if (left >= right || top >= bottom) continue;
        // Overlapping boxes are not enough: the layer must PAINT over the
        // control where they meet. The skip link overlaps the header and sits
        // above it.
        const painted = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (painted && el.contains(painted) && !focused.contains(painted)) {
          return `${focused.tagName} «${(focused.textContent ?? "").trim().slice(0, 30)}» under ${el.tagName}.${(el.className?.toString() ?? "").slice(0, 40)}`;
        }
      }
      return null;
    });
    if (hit) obscured.push(hit);
  }
  expect(obscured).toEqual([]);
});

test("a sub-nav jump lands its section below the sticky layers, not behind them", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "the sub-nav is sticky on desktop only");
  await signIn(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/ar/app/sessions/${openSessionId}`);

  const nav = page.getByRole("navigation", { name: "أقسام الجلسة" });
  await nav.getByRole("link", { name: "المُقدِّمون" }).click();
  await expect(page).toHaveURL(/#presenters$/);
  const heading = page.getByRole("heading", { level: 2, name: "المُقدِّم" });
  const box = await heading.boundingBox();
  const navBox = await nav.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);
});
