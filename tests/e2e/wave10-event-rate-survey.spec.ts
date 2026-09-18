// SCR-015 with a survey below the rating — wave 10 (REQ-SUR-004, DEC-160).
//
// ★ THE FIRST CASE IS THE ONE THAT MATTERS MOST: a session with NO survey
// renders the screen it rendered before this wave. `event-rate.spec.ts` and
// `wave7-sessions-rate.spec.ts` prove it with their own assertions untouched;
// this file captures it beside the survey's own states so the two can be put
// side by side (`wave10-event-rate-no-survey.png` against
// `wave7-sessions-rate-empty.png`).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave10-event-rate-no-survey.png · -survey-empty.png · -survey-error.png
//   · -survey-submitted.png
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
let userId = "";
let memberId = "";
const ids = { withSurvey: "", withoutSurvey: "", second: "", surveyId: "", secondSurveyId: "" };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w10-survey-${tag}.example`;
  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاستبانة', $1, 'WS', gen_random_uuid()) returning id`,
      [`e2e-w10-survey-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId])).rows[0].id;

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userId = data.user.id;
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  memberId = ((await client.rpc("provision_member")).data as { member_id: string }).member_id;

  // ★ EACH SESSION GETS ITS OWN HOUR, and so does each check-in's
  // `session_window`. One member cannot hold two check-ins whose windows
  // overlap — `check_ins_member_id_session_window_excl` (0087) is the
  // one-body-one-room rule (REQ-CHK-013), and it is right. The RLS suite dodges
  // it with an EMPTY range; a browser going through real rows cannot.
  const session = async (title: string, hoursAgo: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'ملخص الجلسة', $3, 'introductory',
                 now() - make_interval(hours => $5), 60, now() - make_interval(hours => $5) + interval '1 hour',
                 $4, 30, 'completed', now() - interval '1 day', now() - make_interval(hours => $5) + interval '1 hour')
         returning id`,
        [orgId, title, category, venue, hoursAgo],
      )
    ).rows[0].id;
  const checkIn = (sessionId: string, hoursAgo: number) =>
    db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'اختبار آلي', $3,
               tstzrange(now() - make_interval(hours => $4), now() - make_interval(hours => $4) + interval '1 hour'))`,
      [orgId, sessionId, memberId, hoursAgo],
    );

  ids.withSurvey = await session("كيف اختصرنا وقت التقارير الشهرية", 6);
  await checkIn(ids.withSurvey, 6);
  ids.withoutSurvey = await session("ورشة أدوات الفريق", 4);
  await checkIn(ids.withoutSurvey, 4);
  ids.second = await session("مقدمة في قراءة الميزانية", 2);
  await checkIn(ids.second, 2);

  // The survey, written the way SCR-064 writes it — rows, not an RPC, because
  // the RPC's caller has to be a signed-in staff member and this spec's member
  // is not one.
  const attach = async (sessionId: string) => {
    const surveyId = (
      await db.query<{ id: string }>(
        `insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة ما بعد الجلسة') returning id`,
        [orgId, sessionId],
      )
    ).rows[0].id;
    const q = async (position: number, kind: string, prompt: string, required: boolean, options: string[] = []) => {
      const id = (
        await db.query<{ id: string }>(
          `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
           values ($1, $2, $3, $4::public.survey_question_kind, $5, $6) returning id`,
          [orgId, surveyId, position, kind, prompt, required],
        )
      ).rows[0].id;
      for (const [index, label] of options.entries()) {
        await db.query(`insert into public.survey_question_options (org_id, question_id, position, label) values ($1, $2, $3, $4)`, [orgId, id, index + 1, label]);
      }
    };
    await q(1, "scale_1_5", "ما مدى وضوح المحتوى؟", true);
    await q(2, "single_choice", "هل كانت مدة الجلسة مناسبة؟", false, ["قصيرة", "مناسبة", "طويلة"]);
    await q(3, "multi_choice", "ما الذي أعجبك؟", false, ["الأمثلة", "الإيقاع", "النقاش"]);
    await q(4, "free_text", "ماذا تقترح للجلسة القادمة؟", false);
    return surveyId;
  };
  ids.surveyId = await attach(ids.withSurvey);
  ids.secondSurveyId = await attach(ids.second);
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") await page.screenshot({ path: join(SHOTS, `wave10-event-${name}.png`), fullPage: true });
}

const main = (page: Page) => page.locator("#main");

test("★ a session with no survey shows nothing about one — the screen is the one wave 7 shipped", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.withoutSurvey}/rate`);

  await expect(main(page).getByRole("radiogroup", { name: /تقييم الجلسة/ })).toBeVisible();
  // Not a heading, not a question, not a word — REQ-SUR-001. ★ The session's
  // own TITLE must not contain the word either, or this case passes or fails on
  // the fixture's prose rather than on the screen: «جلسة بلا استبانة» was the
  // only occurrence in the page the first time this ran.
  await expect(main(page).getByRole("heading", { name: "استبانة الجلسة" })).toHaveCount(0);
  await expect(main(page)).not.toContainText("استبانة");
  // The button keeps its own label, which is what the two untouched specs press.
  await expect(main(page).getByRole("button", { name: "إرسال التقييم", exact: true })).toBeVisible();
  await capture(page, "rate-no-survey");
});

test("empty: the rating, then the survey's four questions, nothing chosen", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.withSurvey}/rate`);

  await expect(main(page).getByRole("heading", { name: "استبانة الجلسة" })).toBeVisible();
  await expect(main(page).getByText("تُحفظ إجاباتك دون اسمك، ولا تُربط بتقييمك.")).toBeVisible();
  await expect(main(page).getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ })).toBeVisible();
  await expect(main(page).getByRole("group", { name: /ما الذي أعجبك؟/ })).toBeVisible();
  await expect(main(page).getByRole("textbox", { name: /ماذا تقترح للجلسة القادمة؟/ })).toBeVisible();
  await expect(main(page).getByRole("button", { name: /إرسال التقييم والإجابات/ })).toBeVisible();
  expect(await main(page).getByRole("radio", { checked: true }).count()).toBe(0);
  await capture(page, "rate-survey-empty");
});

