// Wave 9 — check-in on a THREE-DAY workshop, against real local Supabase
// (REQ-SES-015, REQ-CHK-015, REQ-CHK-016, REQ-CHK-017, DEC-119, DEC-150
// contract 4). The same shape as `tests/e2e/checkin.spec.ts`: a per-worker org,
// users minted through the local Auth admin API, provisioned through
// `provision_member()`, signed in with a captured cookie jar.
//
// ★ NO SHARED FIXTURE, on purpose (the lead's ruling): this file builds its own
// org, members and days, so it cannot collide with another spec's member on
// `check_ins_member_id_session_window_excl` — which since `0100` compares REAL
// day windows rather than an `'empty'` range.
//
// The days it builds, and why they are placed where they are:
//   day 1   now − 30 h … now − 28 h   over, and its ceiling long past
//   day 2   now −  1 h … now +  1 h   RUNNING — the day everything is about
//   day 3   now + 22 h … now + 24 h   ahead, so «the session has ended» is a
//                                     visibly wrong thing to say about day 2
//
// Captures (`E2E_SHOTS_DIR`, default `.qa-shots/rtl`), all at 390 px in Arabic:
//   wave9-checkin-host-day2-open.png · wave9-checkin-host-day2-closed.png
//   wave9-checkin-check-in-day2.png  · wave9-checkin-check-in-day2-ended.png
//   wave9-checkin-attendance-3days.png · wave9-checkin-attendance-mark-day.png
//   wave9-checkin-attendance-remove-day.png
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
let dayIds: string[] = [];
let staffEmail = "";
let staffUserId = "";
let attendeeEmail = "";
let attendeeUserId = "";
let attendeeMemberId = "";
let regularEmail = "";
let regularUserId = "";
let regularMemberId = "";

async function shoot(page: Page, name: string, isPhone: boolean) {
  if (!isPhone) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ★ 390 × 844, the row's rule — set for the PHONE project only, not with a
// file-level `test.use()`. These two files run on BOTH projects and the desktop
// cases are real (the DEC-145 duplicate only appears there), so a file-level
// `use` would shrink desktop to a phone and quietly delete that coverage.
// The phone project is `devices["Pixel 7"]`, whose default is 412 × 915 at
// DPR 2.625 — which is what produced 1082 px captures instead of the 1024 px
// every other track's files are. Setting it in `beforeEach` rather than inside
// `shoot()` means every assertion runs at the width the capture was taken at,
// which is the point of reviewing one.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
});

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave9-days-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الورشة', $1, 'WK', gen_random_uuid()) returning id`,
    [`wave9-days-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'ورش') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);

  // Day 1's window IS the session's at insert; `0100`'s shim creates day 1 from
  // it, and each further day stretches `sessions.ends_at` through the derive
  // trigger. Nothing computes a minimum or a maximum here (contract 1).
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'ورشة ثلاثة أيام', 'ملخص الورشة', $2, 'introductory',
             now() - interval '30 hours', 120, now() - interval '28 hours', $3, 40, 'in_progress', now() - interval '10 days', true)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  for (const [from, to] of [
    ["-1 hours", "1 hours"],
    ["22 hours", "24 hours"],
  ]) {
    await db.query(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
       values ($1, $2, 1, now() + $3::interval, now() + $4::interval, $5)`,
      [orgId, sessionId, from, to, venue[0].id],
    );
  }
  const { rows: days } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [sessionId]);
  dayIds = days.map((d) => d.id);
  expect(dayIds).toHaveLength(3);

  for (const [who, name] of [
    ["staff", "مشرف الورشة"],
    ["attendee", "سارة العتيبي"],
    ["regular", "خالد الحربي"],
  ] as const) {
    const email = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    if (who === "staff") [staffEmail, staffUserId] = [email, data.user.id];
    if (who === "attendee") [attendeeEmail, attendeeUserId] = [email, data.user.id];
    if (who === "regular") [regularEmail, regularUserId] = [email, data.user.id];
  }
});

