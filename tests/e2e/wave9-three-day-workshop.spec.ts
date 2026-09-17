// ★ WAVE 9's DEMONSTRABLE (row L8, DEC-150) — a three-day workshop, end to end,
// as ONE run, at 390 px in Arabic, with the REAL worker doing the clock's work.
//
// The brief's measure, in its own order:
//   1 · three days scheduled — through the form an admin meets, not by SQL;
//   2 · each day's code checked into SEPARATELY — day 1's code is refused on
//       day 2, and each check-in row names its own day;
//   3 · day- and session-scoped materials in the right groups — added through
//       the control in each group's header, which IS the scope choice (ruling 3);
//   4 · points and the certificate ONLY AFTER ALL THREE — nothing at day 1's
//       check-in, nothing for the member who missed day 2, and for the one who
//       came to all three: one award, one certificate, once the real worker has
//       completed the session.
//
// ★ WHY THE REAL WORKER (`E2E_WORKER=1`). «Only after all three» is decided at
// COMPLETION (REQ-SES-017, 0113) — by `complete_session`'s cron tick, the
// completion fan-out, `evaluate_no_shows` → `evaluate_session_attendance()`,
// `award_presenter_points` and `issue_certificates`. Calling those functions
// from a test would prove the SQL and nothing about the chain; the chain is the
// thing a three-day workshop depends on. The clock is moved the only way a test
// can move it: the owner shifts the DAYS, and everything downstream — the
// session's derived window (contract 1), `start_session`, the day the code
// belongs to (contract 4), the ceiling — follows on its own or the run fails.
//
// ★ AND THE PRESENTER'S BONUS IS COUNTED. Five active check-in rows exist at the
// end (three + two). The presenter must hold exactly ONE `attendee_bonus` — one
// qualifying attendee — which is 0121's rule seen from the ledger.
//
// Captures — phone project's viewport, 390 × 844, RTL, opened by the lead:
//   wave9-demo-1-schedule-three-days.png   wave9-demo-2-event-reserved.png
//   wave9-demo-3-materials-grouped.png     wave9-demo-4-check-in-day-1.png
//   wave9-demo-5-day-2-old-code-refused.png wave9-demo-6-points-all-three.png
//   wave9-demo-7-points-missed-day-2.png   wave9-demo-8-certificate.png
//
// Serves: REQ-SES-015, REQ-SES-016, REQ-SES-017, REQ-SES-018, REQ-CHK-002,
//         REQ-CHK-015, REQ-PTS-012, REQ-CRT-001 · DEC-119, DEC-120, DEC-121.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
const WORKER = process.env.E2E_WORKER === "1";

test.skip(
  !SERVICE_KEY || !PUBLISHABLE_KEY || !WORKER,
  !SERVICE_KEY || !PUBLISHABLE_KEY
    ? "needs local Supabase: run `npm run test:e2e:local`"
    : "the demonstrable proves the REAL worker's chain — nothing to assert without one (E2E_WORKER=1)",
);

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TITLE = "ورشة تصميم الخدمات على ثلاثة أيام";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let dayIds: string[] = [];
const email = { admin: "", presenter: "", sara: "", khalid: "" };
const member = { admin: "", presenter: "", sara: "", khalid: "" };
const userIds: string[] = [];
const codes: string[] = [];

async function provision(address: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave9-demo-${tag}.example`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الورش', $1, 'WD', gen_random_uuid()) returning id`,
    [`wave9-demo-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصميم الخدمات') returning id`, [orgId]);
  await db.query(`insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ، الدور الثاني', 40)`, [orgId]);

  const people = { admin: "سعد الحربي", presenter: "نورة العتيبي", sara: "سارة القحطاني", khalid: "خالد الشهري" } as const;
  for (const who of Object.keys(people) as (keyof typeof people)[]) {
    email[who] = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email: email[who], password: PASSWORD, email_confirm: true, user_metadata: { full_name: people[who] } });
    if (error) throw error;
    userIds.push(data.user.id);
    member[who] = await provision(email[who]);
  }
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [member.admin]);

  // An APPROVED proposal and its session, as the review screen leaves them: no
  // date, no place, no days. Everything after this is done the way a person does it.
  const { rows: proposal } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, target_audience, expected_duration_minutes, state)
     values ($1, $2, $3, 'ثلاثة أيام عملية: نفهم الخدمة، نرسم رحلتها، ثم نختبرها مع مستفيدين حقيقيين.', $4, 'introductory', 'فرق تجربة المستفيد', 120, 'approved')
     returning id`,
    [orgId, member.presenter, TITLE, cat[0].id],
  );
  const { rows: session } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level)
     values ($1, $2, $3, 'ثلاثة أيام عملية: نفهم الخدمة، نرسم رحلتها، ثم نختبرها مع مستفيدين حقيقيين.', $4, 'introductory')
     returning id`,
    [orgId, proposal[0].id, TITLE, cat[0].id],
  );
  sessionId = session[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true) on conflict do nothing`, [orgId, sessionId, member.presenter]);
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, address: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function settled(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, `${name} scrolls sideways at 390 px`).toBe(false);
  // DEC-124, on every frame of the demonstrable: no Arabic-Indic digit anywhere.
  expect(await page.locator("body").innerText()).not.toMatch(/[٠-٩۰-۹]/);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave9-demo-${name}.png`), fullPage: true });
}

