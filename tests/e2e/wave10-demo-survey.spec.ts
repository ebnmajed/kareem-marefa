// ★ WAVE 10's FIRST DEMONSTRABLE (row L6, DEC-160) — a survey, from EMPTY, as ONE
// run, at 390 px in Arabic, with the REAL worker storing the responses.
//
// The brief's measure, in its own order:
//   1 · AUTHORED — a template written on SCR-065 by taps alone, a question moved
//       with one press of ▼, saved in the order the screen showed;
//   2 · ATTACHED — copied onto a completed session from SCR-064;
//   3 · ANSWERED BESIDE THE RATING — one screen, one button, two writes: the
//       rating and the register row at once, the answers by a job whose
//       `run_at` is 10 minutes … 4 hours away and whose payload names nobody;
//   4 · WITHHELD AT TWO — nothing leaves, the count included;
//   5 · REFUSED TO ITS PRESENTER — a MODERATOR who presented, so it is the
//       presenting that refuses and not the rank (REQ-SUR-005);
//   6 · DRAWN AT THREE — the rate, the scale's five bars, the written answers;
//   7 · EXPORTED — the audited CSV, BOM first, Western digits, and a member's
//       `=SUM(A1:A9)` neutralised so it cannot run in an admin's spreadsheet;
//   8 · and ★ A SESSION WITH NO SURVEY SHOWS NOTHING ABOUT ONE (REQ-SUR-001).
//
// ★ WHY THE REAL WORKER (`E2E_WORKER=1`). REQ-SUR-009's whole mechanism is that
// the response is NOT written by the request: `record_survey_response` runs in
// the worker, from a payload with no member in it. Calling the SQL function
// from a test would prove the function and nothing about the registration, the
// task file or the payload's shape. The clock is moved the only way a test can
// move it — the OWNER brings the queued jobs' `run_at` forward, after the test
// has asserted it was 10 minutes … 4 hours ahead — and then the run waits for
// the worker to do the rest on its own, or fails.
//
// «From EMPTY» is the feature's data: no template, no survey, no answer, no
// rating exists until a screen makes it. The session, its presenter and the
// three check-ins are rows — checking in is wave 7's and 9's subject, proven by
// their own demonstrables.
//
// ★ RAN 2026-09-18: 8 of 8 on a production build of c34e08b in the verification
// worktree, the REAL worker beside it (`E2E_WORKER=1`, `run-worker.sh` from the
// worktree's `worker/dist` against local Supabase). The eight captures are in
// `.qa-shots/rtl/` — opened by the lead in bands before the row closes.
//
// Captures — phone project's viewport, 390 × 844, RTL, opened by the lead:
//   wave10-demo-survey-1-template-moved.png   wave10-demo-survey-2-attached.png
//   wave10-demo-survey-3-rate-and-survey.png  wave10-demo-survey-4-receipt.png
//   wave10-demo-survey-5-withheld.png         wave10-demo-survey-6-presenter-refused.png
//   wave10-demo-survey-7-results.png          wave10-demo-survey-8-no-survey.png
//
// Serves: REQ-SUR-001 … 009, REQ-RAT-003, REQ-ADM-017, REQ-ADM-020 · DEC-160,
//         DEC-161, DEC-163, DEC-164.
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
    : "the demonstrable proves the REAL worker stores the response — nothing to assert without one (E2E_WORKER=1)",
);

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TEMPLATE = "استبانة ما بعد الجلسة";
const TITLE = "كيف نقرأ ميزانية الفريق";
const Q_SCALE = "ما مدى وضوح المحتوى؟";
const Q_CHOICE = "هل كانت المدة مناسبة؟";
const Q_TEXT = "ماذا تقترح للجلسة القادمة؟";
const FORMULA = "=SUM(A1:A9)";

test.describe.configure({ mode: "serial" });

type Who = "admin" | "presenter" | "sara" | "khalid" | "noura";
const NAMES: Record<Who, string> = { admin: "أمل الشمري", presenter: "نورة العتيبي", sara: "سارة القحطاني", khalid: "خالد الشهري", noura: "نوف الدوسري" };

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let plainSessionId = "";
let surveyId = "";
const email = {} as Record<Who, string>;
const member = {} as Record<Who, string>;
const userIds: string[] = [];

