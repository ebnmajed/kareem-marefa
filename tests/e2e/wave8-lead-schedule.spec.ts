// SCR-043 · /app/admin/sessions/[id]/schedule — the lead's row L2 (wave 8, `DEC-147`, `DEC-148`).
//
// «more user friendly … intuitive to fill and quick» (the owner), as
// REQ-SES-016 states it for a one-day session: the proposal's duration
// pre-fills, the end follows the start as a sentence, an end set by hand wins,
// a relation error is said at the field at once, and «انشر الجلسة» saves and
// publishes in one press. The 390 px captures are the row's evidence:
//
//   wave8-lead-schedule-from-proposal.png   the form as an admin first meets it
//   wave8-lead-schedule-field-error.png     an end before the start, said at the field
//   wave8-lead-schedule-ready.png           filled: the end as a sentence, the gate open
//   wave8-lead-schedule-published-edit.png  after one press: published, «احفظ التعديلات»
//
// Phone project only.
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
  // One session, published by the run: the phone project walks it, the desktop
  // project would publish it first and leave nothing to walk.
  test.skip(testInfo.project.name !== "phone", "one walk, on the touch project the captures come from");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave8-schedule-${tag}.example`;
  adminEmail = `boss@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الجدولة', $1, 'SC', gen_random_uuid(), $2) returning id`,
    [`wave8-schedule-${tag}`, adminEmail],
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

  // A session that came from a proposal, the way «أنشئ الجلسة» leaves it:
  // content copied, nothing scheduled, the proposal carrying a 45-minute duration.
  const { rows: proposal } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, target_audience, expected_duration_minutes, state)
     values ($1, $2, 'كيف اختصرنا وقت التقارير الشهرية', 'تجربة عملية في أتمتة التقارير الدورية بأدوات متاحة للجميع.', $3, 'introductory', 'من يُعدّ تقارير دورية', 45, 'approved')
     returning id`,
    [orgId, memberId, cat[0].id],
  );
  const { rows: session } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level)
     values ($1, $2, 'كيف اختصرنا وقت التقارير الشهرية', 'تجربة عملية في أتمتة التقارير الدورية بأدوات متاحة للجميع.', $3, 'introductory')
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
  // Not sideways at 390 px — the question a full-page capture cannot answer.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, `${name} scrolls sideways at 390 px`).toBe(false);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave8-lead-schedule-${name}.png`), fullPage: true });
}

/**
 * Pick the 10th at a given hour — a day number no padding cell can share. An
 * empty picker opens on this month, so the start steps to next month; a picker
 * that already holds a value opens on that value's month.
 */
async function pick(page: Page, label: string, hour: string, { nextMonth }: { nextMonth: boolean }) {
  await page.getByRole("button", { name: new RegExp(`^${label}: `) }).click();
  const picker = page.getByRole("dialog", { name: label });
  if (nextMonth) await picker.getByRole("button", { name: "الشهر التالي" }).click();
  await picker.getByRole("button", { name: /^10 / }).and(page.locator(":enabled")).first().click();
  await picker.getByLabel("الساعة").selectOption(hour);
  await picker.getByLabel("الدقيقة").selectOption("0");
  await picker.getByRole("button", { name: "تم", exact: true }).click();
}

test("★ SCR-043: pre-filled from the proposal, the end follows, a relation error at once, and one press publishes", async ({ context, page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // ── What an admin first meets ─────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1 })).toContainText("كيف اختصرنا وقت التقارير الشهرية");
  await expect(page.getByText("من مقترح سعد الحربي")).toBeVisible();
  await expect(page.getByLabel("المدة بالدقائق")).toHaveValue("45"); // REQ-PRO-009
  await expect(page.getByText("المحتوى — كما كتبه المُقترِح")).toBeVisible();
  await expect(page.getByText("من يُعدّ تقارير دورية")).toBeVisible();
  await expect(page.getByText("لا يمكن النشر بعد — ينقص:")).toBeVisible();
  await expect(page.getByRole("button", { name: "انشر الجلسة" })).toBeDisabled();
  await capture(page, "from-proposal");

  // ── The start, and the end follows as a sentence ──────────────────────────
  await pick(page, "التاريخ والوقت", "18", { nextMonth: true });
  await page.getByLabel("المدة بالدقائق").fill("60");
  await page.getByLabel("المدة بالدقائق").blur();
  await expect(page.getByText(/^تنتهي الجلسة 7:00/)).toBeVisible();

  // ── An end set by hand, before the start: said at the field, at once ──────
  await page.getByRole("button", { name: "عدّل وقت الانتهاء" }).click();
  await pick(page, "نهاية الجلسة", "17", { nextMonth: false });
  await expect(page.getByText("نهاية الجلسة بعد بدايتها.")).toBeVisible();
  await capture(page, "field-error");
  await page.getByRole("button", { name: "احسبها من المدة" }).click();
  await expect(page.getByText("نهاية الجلسة بعد بدايتها.")).toHaveCount(0);

  // ── The venue; the capacity follows it ────────────────────────────────────
  const venue = page.getByLabel("المكان", { exact: true });
  await venue.selectOption((await venue.locator("option", { hasText: "القاعة الكبرى" }).getAttribute("value"))!);
  await expect(page.getByLabel("السعة")).toHaveValue("40");
  // A deadline preset says the time it means.
  await page.getByLabel("آخر موعد للإلغاء", { exact: true }).selectOption("dayBefore");
  await expect(page.getByText(/^يُغلق الإلغاء /)).toBeVisible();
  await expect(page.getByText("لا يمكن النشر بعد — ينقص:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "انشر الجلسة" })).toBeEnabled();
  await capture(page, "ready");

  // ── One press ─────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "انشر الجلسة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "نُشرت الجلسة" })).toBeVisible({ timeout: 15_000 });
  const { rows } = await db.query<{ state: string; minutes: number; capacity: number; walk_ins: boolean }>(
    `select state, extract(epoch from (ends_at - starts_at))::int / 60 as minutes, capacity, allow_walk_ins as walk_ins
       from public.sessions where id = $1`,
    [sessionId],
  );
  expect(rows[0]).toEqual({ state: "published", minutes: 60, capacity: 40, walk_ins: false });

  await page.reload();
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "احفظ التعديلات" })).toBeVisible();
  await expect(page.getByRole("button", { name: "انشر الجلسة" })).toHaveCount(0);
  await capture(page, "published-edit");
});