test.afterAll(async () => {
  for (const id of [staffUserId, attendeeUserId, regularUserId]) if (id) await admin.auth.admin.deleteUser(id);
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

// ═══════════════════════════════════════════════════════════════════════════
// SCR-016 — the host view says which day it is running
// ═══════════════════════════════════════════════════════════════════════════
test("the host view shows DAY 2's code and DAY 2's switch, and names the day", async ({ context, page }, testInfo) => {
  const isPhone = testInfo.project.name === "phone";
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رمز الحضور");
  // ★ The day, named — «اليوم الثاني» — which a one-day session never says.
  await expect(page.getByText("اليوم الثاني", { exact: false })).toBeVisible();

  const code = (await page.locator("p[dir='ltr']").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  // The code the RPC minted belongs to day 2, not to the session.
  const { rows } = await db.query<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where session_id = $1 and code = $2`, [sessionId, code]);
  expect(rows[0].session_day_id).toBe(dayIds[1]);

  await expect(page.getByText("تسجيل الحضور مفتوح")).toBeVisible();
  await shoot(page, "wave9-checkin-host-day2-open", isPhone);

  // Closing moves DAY 2's switch and leaves days 1 and 3 alone.
  await page.getByRole("button", { name: "أغلق تسجيل الحضور" }).click();
  await expect(page).toHaveURL(/\?switch=closed$/, { timeout: 15_000 });
  await expect(page.getByText("تسجيل الحضور مغلق")).toBeVisible();
  await shoot(page, "wave9-checkin-host-day2-closed", isPhone);

  const { rows: switches } = await db.query<{ check_in_open: boolean }>(
    `select check_in_open from public.session_days where session_id = $1 order by position`,
    [sessionId],
  );
  expect(switches.map((s) => s.check_in_open)).toEqual([true, false, true]);

  // And the session's own column is the `bool_or` shadow — still open, because
  // days 1 and 3 are (DEC-150 contract 2).
  const { rows: shadow } = await db.query<{ check_in_open: boolean }>(`select check_in_open from public.sessions where id = $1`, [sessionId]);
  expect(shadow[0].check_in_open).toBe(true);

  await page.getByRole("button", { name: "افتح تسجيل الحضور" }).click();
  await expect(page).toHaveURL(/\?switch=opened$/, { timeout: 15_000 });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCR-014 — the member is never asked which day, and is told which
// ═══════════════════════════════════════════════════════════════════════════
test("the check-in screen names the day, and refuses in THAT day's words once its ceiling has passed", async ({ context, page }, testInfo) => {
  const isPhone = testInfo.project.name === "phone";
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  const code = (await page.locator("p[dir='ltr']").first().textContent())?.trim() ?? "";

  await context.clearCookies();
  attendeeMemberId = await signIn(context, attendeeEmail, false);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  await expect(page.getByText("تسجيل حضور اليوم الثاني", { exact: false })).toBeVisible();
  await shoot(page, "wave9-checkin-check-in-day2", isPhone);

  const boxes = page.locator("input[maxlength='1']");
  const assembled = page.locator('input[type="hidden"][name="code"]');
  await expect(async () => {
    for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(code, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(page).toHaveURL(/\?success=1$/, { timeout: 15_000 });

  // The row belongs to DAY 2.
  const { rows: ci } = await db.query<{ session_day_id: string }>(
    `select session_day_id from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null`,
    [sessionId, attendeeMemberId],
  );
  expect(ci.map((r) => r.session_day_id)).toEqual([dayIds[1]]);

  // ★ Move day 2 into the past. Its ceiling has now passed while DAY 3 IS
  // STILL AHEAD — the case «انتهت الجلسة» would be a lie about.
  await db.query(`update public.session_days set starts_at = now() - interval '6 hours', ends_at = now() - interval '4 hours' where id = $1`, [dayIds[1]]);
  await context.clearCookies();
  await signIn(context, regularEmail, false);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(page.getByRole("status")).toContainText("انتهى وقت تسجيل الحضور في اليوم الثاني");
  // and NOT the session-level sentence, which is what main would have said
  await expect(page.getByText("انتهت الجلسة", { exact: true })).toHaveCount(0);
  await shoot(page, "wave9-checkin-check-in-day2-ended", isPhone);

  await db.query(`update public.session_days set starts_at = now() - interval '1 hours', ends_at = now() + interval '1 hours' where id = $1`, [dayIds[1]]);
});

// ═══════════════════════════════════════════════════════════════════════════
// SCR-044 — who attended WHICH day (REQ-SES-017)
// ═══════════════════════════════════════════════════════════════════════════
test("the attendance report shows a column per day, one member missing day 2, and marks and removes per day", async ({ context, page }, testInfo) => {
  const isPhone = testInfo.project.name === "phone";

  // ★ SELF-CONTAINED, not leaning on the case above. Both members are
  // provisioned here — a member row exists only once `provision_member()` has
  // run for them — so this case states its own world and a `--grep` run of it
  // alone is honest.
  attendeeMemberId = await signIn(context, attendeeEmail, false);
  await context.clearCookies();
  regularMemberId = await signIn(context, regularEmail, false);
  await context.clearCookies();
  const adminMemberId = await signIn(context, staffEmail, true);

  // ★ Both hold a CONFIRMED reservation. One registration covers every day
  // (DEC-120), and without it neither is a manual-mark candidate — they would
  // read as walk-ins and the form would be empty, which is a true statement
  // about the wrong session.
  for (const member of [attendeeMemberId, regularMemberId]) {
    await db.query(
      `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')
       on conflict (session_id, member_id) do nothing`,
      [orgId, sessionId, member],
    );
  }

  // سارة attends day 2 only; خالد attends days 1 and 3 and MISSES day 2 —
  // the shape the report exists to make visible. Guarded rather than plain,
  // because the case above may already have given سارة her day 2 through the
  // real screen, and the per-day unique index is partial.
  const attend = async (member: string, day: string) =>
    db.query(
      `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
       select $1, $2, $3, $4, 'manual', 'حضر', $5
        where not exists (select 1 from public.check_ins c where c.session_day_id = $3 and c.member_id = $4 and c.removed_at is null)`,
      [orgId, sessionId, day, member, adminMemberId],
    );
  await attend(attendeeMemberId, dayIds[1]);
  await attend(regularMemberId, dayIds[0]);
  await attend(regularMemberId, dayIds[2]);

  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("تقرير الحضور");

  // One column per day, and the summary line that says what completeness means.
  for (const label of ["اليوم الأول", "اليوم الثاني", "اليوم الثالث"]) {
    await expect(page.getByRole("columnheader", { name: label })).toBeVisible();
  }
  // ★ SCOPED TO THE REGION, and not because the page renders this twice — it
  // renders it once (`attendance/page.tsx`). On the desktop project a SECOND,
  // hidden copy is in the DOM: `DEC-145`'s orphaned streaming segment, carried
  // to M13. The evidence is in the failure itself — the `h1` and all three
  // column headers resolved to exactly ONE element each by role, while this
  // line resolved to two by text, and Playwright could derive a role path for
  // the first copy and none for the second. `getByRole` skips what is not in
  // the accessibility tree; `getByText` does not. So the extra copy is hidden,
  // and a role-anchored locator is both the correct assertion and the one that
  // does not go red on an artefact this spec is not about.
  await expect(page.getByRole("region", { name: "ملخّص الحضور" }).getByText("النقاط والشهادة تتطلّب حضور كل الأيام.")).toBeVisible();
  // خالد: two of three. سارة: one of three.
  await expect(page.getByRole("cell", { name: "2 من 3" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1 من 3" })).toBeVisible();
  await shoot(page, "wave9-checkin-attendance-3days", isPhone);

  // ★ SCOPED BY SECTION. Both forms carry a `dayId` select labelled «اليوم»,
  // so an unscoped `getByLabel` is a strict-mode violation waiting to happen
  // the first time someone reorders the page.
  const markSection = page.locator('section[aria-labelledby="manual"]');
  const removeSection = page.locator('section[aria-labelledby="remove"]');

  // The manual mark is per day: choosing day 2 offers خالد, who is missing it.
  await markSection.locator('select[name="dayId"]').selectOption(dayIds[1]);
  await expect(markSection.locator('select[name="memberId"]')).toContainText("خالد الحربي");
  await shoot(page, "wave9-checkin-attendance-mark-day", isPhone);

  // The removal is per day too, and its confirm names the member and session.
  await removeSection.locator('select[name="dayId"]').selectOption(dayIds[0]);
  await removeSection.locator('select[name="memberId"]').selectOption(regularMemberId);
  await removeSection.locator('textarea[name="reason"]').fill("سُجّل خطأً");
  await removeSection.getByRole("button", { name: "ألغِ تسجيل الحضور" }).first().click();
  const dialog = page.getByRole("dialog", { name: "تأكيد إلغاء تسجيل الحضور" });
  await expect(dialog).toBeVisible();
  await shoot(page, "wave9-checkin-attendance-remove-day", isPhone);
  await dialog.getByRole("button", { name: "ألغِ تسجيل الحضور" }).click();

  // ★ Day 1 removed; day 3 UNTOUCHED — the whole point of a per-day removal.
  await expect(async () => {
    const { rows } = await db.query<{ session_day_id: string }>(
      `select session_day_id from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null`,
      [sessionId, regularMemberId],
    );
    expect(rows.map((r) => r.session_day_id)).toEqual([dayIds[2]]);
  }).toPass({ timeout: 15_000 });
});
