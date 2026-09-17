// SCR-043 · the day set on the scheduling form — `REQ-SES-015`, `REQ-SES-016`,
// `REQ-SES-017`, DEC-119, DEC-121, DEC-150, DEC-151.
//
// What this proves against the real page, which no unit test can:
//   · ★ ONE DAY COSTS NOTHING — the form an admin meets is wave 8's, field for
//     field, with one switch added at the end of «متى». The capture is taken to
//     be read BESIDE `wave8-lead-schedule-ready.png`;
//   · «جلسة متعدّدة الأيام» opens a list where a third evening is one tap;
//   · an overlap is said AT THE FIELD, on the picker's commit, not on submit;
//   · removing a day ASKS, and names the day it would remove (DEC-121);
//   · one press publishes a three-day workshop, and the database holds three
//     days whose positions are the chronological rank `0100` derives.
//
// Captures, phone project, 390 × 844:
//   wave9-sessions-schedule-one-day.png     beside wave 8's `ready`
//   wave9-sessions-schedule-three-days.png  the list, three evenings
//   wave9-sessions-schedule-overlap.png     refused at the field
//   wave9-sessions-schedule-remove-day.png  the confirm, naming the day
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

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let sessionId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one walk, on the touch project the captures come from");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave9-days-${tag}.example`;
  adminEmail = `boss@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الورش', $1, 'WS', gen_random_uuid(), $2) returning id`,
    [`wave9-days-${tag}`, adminEmail],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تحليل البيانات') returning id`, [orgId]);
  await db.query(`insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ، الدور الثاني', 40)`, [orgId]);

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "سعد الحربي" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);

  const { rows: proposal } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, target_audience, expected_duration_minutes, state)
     values ($1, $2, 'ورشة تحليل البيانات على ثلاث أمسيات', 'ثلاث جلسات عملية متتابعة، كل واحدة تبني على التي قبلها.', $3, 'introductory', 'من يُعدّ تقارير دورية', 120, 'approved')
     returning id`,
    [orgId, memberId, cat[0].id],
  );
  const { rows: session } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level)
     values ($1, $2, 'ورشة تحليل البيانات على ثلاث أمسيات', 'ثلاث جلسات عملية متتابعة، كل واحدة تبني على التي قبلها.', $3, 'introductory')
     returning id`,
    [orgId, proposal[0].id, cat[0].id],
  );
  sessionId = session[0].id;
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
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

/**
 * Pick a day number in the picker whose accessible name matches `name`.
 *
 * The trigger and its dialog carry the SAME name — `ui/date-time` names each by
 * its own field («آخر موعد للحجز: …», «اليوم الثاني · الخميس: بداية اليوم»),
 * which is what stops four pickers on one form being four «التاريخ والوقت»s to
 * a screen reader.
 */
async function pick(page: Page, name: RegExp, day: string, opts: { hour?: string; nextMonth?: boolean } = {}) {
  await page.getByRole("button", { name }).click();
  const picker = page.getByRole("dialog", { name });
  if (opts.nextMonth) await picker.getByRole("button", { name: "الشهر التالي" }).click();
  await picker.getByRole("button", { name: new RegExp(`^${day} `) }).and(page.locator(":enabled")).first().click();
  if (opts.hour) {
    await picker.getByLabel("الساعة").selectOption(opts.hour);
    await picker.getByLabel("الدقيقة").selectOption("0");
  }
  await picker.getByRole("button", { name: "تم", exact: true }).click();
}

test("★ REQ-SES-016: one day costs nothing, and three evenings are three taps", async ({ context, page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // ── The form an admin meets — wave 8's, plus one switch ──────────────────
  // ★ Read this capture BESIDE `wave8-lead-schedule-ready.png`: the same
  // fields, in the same order, with the same strings.
  await expect(page.getByLabel("المدة بالدقائق")).toHaveValue("120");   // REQ-PRO-009
  const affordance = page.getByRole("switch", { name: "جلسة متعدّدة الأيام" });
  await expect(affordance).not.toBeChecked();
  // Nothing about days is on the page until it is asked for.
  await expect(page.getByRole("button", { name: "أضف يومًا" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم/ })).toHaveCount(0);

  await pick(page, /^التاريخ والوقت: /, "10", { hour: "18", nextMonth: true });
  const venue = page.getByLabel("المكان", { exact: true });
  await venue.selectOption((await venue.locator("option", { hasText: "القاعة الكبرى" }).getAttribute("value"))!);
  await expect(page.getByLabel("السعة")).toHaveValue("40");
  await capture(page, "schedule-one-day");

  // ── «جلسة متعدّدة الأيام» ─────────────────────────────────────────────────
  await affordance.click();
  await expect(affordance).toBeChecked();
  // ★ REQ-SES-017's control appears WITH the affordance and not before.
  await expect(page.getByRole("switch", { name: "النقاط والشهادة بعد حضور كل الأيام" })).toBeChecked();

  // ★ ONE TAP A DAY: each added day takes the previous day's clock and place,
  // on the next date, so nothing is typed for the second or the third.
  await page.getByRole("button", { name: "أضف يومًا" }).click();
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم الثاني · / })).toBeVisible();
  await page.getByRole("button", { name: "أضف يومًا" }).click();
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم الثالث · / })).toBeVisible();
  await expect(page.getByText(/^نفس مكان اليوم السابق: القاعة الكبرى/).first()).toBeVisible();
  await capture(page, "schedule-three-days");

  // ── An overlap, said at the field on the picker's commit ─────────────────
  // Day three back onto day one's date: the two windows are the same evening.
  await pick(page, /^اليوم الثالث · .*: بداية اليوم$/, "10");
  await expect(page.getByText("يتداخل هذا اليوم مع يوم آخر من الجلسة.")).toBeVisible();
  await capture(page, "schedule-overlap");
  await pick(page, /^اليوم الثالث · .*: بداية اليوم$/, "12");
  await expect(page.getByText("يتداخل هذا اليوم مع يوم آخر من الجلسة.")).toHaveCount(0);

  // ── Removing a day asks, and NAMES it (DEC-121) ──────────────────────────
  await page.getByRole("button", { name: "احذف هذا اليوم" }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/احذف اليوم الثالث · /)).toBeVisible();
  await capture(page, "schedule-remove-day");
  await dialog.getByRole("button", { name: "أبقِه" }).click();
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم الثالث · / })).toBeVisible();

  // ── One press ────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "انشر الجلسة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "نُشرت الجلسة" })).toBeVisible({ timeout: 20_000 });

  const { rows } = await db.query<{ position: number; starts_at: Date }>(
    `select position, starts_at from public.session_days where session_id = $1 order by position`,
    [sessionId],
  );
  expect(rows).toHaveLength(3);
  // ★ `position` is the CHRONOLOGICAL rank `0100` derives, not the order the
  // form happened to send.
  expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  expect(rows[0].starts_at.getTime()).toBeLessThan(rows[1].starts_at.getTime());
  expect(rows[1].starts_at.getTime()).toBeLessThan(rows[2].starts_at.getTime());

  // ★ And the session's own window is the derived shadow of the day set
  // (contract 1): the first day's start, the last day's end.
  const { rows: session } = await db.query<{ starts_at: Date; ends_at: Date; require_all_days: boolean }>(
    `select starts_at, ends_at, require_all_days from public.sessions where id = $1`,
    [sessionId],
  );
  expect(session[0].starts_at.getTime()).toBe(rows[0].starts_at.getTime());
  expect(session[0].require_all_days).toBe(true);
});
