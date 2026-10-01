// Wave 20 — SCR-022, my points, rebuilt from `Points.dc.html` and `HubDesktop.dc.html` (REQ-UIX-072, REQ-PTS-003,
// DEC-216 §5.5, §5.9, DEC-218 §3.1). scoring's spec; the lead runs it on a production build.
//
// Seeded through the REAL pipeline — `award_points()`, `adjust_points_manually()`, `remove_check_in()` — never a
// hand-written ledger row, so the screen is proven against the shapes the database produces:
//   · ★ the reversal pair is ONE row on the phone (the fixed reason, a Western minus, the reversed row struck) and
//     two rows on the desktop table with «(يلغي سطر …)»;
//   · ★ the comment cap is explained in place as `0` — and NO ledger row holds it;
//   · a manual adjustment shows its reason and the admin's name;
//   · the filtered-empty state offers to clear the filter;
//   · the head shows the balance as the page's one `<strong>`.
// Captures: `.qa-shots/rtl/wave20-scoring-022-<state>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
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
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";
let attendedId = "";
let attendedTitle = "";
let commentedId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w20-points-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة نقاطي', $1, 'WP', gen_random_uuid()) returning id`,
    [`w20-points-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // A comment cap small enough to reach, and no cooldown, so three comments in a row are judged by the cap alone.
  await db.query(`update public.scoring_rules set cap_per_session = 2, cooldown = null where org_id = $1 and action_key = 'comment'`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);
  const session = async (title: string) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
       values ($1, $2, 'ملخص', $3, 'introductory', now() - interval '3 hours', 60, now() - interval '2 hours', $4, 40, 'completed', now() - interval '1 day', now() - interval '2 hours')
       returning id`,
      [orgId, title, cat[0].id, venue[0].id],
    );
    return rows[0].id;
  };
  attendedTitle = `ورشة الإضاءة ${tag}`;
  attendedId = await session(attendedTitle);
  commentedId = await session(`الأرقام التي تكذب ${tag}`);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان الاختبار" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return { memberId, client };
}

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(SHOTS, `wave20-scoring-022-${state}-${width < 1024 ? 390 : 1280}.png`), fullPage: true });
}

const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("★ empty: the empty state names its next action, and the catalogue still says what earns points", async ({ context, page }) => {
  if (!desktop(page)) await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me/points");
  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toHaveText("نقاطي");
  await expect(page.locator("#main").getByText("لا نقاط بعد", { exact: false }).first()).toBeVisible();
  await expect(page.locator("#main #catalogue")).toBeVisible();
  await capture(page, "empty");
});

test("★★ every point explained: the reversal pair, the cap as 0, the manual adjustment with its admin", async ({ context, page }) => {
  if (!desktop(page)) await page.setViewportSize(PHONE);
  const { memberId, client } = await signIn(context);

  // An attendance award, then its removal — the real reversal (REQ-CHK-017).
  const { rows: ci } = await db.query<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $3, 'empty'::tstzrange) returning id`,
    [orgId, attendedId, memberId],
  );
  await db.query(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [memberId, ci[0].id, attendedId]);
  const { error: removeError } = await client.rpc("remove_check_in", { p_session: attendedId, p_member: memberId, p_reason: "نص المشرف الحر لا يظهر" });
  if (removeError) throw removeError;

  // Three comments on one session, each through award_points(): the third finds the cap full and writes nothing.
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await db.query<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق') returning id`, [orgId, commentedId, memberId]);
    await db.query(`select public.award_points('comment', $1, 'comment', $2, $3)`, [memberId, rows[0].id, commentedId]);
  }
  const { rows: commentRows } = await db.query<{ n: number }>(`select count(*)::int as n from public.points_ledger where member_id = $1 and rule_key = 'comment'`, [memberId]);
  expect(commentRows[0].n, "★ the cap writes no ledger row").toBe(2);

  const { error: adjustError } = await client.rpc("adjust_points_manually", { p_member: memberId, p_amount: 7, p_reason: "تنظيم القاعة" });
  if (adjustError) throw adjustError;

  await page.goto("/ar/app/me/points");
  await expect(page.locator("#main #points-head strong")).toHaveText(/^\d/);

  if (!desktop(page)) {
    const history = page.locator("#main #history");
    const pair = history.locator("li[data-kind=reversal]");
    await expect(pair).toHaveCount(1);
    await expect(pair).toContainText("إلغاء نقاط سابقة");
    await expect(pair).toContainText("أُلغي تسجيل الحضور");
    await expect(pair).not.toContainText("نص المشرف الحر");
    await expect(pair.locator("[data-slot=figure] bdi[dir=ltr]").first()).toHaveText("−20");
    await expect(pair.locator("[data-slot=reversed]")).toContainText("تسجيل حضور مؤكَّد");
    await expect(pair.getByRole("link", { name: attendedTitle })).toHaveAttribute("href", `/ar/app/sessions/${attendedId}`);

    const cap = history.locator("li[data-kind=cap]");
    await expect(cap).toHaveCount(1);
    await expect(cap).toContainText("الحد: تعليقان لكل جلسة");
    await expect(cap.locator("[data-slot=figure] bdi")).toHaveText("0");

    const manual = history.locator("li", { hasText: "تعديل يدوي من الإدارة" });
    await expect(manual).toContainText("«تنظيم القاعة» — يمان الاختبار");
    await expect(history).not.toContainText(/[٠-٩]/);
  } else {
    const table = page.locator("#main #history-table");
    await expect(table).toContainText("يلغي سطر");
    await expect(table.locator(".line-through", { hasText: "تسجيل حضور مؤكَّد" })).toBeVisible();
    await expect(table).toContainText("الحد: تعليقان لكل جلسة");
  }
  await capture(page, "ledger");
});

test("★ filtered empty offers to clear the filter; a filter is a shareable URL", async ({ context, page }) => {
  if (!desktop(page)) await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me/points?month=2020-01");
  await expect(page.locator("#main").getByText("لا سطور في هذه التصفية")).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: "مسح التصفية" }).first()).toHaveAttribute("href", "/ar/app/me/points");
  await capture(page, "filtered-empty");
});