/** `ui/date-time`: the trigger is «{label}: {value}», the dialog is «{label}» (sessions' spec has the reasoning). */
async function pick(page: Page, label: RegExp, day: string, opts: { hour?: string; nextMonth?: boolean } = {}) {
  const trigger = new RegExp(`${label.source.replace(/\$$/, "")}.*: `);
  await page.getByRole("button", { name: trigger }).click();
  const picker = page.getByRole("dialog", { name: label });
  await expect(picker).toBeVisible();
  if (opts.nextMonth) await picker.getByRole("button", { name: "الشهر التالي" }).click();
  await picker.getByRole("button", { name: new RegExp(`^${day} `) }).and(page.locator(":enabled")).first().click();
  if (opts.hour) {
    await picker.getByLabel("الساعة").selectOption(opts.hour);
    await picker.getByLabel("الدقيقة").selectOption("0");
  }
  await picker.getByRole("button", { name: "تم", exact: true }).click();
  await expect(picker).toBeHidden();
}

/** Tap a `ui/switch` where a thumb does — its label row, scrolled to the centre. */
async function tapSwitch(page: Page, name: string) {
  const row = page.locator("label").filter({ has: page.getByRole("switch", { name }) });
  await row.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }));
  await row.click();
}

/**
 * ★ THE CLOCK. `running` is the index of the day that is in progress NOW (ten
 * minutes in, fifty to go); earlier days are whole days in the past, later
 * ones whole days ahead. `running = 3` puts all three in the past.
 *
 * One transaction, overlap and position checks deferred, because three windows
 * moving at once pass through states that collide. The reservation deadline
 * goes to the past FIRST: `rsvp_deadline_at <= starts_at` is a CHECK on the
 * session, and trigger B re-derives `starts_at` from day 1 the moment it moves.
 */