test("★ a required question blocks the SURVEY and never the rating (DEC-164)", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.withSurvey}/rate`);

  // Both star rows chosen, the survey's required scale left alone.
  for (const legend of [/تقييم الجلسة/, /تقييم المُقدِّم/]) {
    await main(page).getByRole("radiogroup", { name: legend }).getByRole("radio", { name: /4 نجوم|٤/ }).first().locator("xpath=..").click();
  }
  await main(page).getByRole("textbox", { name: /ماذا تقترح للجلسة القادمة؟/ }).fill("مثال عملي أكثر");
  await main(page).getByRole("button", { name: /إرسال التقييم والإجابات/ }).click();

  const summary = main(page).getByRole("alert").first();
  // ★ The summary says which half went through. It does NOT say «لم نستطع
  // إرسال تقييمك», which would be untrue: the rating is stored.
  await expect(summary).toContainText("لم نستطع إرسال إجاباتك");
  await expect(summary).toContainText("حُفظ تقييمك");
  await expect(summary.getByRole("link", { name: /ما مدى وضوح المحتوى؟/ })).toBeVisible();
  await expect(main(page).getByText("أجب عن هذا السؤال").first()).toBeVisible();
  // What the member typed is still in the form (React resets a form action).
  await expect(main(page).getByRole("textbox", { name: /ماذا تقترح للجلسة القادمة؟/ })).toHaveValue("مثال عملي أكثر");

  // ★ THE RATING IS WRITTEN — the org's required question does not withhold the
  // member's own voice (DEC-164) — and the SURVEY is not: no participation, no
  // job, so their one response is still theirs.
  const rating = await db.query(`select id from public.ratings where session_id = $1 and member_id = $2`, [ids.withSurvey, memberId]);
  expect(rating.rows).toHaveLength(1);
  const participation = await db.query(`select member_id from public.survey_participations where survey_id = $1`, [ids.surveyId]);
  expect(participation.rows).toHaveLength(0);
  const queued = await db.query(
    `select 1 from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'record_survey_response' and j.payload ->> 'survey_id' = $1`,
    [ids.surveyId],
  );
  expect(queued.rows).toHaveLength(0);
  await capture(page, "rate-survey-error");

  // ★ The second press sends the survey alone and the screen shows the receipt.
  await main(page).getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ }).getByRole("radio").nth(2).click();
  await main(page).getByRole("button", { name: /إرسال التقييم والإجابات/ }).click();
  await expect(main(page).getByText("شكرًا، أجبت عن هذه الاستبانة")).toBeVisible();
  const after = await db.query(`select member_id from public.survey_participations where survey_id = $1`, [ids.surveyId]);
  expect(after.rows).toHaveLength(1);
});

// ★ Runs on its OWN session: the case above already spent this member's one
// response on `ids.withSurvey`, and «one member, one response» is the point.
test("submitted: one press writes the rating and enqueues the answers, and the screen says both", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.second}/rate`);

  for (const legend of [/تقييم الجلسة/, /تقييم المُقدِّم/]) {
    await main(page).getByRole("radiogroup", { name: legend }).getByRole("radio").nth(4).locator("xpath=..").click();
  }
  await main(page).getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ }).getByRole("radio").nth(3).click();
  await main(page).getByRole("group", { name: /ما الذي أعجبك؟/ }).getByRole("checkbox").first().click();
  await main(page).getByRole("textbox", { name: /ماذا تقترح للجلسة القادمة؟/ }).fill("وقت أطول للنقاش");
  await main(page).getByRole("button", { name: /إرسال التقييم والإجابات/ }).click();

  await expect(main(page).getByRole("status").filter({ hasText: "تم إرسال تقييمك" })).toBeVisible();
  await expect(main(page).getByText("شكرًا، أجبت عن هذه الاستبانة")).toBeVisible();
  // The answers are NOT shown back: a member cannot re-open them (DEC-160 §3).
  await expect(main(page)).not.toContainText("وقت أطول للنقاش");
  await capture(page, "rate-survey-submitted");

  // ★ The two writes, in the database: a rating that names the member, a
  // participation that names them and says nothing else, and a queued job whose
  // payload names nobody at all.
  const rating = await db.query<{ submitted_at: string }>(`select submitted_at from public.ratings where session_id = $1 and member_id = $2`, [ids.second, memberId]);
  expect(rating.rows).toHaveLength(1);
  const participation = await db.query(`select member_id from public.survey_participations where survey_id = $1`, [ids.secondSurveyId]);
  expect(participation.rows).toHaveLength(1);
  const job = await db.query<{ key: string | null; payload: Record<string, unknown> }>(
    `select j.key, j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'record_survey_response' and j.payload ->> 'survey_id' = $1`,
    [ids.secondSurveyId],
  );
  expect(job.rows).toHaveLength(1);
  expect(job.rows[0].key).toBeNull();
  expect(JSON.stringify(job.rows[0].payload)).not.toContain(memberId);
  expect(Object.keys(job.rows[0].payload).sort()).toEqual(["answers", "response_id", "survey_id"]);
});