async function provision(address: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  // One run, one viewport: the demonstrable is the phone's. The desktop project
  // would build a second org and spend three more responses for no new fact.
  test.skip(testInfo.project.name !== "phone", "the demonstrable runs once, at 390 px");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave10-demo-survey-${tag}.example`;

  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاستبانات', $1, 'WS', gen_random_uuid()) returning id`,
      [`wave10-demo-survey-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'الإدارة المالية') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId])).rows[0].id;

  for (const who of Object.keys(NAMES) as Who[]) {
    email[who] = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email: email[who], password: PASSWORD, email_confirm: true, user_metadata: { full_name: NAMES[who] } });
    if (error) throw error;
    userIds.push(data.user.id);
    member[who] = await provision(email[who]);
  }
  await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [member.admin]);
  // ★ The presenter is STAFF. A plain member is turned away from `/app/admin`
  // by the role; a moderator is let in everywhere else and refused HERE, which
  // is the only way to show that presenting refuses whatever the rank.
  await db.query(`update public.members set org_role = 'moderator', claims_version = claims_version + 1 where id = $1`, [member.presenter]);

  // Two completed sessions whose windows do NOT overlap: one member cannot hold
  // a check-in on two sessions at once (`check_ins_member_id_session_window_excl`).
  const session = async (title: string, daysAgo: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'نقرأ ميزانية فريق حقيقية سطرًا سطرًا.', $3, 'introductory',
                 now() - make_interval(days => $5), 60, now() - make_interval(days => $5) + interval '1 hour',
                 $4, 30, 'completed', now() - make_interval(days => $5 + 1), now() - make_interval(days => $5) + interval '1 hour')
         returning id`,
        [orgId, title, category, venue, daysAgo],
      )
    ).rows[0].id;
  const checkIn = (sid: string, who: Who, daysAgo: number) =>
    db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'حضر ولم يُسجَّل بالرمز', $4,
               tstzrange(now() - make_interval(days => $5), now() - make_interval(days => $5) + interval '1 hour'))`,
      [orgId, sid, member[who], member.admin, daysAgo],
    );

  sessionId = await session(TITLE, 2);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, member.presenter]);
  for (const who of ["sara", "khalid", "noura"] as Who[]) await checkIn(sessionId, who, 2);

  plainSessionId = await session("أساسيات الأرشفة الرقمية", 1);
  await checkIn(plainSessionId, "sara", 1);
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: Who) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: email[who], password: PASSWORD });
  if (error) throw error;
  await client.rpc("provision_member");
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(page.viewportSize()).toEqual(PHONE);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  await page.screenshot({ path: join(SHOTS, `wave10-demo-survey-${name}.png`), fullPage: true });
}

const main = (page: Page) => page.locator("#main");
const count = async (sql: string, params: unknown[]) => Number((await db.query<{ n: string }>(sql, params)).rows[0].n);
const stored = () => count(`select count(*) as n from public.survey_responses where survey_id = $1`, [surveyId]);

/** The queued response jobs of this survey — as the queue holds them. */
const pendingJobs = () =>
  db.query<{ id: string; ahead: number; payload: Record<string, unknown>; key: string | null }>(
    `select j.id, extract(epoch from (j.run_at - now()))::float as ahead, j.payload, j.key
       from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'record_survey_response' and j.payload ->> 'survey_id' = $1`,
    [surveyId],
  );

/** The OWNER moves the clock: the jitter is asserted first, then brought forward. */
async function releaseJobs(expected: number) {
  const jobs = await pendingJobs();
  expect(jobs.rows, "one job per answer submitted since the last release").toHaveLength(expected);
  for (const job of jobs.rows) {
    // ★ REQ-SUR-009: decorrelated from the rating by 10 minutes … 4 hours.
    expect(job.ahead).toBeGreaterThan(9 * 60);
    expect(job.ahead).toBeLessThanOrEqual(4 * 3600);
    // ★ The payload and the key name NOBODY.
    expect(job.key).toBeNull();
    expect(Object.keys(job.payload).sort()).toEqual(["answers", "response_id", "survey_id"]);
    const text = JSON.stringify(job.payload);
    for (const who of Object.keys(member) as Who[]) expect(text).not.toContain(member[who]);
  }
  await db.query(
    `update graphile_worker._private_jobs set run_at = now()
      where id = any($1::bigint[])`,
    [jobs.rows.map((j) => j.id)],
  );
}

/** A member rates and answers on the ONE screen, with ONE press. */
async function rateAndAnswer(context: BrowserContext, page: Page, who: Who, scale: number, suggestion: string, shoot = false) {
  await signIn(context, who);
  await open(page, `/ar/app/sessions/${sessionId}/rate`);
  await expect(main(page).getByRole("heading", { name: "استبانة الجلسة" })).toBeVisible();
  await expect(main(page).getByText("تُحفظ إجاباتك دون اسمك، ولا تُربط بتقييمك.")).toBeVisible();

  for (const legend of [/تقييم الجلسة/, /تقييم المُقدِّم/]) {
    await main(page).getByRole("radiogroup", { name: legend }).getByRole("radio").nth(4).locator("xpath=..").click();
  }
  await main(page).getByRole("radiogroup", { name: Q_SCALE }).getByRole("radio").nth(scale - 1).click();
  await main(page).getByRole("radiogroup", { name: Q_CHOICE }).getByRole("radio").first().click();
  await main(page).getByRole("textbox", { name: Q_TEXT }).fill(suggestion);
  if (shoot) await capture(page, "3-rate-and-survey");

  const before = await stored();
  await main(page).getByRole("button", { name: /إرسال التقييم والإجابات/ }).click();
  await expect(main(page).getByText("شكرًا، أجبت عن هذه الاستبانة")).toBeVisible();
  if (shoot) await capture(page, "4-receipt");

  // ★ TWO WRITES AT ONCE, and neither is the answer: the rating, and the register.
  expect(await count(`select count(*) as n from public.ratings where session_id = $1 and member_id = $2`, [sessionId, member[who]])).toBe(1);
  expect(await count(`select count(*) as n from public.survey_participations where survey_id = $1 and member_id = $2`, [surveyId, member[who]])).toBe(1);
  // ★ The box is untouched by the request — the response is the WORKER's to write.
  expect(await stored()).toBe(before);
}

test("1 · AUTHORED — a template from nothing, a question moved with one tap, saved in the order shown", async ({ context, page }) => {
  await signIn(context, "admin");
  await open(page, "/ar/app/admin/surveys");
  await expect(main(page).getByText("لا قوالب بعد")).toBeVisible();

  await open(page, "/ar/app/admin/surveys/new");
  await main(page).getByLabel(/اسم القالب/).fill(TEMPLATE);
  const add = main(page).getByRole("button", { name: "أضف سؤالًا" });

  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(0).fill(Q_SCALE);
  await main(page).getByLabel(/سؤال إجباري/).nth(0).check();
  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(1).fill(Q_TEXT);
  await main(page).getByLabel(/نوع السؤال/).nth(1).selectOption("free_text");
  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(2).fill(Q_CHOICE);
  await main(page).getByLabel(/نوع السؤال/).nth(2).selectOption("single_choice");
  const options = main(page).getByLabel(/نص الخيار/);
  await options.nth(0).fill("مناسبة");
  await options.nth(1).fill("طويلة");

  // ★ ONE TAP on ▼, no drag (REQ-SUR-002, SC 2.5.7). The row's own controls are
  // the last element of the row; a choice question nests a second list whose
  // arrows carry the same names.
  const rows = main(page).getByRole("list", { name: "أسئلة الاستبانة" }).locator("> li");
  await rows.nth(1).locator("> div").last().getByRole("button", { name: "انقل لأسفل" }).click();
  await expect(main(page).getByLabel(/نص السؤال/).nth(1)).toHaveValue(Q_CHOICE);
  await expect(main(page).getByLabel(/نص السؤال/).nth(2)).toHaveValue(Q_TEXT);
  await expect(main(page).getByRole("status").filter({ hasText: "إلى الموضع" })).toContainText("إلى الموضع 3 من 3");
  await capture(page, "1-template-moved");

  await main(page).getByRole("button", { name: "حفظ القالب" }).click();
  await expect(page).toHaveURL(/\/app\/admin\/surveys\/[0-9a-f-]{36}/);

  const saved = await db.query<{ position: number; prompt: string; required: boolean }>(
    `select q.position, q.prompt, q.required from public.survey_template_questions q
       join public.survey_templates t on t.id = q.template_id
      where t.org_id = $1 order by q.position`,
    [orgId],
  );
  expect(saved.rows.map((r) => [r.position, r.prompt, r.required])).toEqual([
    [1, Q_SCALE, true],
    [2, Q_CHOICE, false],
    [3, Q_TEXT, false],
  ]);
});

test("2 · ATTACHED — the template is COPIED onto the session from SCR-064", async ({ context, page }) => {
  await signIn(context, "admin");
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await expect(main(page).getByText("لا استبانة على هذه الجلسة")).toBeVisible();

  await main(page).getByRole("button", { name: "أضف الاستبانة" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "أُضيفت الاستبانة" })).toBeVisible();
  await capture(page, "2-attached");

  surveyId = (await db.query<{ id: string }>(`select id from public.surveys where session_id = $1`, [sessionId])).rows[0].id;
  const copied = await db.query<{ prompt: string }>(`select prompt from public.survey_questions where survey_id = $1 order by position`, [surveyId]);
  expect(copied.rows.map((r) => r.prompt)).toEqual([Q_SCALE, Q_CHOICE, Q_TEXT]);
  // Attaching is audited; the submit, on purpose, is not (DEC-160 §3.5).
  expect(await count(`select count(*) as n from public.audit_log where org_id = $1 and action = 'survey.attached'`, [orgId])).toBe(1);
});

test("3 · ANSWERED BESIDE THE RATING — two members, one press each; the real worker stores two responses that name nobody", async ({ context, page }) => {
  test.setTimeout(240_000);
  await rateAndAnswer(context, page, "sara", 4, "وقت أطول للنقاش", true);
  await rateAndAnswer(context, page, "khalid", 5, FORMULA);

  await releaseJobs(2);
  // The REAL worker: it polls every 15 s, and nothing here calls the function.
  await expect.poll(stored, { timeout: 120_000, intervals: [3_000] }).toBe(2);
  expect((await pendingJobs()).rows).toHaveLength(0);

  // ★ What is stored names no member and carries no instant — read from the
  // catalogue, so a column added later fails this run.
  const columns = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    `select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name in ('survey_responses', 'survey_answers')`,
  );
  expect(columns.rows.filter((c) => /member|user|actor|author/.test(c.column_name))).toEqual([]);
  expect(columns.rows.filter((c) => /timestamp|date|time/.test(c.data_type))).toEqual([]);
  // No submit was audited.
  expect(await count(`select count(*) as n from public.audit_log where org_id = $1 and action like 'survey.%' and action <> 'survey.attached'`, [orgId])).toBe(0);
});

test("4 · WITHHELD AT TWO — nothing leaves, the count included", async ({ context, page }) => {
  await signIn(context, "admin");
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  await expect(main(page).getByText("النتائج محجوبة")).toBeVisible();
  await expect(main(page).getByText(/تظهر النتائج بعد 3 استجابات على الأقل/)).toBeVisible();
  await expect(main(page).getByRole("progressbar")).toHaveCount(0);
  await expect(main(page)).not.toContainText("وقت أطول للنقاش");
  await expect(main(page)).not.toContainText("SUM");
  await expect(main(page)).not.toContainText("استجابتان");
  await capture(page, "5-withheld");

  // The export is withheld exactly as the screen is (REQ-SUR-007): one row saying so.
  const csv = await page.request.get(`/api/admin/exports/survey/${sessionId}`);
  expect(csv.status()).toBe(200);
  const text = (await csv.body()).toString("utf8");
  expect(text).toContain("النتائج محجوبة");
  expect(text).not.toContain("SUM");
  expect(text).not.toContain("وقت أطول للنقاش");
});

test("5 · REFUSED TO ITS PRESENTER — a moderator who presented reads nothing, and another session's survey screen still opens for them", async ({ context, page }) => {
  await signIn(context, "presenter");
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  await expect(main(page).getByText("النتائج محجوبة")).toHaveCount(0);
  await expect(main(page).getByRole("heading", { name: "نسبة الاستجابة" })).toHaveCount(0);
  await expect(main(page).getByRole("progressbar")).toHaveCount(0);
  await capture(page, "6-presenter-refused");

  // ★ It is the PRESENTING that refuses, not the role: the same moderator opens
  // the survey screen of a session they did not present.
  await open(page, `/ar/app/admin/sessions/${plainSessionId}/survey`);
  await expect(main(page).getByText("لا استبانة على هذه الجلسة")).toBeVisible();
});

test("6 · DRAWN AT THREE — the third response releases the rate, the five bars and the written answers", async ({ context, page }) => {
  test.setTimeout(240_000);
  await rateAndAnswer(context, page, "noura", 3, "أمثلة من قطاعنا");
  await releaseJobs(1);
  await expect.poll(stored, { timeout: 120_000, intervals: [3_000] }).toBe(3);

  await signIn(context, "admin");
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await expect(main(page).getByRole("heading", { name: "نسبة الاستجابة" })).toBeVisible();
  // The Stat: «المجيبون» → «3 / 3» → «من 3 حاضرين مؤهلين» (REQ-SUR-008).
  await expect(main(page).getByText("3 / 3")).toBeVisible();
  await expect(main(page).getByText("من 3 حاضرين مؤهلين")).toBeVisible();
  await expect(main(page).getByRole("article", { name: Q_SCALE }).getByRole("progressbar")).toHaveCount(5);
  for (const answer of ["وقت أطول للنقاش", "أمثلة من قطاعنا", FORMULA]) await expect(main(page).getByText(answer, { exact: true })).toBeVisible();
  expect(await main(page).innerText()).not.toMatch(/[٠-٩]/);
  await capture(page, "7-results");
});

test("7 · EXPORTED — audited, BOM first, Western digits, and a member's formula cannot run", async ({ context, page }) => {
  await signIn(context, "admin");
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  const link = main(page).getByRole("link", { name: "تصدير CSV" });
  await expect(link).toHaveAttribute("href", new RegExp(`/api/admin/exports/survey/${sessionId}$`));

  const before = await count(`select count(*) as n from public.audit_log where org_id = $1 and action = 'export.created' and after ->> 'export_type' = 'survey'`, [orgId]);
  const response = await page.request.get(`/api/admin/exports/survey/${sessionId}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const bytes = await response.body();
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString("utf8");
  expect(text).toContain(Q_SCALE);
  // ★ DEC-163: the cell opens with an apostrophe, so a spreadsheet reads text.
  expect(text).toContain(`'${FORMULA}`);
  expect(text).not.toMatch(new RegExp(`(^|,)${FORMULA.replace(/[()=:]/g, "\\$&")}`, "m"));
  expect(text).not.toMatch(/[٠-٩]/);
  expect(await count(`select count(*) as n from public.audit_log where org_id = $1 and action = 'export.created' and after ->> 'export_type' = 'survey'`, [orgId])).toBe(before + 1);

  // A member — and the moderator who may read the screen — get the stranger's answer.
  for (const who of ["sara", "presenter"] as Who[]) {
    await signIn(context, who);
    expect((await page.request.get(`/api/admin/exports/survey/${sessionId}`)).status()).toBe(404);
  }
});

test("8 · ★ A SESSION WITH NO SURVEY shows nothing about one — and the answered one now shows its receipt alone", async ({ context, page }) => {
  await signIn(context, "sara");
  await open(page, `/ar/app/sessions/${plainSessionId}/rate`);
  await expect(main(page).getByRole("radiogroup", { name: /تقييم الجلسة/ })).toBeVisible();
  await expect(main(page)).not.toContainText("استبانة");
  await expect(main(page).getByRole("button", { name: "إرسال التقييم", exact: true })).toBeVisible();
  await capture(page, "8-no-survey");

  // One member, one response: Sara's second visit offers no question again.
  await open(page, `/ar/app/sessions/${sessionId}/rate`);
  await expect(main(page).getByText("شكرًا، أجبت عن هذه الاستبانة")).toBeVisible();
  await expect(main(page).getByRole("textbox", { name: Q_TEXT })).toHaveCount(0);
});