async function setClock(running: number) {
  await db.query("begin");
  try {
    await db.query("set constraints all deferred");
    await db.query(`update public.sessions set rsvp_deadline_at = now() - interval '30 days', cancellation_cutoff_at = now() - interval '30 days' where id = $1`, [sessionId]);
    for (const [i, id] of dayIds.entries()) {
      const offsetDays = i - running; // 0 = today, negative = past
      const start = running >= dayIds.length ? `now() - interval '${(dayIds.length - i) * 24 + 3} hours'` : `now() + interval '${offsetDays} days' - interval '10 minutes'`;
      await db.query(`update public.session_days set starts_at = ${start}, ends_at = ${start} + interval '1 hour' where id = $1`, [id]);
    }
    // ★ What is already RECORDED ages with its day. A check-in stores the window
    // it was made in (REQ-CHK-013's overlap rule compares those windows), and a
    // real day 1 is a whole day older by the time day 2 runs. Moving the days
    // and leaving yesterday's check-ins stamped «today» makes day 2's window
    // overlap the member's own day-1 attendance — the first run of this spec was
    // refused `overlap` with its own session for exactly that. Time passing
    // moves both, so the clock moves both.
    await db.query(
      `update public.check_ins c
          set session_window = tstzrange(d.starts_at, d.ends_at, '[)'), arrived_at = d.starts_at + interval '5 minutes'
         from public.session_days d
        where d.id = c.session_day_id and c.session_id = $1`,
      [sessionId],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function sessionState(): Promise<string> {
  const { rows } = await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId]);
  return rows[0].state;
}

/** The host view's code — day-aware by the clock (contract 4). */
async function hostCode(context: BrowserContext, page: Page): Promise<string> {
  await signIn(context, email.admin);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  await settled(page);
  const code = ((await page.locator("p[dir='ltr']").first().textContent()) ?? "").trim();
  expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  return code;
}

async function typeCode(page: Page, code: string) {
  const boxes = page.locator("input[maxlength='1']");
  const assembled = page.locator('input[type="hidden"][name="code"]');
  await expect(async () => {
    for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(code, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "تسجيل الحضور" }).last().click();
}

async function checkIn(context: BrowserContext, page: Page, who: "sara" | "khalid", code: string, dayIndex: number) {
  await signIn(context, email[who]);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await settled(page);
  await typeCode(page, code);
  await expect(page).toHaveURL(/\?success=1$/, { timeout: 20_000 });
  const { rows } = await db.query<{ session_day_id: string }>(
    `select session_day_id from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null order by arrived_at`,
    [sessionId, member[who]],
  );
  expect(rows.at(-1)?.session_day_id, `${who}'s newest check-in names day ${dayIndex + 1}`).toBe(dayIds[dayIndex]);
}

async function attendancePoints(who: "sara" | "khalid"): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from public.points_ledger where member_id = $1 and session_id = $2 and source = 'check_in'`,
    [member[who], sessionId],
  );
  return Number(rows[0].n);
}

test.beforeEach(async ({ page }, testInfo) => {
  // One run, one clock: the phone project is the one the captures are cut from.
  test.skip(testInfo.project.name !== "phone", "the demonstrable runs once, on the phone project");
  await page.setViewportSize(PHONE);
});

// ─────────────────────────────────────────────────────────────────────────────
test("1 · an admin schedules three days through the form, and publishes", async ({ context, page }) => {
  test.slow();
  await signIn(context, email.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await settled(page);

  await pick(page, /^التاريخ والوقت$/, "10", { hour: "18", nextMonth: true });
  const venue = page.getByLabel("المكان", { exact: true });
  await venue.selectOption((await venue.locator("option", { hasText: "القاعة الكبرى" }).getAttribute("value"))!);

  await tapSwitch(page, "جلسة متعدّدة الأيام");
  await page.getByRole("button", { name: "أضف يومًا" }).click();
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم الثاني · / })).toBeVisible();
  await page.getByRole("button", { name: "أضف يومًا" }).click();
  await expect(page.getByRole("heading", { level: 3, name: /^اليوم الثالث · / })).toBeVisible();
  // REQ-SES-017's default, left as it is: every day is required.
  await expect(page.getByRole("switch", { name: "النقاط والشهادة بعد حضور كل الأيام" })).toBeChecked();
  await page.getByRole("radio", { name: "تُصدَر تلقائيًا لكل من سجّل حضوره" }).check({ force: true });
  await capture(page, "1-schedule-three-days");

  await page.getByRole("button", { name: "انشر الجلسة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "نُشرت الجلسة" })).toBeVisible({ timeout: 20_000 });

  const { rows } = await db.query<{ id: string; position: number }>(`select id, position from public.session_days where session_id = $1 order by position`, [sessionId]);
  expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  dayIds = rows.map((r) => r.id);
  const { rows: s } = await db.query<{ state: string; require_all_days: boolean; certificate_mode: string }>(
    `select state, require_all_days, certificate_mode from public.sessions where id = $1`,
    [sessionId],
  );
  expect(s[0]).toEqual({ state: "published", require_all_days: true, certificate_mode: "automatic" });
});

test("2 · two members reserve; the event page shows the three days", async ({ context, page }) => {
  for (const who of ["khalid", "sara"] as const) {
    await signIn(context, email[who]);
    await page.goto(`/ar/app/sessions/${sessionId}`);
    await settled(page);
    await page.getByRole("button", { name: "احجز مقعدك" }).first().click();
    await expect(page.getByText("تم تأكيد حجزك")).toBeVisible({ timeout: 20_000 });
  }
  // Capacity and the reservation are the SESSION's (ruling 2): one seat, three days.
  const { rows } = await db.query<{ n: string }>(`select count(*) as n from public.rsvps where session_id = $1 and status = 'confirmed'`, [sessionId]);
  expect(Number(rows[0].n)).toBe(2);
  for (const label of [/اليوم الأول · /, /اليوم الثاني · /, /اليوم الثالث · /]) await expect(page.getByText(label).first()).toBeVisible();
  await capture(page, "2-event-reserved");
});

test("3 · the presenter adds one material to the workshop and one to day 2 — the header control is the scope", async ({ context, page }) => {
  test.slow();
  await signIn(context, email.presenter);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await settled(page);
  const materials = page.locator("#materials");

  // ★ Ruling 3, as built after sync 4: each group's header carries ONE control, a
  // native disclosure closed on load, and opening it IS the scope choice — there
  // is no picker inside the form. Nothing is open until it is asked for.
  await expect(materials.locator("details[open]")).toHaveCount(0);
  const add = async (scope: string, title: string, url: string) => {
    const group = materials.locator("details").filter({ has: page.locator(`summary[aria-label^="أضف مادة — ${scope}"]`) });
    await expect(group).toHaveCount(1);
    await group.locator("summary").click();
    await expect(group).toHaveAttribute("open", "");
    // The uploader is not a <form>: a file goes to a Route Handler (Server Actions
    // cap a body at 1 MB), so its fields live in the disclosure itself.
    const form = group;
    await expect(form.getByLabel("عنوان المادة")).toBeVisible();
    await form.getByLabel("نوع المادة").selectOption({ label: "رابط خارجي" });
    await form.getByLabel("عنوان المادة").fill(title);
    await form.getByLabel("الرابط").fill(url);
    // «قبل»: readable before its scope begins. The form's default is «بعد», which
    // REQ-MAT-006 withholds from a member until the scope ends — the right default
    // for slides, and the wrong one for a list a member must be able to read today.
    await form.getByLabel("التوقيت").selectOption("before");
    await form.getByRole("button", { name: "رفع" }).click();
    await expect(materials.getByText(title)).toBeVisible({ timeout: 20_000 });
  };
  await add("للورشة كاملة", "دليل الورشة", "https://example.com/guide");
  await add("اليوم الثاني", "قوالب رسم الرحلة", "https://example.com/day-2");

  const { rows } = await db.query<{ title: string; session_day_id: string | null }>(`select title, session_day_id from public.materials where session_id = $1 order by title`, [sessionId]);
  expect(rows).toEqual([
    { title: "دليل الورشة", session_day_id: null },
    { title: "قوالب رسم الرحلة", session_day_id: dayIds[1] },
  ]);

  // …and a member reads ONE list, grouped: the workshop first, then the day.
  await signIn(context, email.sara);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await settled(page);
  const whole = materials.locator("section, div").filter({ has: page.getByRole("heading", { level: 3, name: "للورشة كاملة" }) }).last();
  await expect(whole).toBeVisible();
  const headings = await materials.getByRole("heading", { level: 3 }).allInnerTexts();
  expect(headings[0]).toBe("للورشة كاملة");
  expect(headings[1]).toMatch(/^اليوم الثاني · /);
  expect(headings).toHaveLength(2); // days 1 and 3 hold nothing, and a plain member is not shown an empty group
  await capture(page, "3-materials-grouped");
});

test("4 · day 1 — the real worker starts the session; both check in with day 1's code; nobody is paid yet", async ({ context, page }) => {
  test.setTimeout(5 * 60_000);
  await setClock(0);
  // `start_session` is a cron tick of the REAL worker: up to a minute, plus the poll.
  await expect.poll(sessionState, { timeout: 150_000, intervals: [5_000] }).toBe("in_progress");

  codes[0] = await hostCode(context, page);
  const { rows } = await db.query<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where session_id = $1 and code = $2`, [sessionId, codes[0]]);
  expect(rows[0].session_day_id).toBe(dayIds[0]);

  await signIn(context, email.sara);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await settled(page);
  await expect(page.getByText("تسجيل حضور اليوم الأول", { exact: false })).toBeVisible();
  await capture(page, "4-check-in-day-1");

  await checkIn(context, page, "sara", codes[0], 0);
  await checkIn(context, page, "khalid", codes[0], 0);

  // ★ REQ-SES-017: a check-in on day 1 of 3 pays nothing — not now, and not
  // after the award job the check-in enqueued has run.
  await expect
    .poll(
      async () =>
        Number(
          (
            await db.query<{ n: string }>(
              `select count(*) as n from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
                where t.identifier = 'award_points' and j.key like 'pts:check_in:%' and j.payload->>'session_id' = $1`,
              [sessionId],
            )
          ).rows[0].n,
        ),
      { timeout: 90_000, intervals: [3_000], message: "the real worker has run the award job each check-in enqueued" },
    )
    .toBe(0);
  expect(await attendancePoints("sara")).toBe(0);
  expect(await attendancePoints("khalid")).toBe(0);
});

