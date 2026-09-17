// Wave 9 — the three check-in screens on a ONE-DAY session (DEC-150's second
// demonstrable: a one-day session is byte-identical in behaviour to `main`).
//
// ★ THIS FILE ASSERTS ABSENCE, which is the half a screenshot cannot prove on
// its own. `tests/e2e/checkin.spec.ts` and `admin-attendance.spec.ts` already
// prove the one-day screens WORK — they pass unmodified, which is the real
// evidence. What is new in wave 9 is everything that must NOT appear: no day
// label on the host view or the check-in screen, no day column or day select
// on the attendance report. A regression there is invisible in the common
// case's own tests, because they never knew days existed.
//
// Its captures sit beside the wave-7 ones so the lead can open them in pairs:
//   wave9-checkin-host-one-day.png       ↔ wave7-checkin-host-open.png
//   wave9-checkin-check-in-one-day.png   ↔ wave7-checkin-check-in-ready.png
//   wave9-checkin-attendance-one-day.png ↔ wave7-checkin-attendance-populated.png
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

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let staffEmail = "";
let staffUserId = "";
let attendeeEmail = "";
let attendeeUserId = "";

async function shoot(page: Page, name: string, isPhone: boolean) {
  if (!isPhone) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave9-one-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة اليوم الواحد', $1, 'OD', gen_random_uuid()) returning id`,
    [`wave9-one-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'لقاءات') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);

  // ★ NOTHING here mentions a day. The session is inserted exactly as every
  // fixture on `main` inserts one, and `0100`'s shim gives it its one day —
  // which is what «a one-day session is a session with one day» has to mean
  // for rows nobody migrated by hand.
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة ليوم واحد', 'ملخص الجلسة', $2, 'introductory',
             now() - interval '10 minutes', 60, now() + interval '50 minutes', $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  const { rows: days } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  expect(days).toHaveLength(1);

  for (const [who, name] of [
    ["staff", "مشرف اللقاء"],
    ["attendee", "نورة القحطاني"],
  ] as const) {
    const email = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    if (who === "staff") [staffEmail, staffUserId] = [email, data.user.id];
    else [attendeeEmail, attendeeUserId] = [email, data.user.id];
  }
});

test.afterAll(async () => {
  for (const id of [staffUserId, attendeeUserId]) if (id) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string, asAdmin: boolean): Promise<string> {
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
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

/** «اليوم الأول», «اليوم الثاني» … — none of these may appear anywhere. */
const DAY_WORDS = /اليوم (الأول|الثاني|الثالث|الرابع)/;

test("the host view says nothing about days, and the code is still one tap from the room", async ({ context, page }, testInfo) => {
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رمز الحضور");

  const code = (await page.locator("p[dir='ltr']").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  await expect(page.getByText("تسجيل الحضور مفتوح")).toBeVisible();

  // ★ ABSENCE.
  await expect(page.locator("body")).not.toContainText(DAY_WORDS);
  await shoot(page, "wave9-checkin-host-one-day", testInfo.project.name === "phone");
});

test("the check-in screen says nothing about days", async ({ context, page }, testInfo) => {
  await signIn(context, attendeeEmail, false);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  await expect(page.getByText("أدخل رمز الحضور الذي أعلنه المُقدِّم")).toBeVisible();
  await expect(page.locator("input[maxlength='1']")).toHaveCount(6);

  await expect(page.locator("body")).not.toContainText(DAY_WORDS);
  await shoot(page, "wave9-checkin-check-in-one-day", testInfo.project.name === "phone");
});

test("the attendance report has no day column, no day select and no completeness stat", async ({ context, page }, testInfo) => {
  const adminMemberId = await signIn(context, staffEmail, true);
  const { rows: member } = await db.query<{ id: string }>(`select id from public.members where org_id = $1 and display_name = 'نورة القحطاني'`, [orgId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, member[0].id]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by) values ($1, $2, $3, 'manual', 'حضر', $4)`,
    [orgId, sessionId, member[0].id, adminMemberId],
  );

  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("تقرير الحضور");

  // The four columns wave 7 shipped, and only those.
  for (const label of ["الاسم", "الحالة", "وقت الوصول", "الطريقة"]) {
    await expect(page.getByRole("columnheader", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("columnheader", { name: "الأيام" })).toHaveCount(0);
  // Neither form offers a day. The hidden `input[name="dayId"]` still carries
  // one — the day travels, it is just never a question.
  await expect(page.locator('select[name="dayId"]')).toHaveCount(0);
  await expect(page.locator('input[type="hidden"][name="dayId"]')).not.toHaveCount(0);
  await expect(page.getByText("أكملوا كل الأيام")).toHaveCount(0);
  await expect(page.getByText("النقاط والشهادة تتطلّب", { exact: false })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(DAY_WORDS);

  await shoot(page, "wave9-checkin-attendance-one-day", testInfo.project.name === "phone");
});
