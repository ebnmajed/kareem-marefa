// The three member-facing surfaces that show a session's days — `REQ-SES-015`,
// `REQ-UIX-003`, `REQ-DSC-004`, DEC-119, DEC-150 contracts 1, 3 and 9.
//
// What this proves against the real pages:
//   · ★ BETWEEN TWO DAYS A SESSION IS `open`, NOT `live` (contract 9). The
//     session below has one day behind it and two ahead, so a reader of the
//     stored window alone would say «جارية» — and a member would walk to an
//     empty room. The event page passes the days, so it does not;
//   · the event page's «الموعد» row lists the days, each with contract 7's
//     label and its own clock;
//   · a timeline card and the public card say a RANGE and «3 أيام», and the
//     range is the session's own stored window, not a fold over days.
//
// Captures, phone project, 390 × 844:
//   wave9-sessions-event-three-days.png   between day one and day two
//   wave9-sessions-card-range.png         the timeline card
//   wave9-sessions-public-card-range.png  the shared link
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let sessionId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one walk, on the touch project the captures come from");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave9-views-${tag}.example`;
  const adminEmail = `boss@${domain}`;
  memberEmail = `reem@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الورش', $1, 'WV', gen_random_uuid(), $2) returning id`,
    [`wave9-views-${tag}`, adminEmail],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تحليل البيانات') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ', 40) returning id`,
    [orgId],
  );

  const ids: Record<string, string> = {};
  for (const [email, name] of [[adminEmail, "سعد الحربي"], [memberEmail, "ريم العتيبي"]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;
    const { data: envelope, error: rpcError } = await client.rpc("provision_member");
    if (rpcError) throw rpcError;
    ids[email] = (envelope as { member_id: string }).member_id;
  }
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [ids[adminEmail]]);

  // ★ ONE DAY BEHIND, TWO AHEAD. A reader of the session's stored window alone
  // sees a start that has passed and an end that has not, and says «جارية».
  const now = Date.now();
  const days = [
    { starts_at: new Date(now - DAY - 2 * HOUR).toISOString(), ends_at: new Date(now - DAY).toISOString() },
    { starts_at: new Date(now + DAY).toISOString(), ends_at: new Date(now + DAY + 2 * HOUR).toISOString() },
    { starts_at: new Date(now + 2 * DAY).toISOString(), ends_at: new Date(now + 2 * DAY + 2 * HOUR).toISOString() },
  ];

  // ★ BORN PUBLISHED, CARRYING DAY ONE'S WINDOW — not updated into it.
  // `sessions_guard_transition` (0024) accepts only `02` §6.2's edges for EVERY
  // writer, the owner included, so `draft → published` is refused with
  // `illegal_session_transition`; a row is born with its state instead (the
  // pattern `checkin.spec.ts` uses). `0100`'s trigger A then creates day ONE
  // from this window, which is why the window here is day one's and not the
  // span: the two days below extend it, and trigger B re-derives `ends_at`.
  const { rows: session } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level,
                                  starts_at, ends_at, duration_minutes, venue_id, capacity, state, published_at)
     values ($1, 'ورشة تحليل البيانات على ثلاث أمسيات', 'ثلاث جلسات عملية متتابعة.', $2, 'introductory',
             $3, $4, 120, $5, 40, 'published', now() - interval '1 hour')
     returning id`,
    [orgId, cat[0].id, days[0].starts_at, days[0].ends_at, venue[0].id],
  );
  sessionId = session[0].id;

  for (const day of days.slice(1)) {
    await db.query(
      `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
       values ($1, $2, $3, $4, $5)`,
      [orgId, sessionId, day.starts_at, day.ends_at, venue[0].id],
    );
  }

  // The fixture asserts its own premise: three days, and a session window that
  // is their stored shadow (contract 1). A capture of the wrong row proves
  // nothing, and this is the one place the shape could silently drift.
  const { rows: check } = await db.query<{ n: string; starts_at: Date; ends_at: Date }>(
    `select (select count(*) from public.session_days d where d.session_id = s.id) as n, s.starts_at, s.ends_at
       from public.sessions s where s.id = $1`,
    [sessionId],
  );
  if (Number(check[0].n) !== 3) throw new Error(`fixture: expected 3 days, got ${check[0].n}`);
  if (check[0].starts_at.toISOString() !== days[0].starts_at) throw new Error("fixture: the session's start is not day one's");
  if (check[0].ends_at.toISOString() !== days[2].ends_at) throw new Error("fixture: the session's end is not the last day's");
});

test.afterAll(async () => {
  if (!db) return;
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, `${name} scrolls sideways at 390 px`).toBe(false);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave9-sessions-${name}.png`), fullPage: true });
}

test("★ the event page lists the days, and reads `open` between two of them", async ({ context, page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // ★ CONTRACT 9. Day one is behind us and day two is tomorrow, so the session
  // is OPEN — «جارية» here would send a member to an empty room.
  await expect(page.getByText("جارية")).toHaveCount(0);

  // ★ CONTRACT 7's label, on the page the member reads. Each day carries its
  // own clock; the ordinal is a word and the weekday is the room's.
  await expect(page.getByText(/^اليوم الأول · /)).toBeVisible();
  await expect(page.getByText(/^اليوم الثاني · /)).toBeVisible();
  await expect(page.getByText(/^اليوم الثالث · /)).toBeVisible();

  // ★ THE HERO CHIP SAYS THE COMMITMENT, NOT DAY ONE'S LENGTH. The column
  // `duration_minutes` is 120 and rightly stays day one's; a chip reading «120
  // دقيقة» beside a three-evening range says the workshop takes two hours
  // (DEC-151 ruling 4). Found in a capture, not in an assertion — so here is
  // the assertion.
  await expect(page.getByText("3 أيام")).toBeVisible();
  await expect(page.getByText("120 دقيقة")).toHaveCount(0);
  await capture(page, "event-three-days");
});

test("★ a timeline card says a range and how many days", async ({ context, page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);

  const card = page.getByRole("link", { name: /ورشة تحليل البيانات/ }).first();
  await expect(card).toBeVisible();
  // «3 أيام» beside the span: a range alone does not say whether a member is
  // committing to two evenings or to a week. Western digits (DEC-124).
  await expect(card.getByText("3 أيام")).toBeVisible();
  await expect(card.getByText(/[٠-٩]/)).toHaveCount(0);
  await capture(page, "card-range");
});

test("★ the public card says the range, without reading a single day row", async ({ page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  // No sign-in: this page answers `anon`, which is exactly why the count comes
  // from `session_public_card()` and not from `session_days`.
  await page.goto(`/ar/s/${sessionId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("ورشة تحليل البيانات على ثلاث أمسيات")).toBeVisible();
  await expect(page.getByText("3 أيام")).toBeVisible();
  await capture(page, "public-card-range");
});