test("5 · day 2 — a NEW code; day 1's is refused; only one of the two attends", async ({ context, page }) => {
  test.setTimeout(3 * 60_000);
  await setClock(1);
  codes[1] = await hostCode(context, page);
  expect(codes[1], "day 2 has a code of its own").not.toBe(codes[0]);
  const { rows } = await db.query<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where session_id = $1 and code = $2`, [sessionId, codes[1]]);
  expect(rows[0].session_day_id).toBe(dayIds[1]);

  // ★ «Each day's code checked into separately»: yesterday's code does not open today.
  await signIn(context, email.sara);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await settled(page);
  await expect(page.getByText("تسجيل حضور اليوم الثاني", { exact: false })).toBeVisible();
  await typeCode(page, codes[0]);
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /الرمز|رمز/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page).not.toHaveURL(/\?success=1$/);
  await capture(page, "5-day-2-old-code-refused");

  await checkIn(context, page, "sara", codes[1], 1);
  // خالد does not come on day 2.
});

test("6 · day 3 — both check in again, each row on its own day", async ({ context, page }) => {
  test.setTimeout(3 * 60_000);
  await setClock(2);
  codes[2] = await hostCode(context, page);
  expect(new Set(codes).size, "three days, three different codes").toBe(3);
  await checkIn(context, page, "sara", codes[2], 2);
  await checkIn(context, page, "khalid", codes[2], 2);

  const { rows } = await db.query<{ member_id: string; days: string[] }>(
    `select member_id, array_agg(session_day_id::text order by arrived_at) as days from public.check_ins
      where session_id = $1 and removed_at is null group by member_id`,
    [sessionId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.member_id, r.days]));
  expect(by[member.sara]).toEqual(dayIds);
  expect(by[member.khalid]).toEqual([dayIds[0], dayIds[2]]);
  // Still nothing paid: the day set is not final until the session ends.
  expect(await attendancePoints("sara")).toBe(0);
});

test("7 · after the last day the real worker completes the session — and only then: one award, one certificate, for the one who came to all three", async ({ context, page }) => {
  test.setTimeout(8 * 60_000);
  await setClock(3);
  await expect.poll(sessionState, { timeout: 150_000, intervals: [5_000] }).toBe("completed");

  // The chain: completion fan-out → evaluate_no_shows → evaluate_session_attendance() → the ledger.
  await expect.poll(() => attendancePoints("sara"), { timeout: 120_000, intervals: [5_000] }).toBe(1);
  expect(await attendancePoints("khalid"), "two of three days earns no attendance points").toBe(0);

  // ★ 0121 seen from the ledger: five active check-in rows, ONE qualifying attendee, ONE bonus.
  await expect
    .poll(async () => Number((await db.query<{ n: string }>(`select count(*) as n from public.points_ledger where member_id = $1 and session_id = $2 and source = 'attendee_bonus'`, [member.presenter, sessionId])).rows[0].n), { timeout: 120_000, intervals: [5_000] })
    .toBe(1);
  const { rows: active } = await db.query<{ n: string }>(`select count(*) as n from public.check_ins where session_id = $1 and removed_at is null`, [sessionId]);
  expect(Number(active[0].n)).toBe(5);

  // The certificate: issued to سارة alone, by the real issue job.
  await expect
    .poll(
      async () =>
        (await db.query<{ member_id: string }>(`select member_id from public.certificates where session_id = $1 and kind = 'attendance' and state <> 'revoked'`, [sessionId])).rows.map((r) => r.member_id),
      { timeout: 180_000, intervals: [5_000] },
    )
    .toEqual([member.sara]);

  // ── what each of them reads ────────────────────────────────────────────────
  await signIn(context, email.sara);
  await page.goto("/ar/app/me/points");
  await settled(page);
  await expect(page.getByText("لم تُحتسب نقاط الحضور")).toHaveCount(0);
  // Scoped to the history's rows: the page's session FILTER holds the same title
  // in a hidden <option>, which is what an unscoped getByText finds first.
  const award = page.locator("li").filter({ hasText: TITLE }).filter({ hasText: "تسجيل حضور مؤكَّد" });
  await expect(award).toHaveCount(1); // three days attended, ONE award
  await expect(award).toContainText("+20");
  await capture(page, "6-points-all-three");

  await page.goto("/ar/app/me/certificates");
  await settled(page);
  await expect(page.locator("main").getByText(TITLE).first()).toBeVisible({ timeout: 60_000 });
  await capture(page, "8-certificate");

  await signIn(context, email.khalid);
  await page.goto("/ar/app/me/points");
  await settled(page);
  await expect(page.getByText("لم تُحتسب نقاط الحضور")).toBeVisible();
  await expect(page.getByText("فاتك اليوم الثاني")).toBeVisible();
  await capture(page, "7-points-missed-day-2");

  await page.goto("/ar/app/me/certificates");
  await settled(page);
  await expect(page.locator("main").getByText(TITLE)).toHaveCount(0);
});
