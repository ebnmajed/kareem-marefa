// SCR-064 · /app/admin/sessions/[id]/survey — what the organisation learned
// (REQ-SUR-005 … 008, DEC-160, DEC-161).
//
// ★ THE PRESENTER'S CASE IS THE POINT OF THE ASK, and it is checked against a
// real signed-in presenter reaching the URL — not against a missing link.
//
// Captures: wave10-event-survey-none.png · -survey-withheld.png
//           · -survey-results.png · -survey-presenter-refused.png
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
let domain = "";
let sessionId = "";
let surveyId = "";
let scaleId = "";
let textId = "";
const people: Record<"admin" | "presenter", { email: string; userId: string; memberId: string }> = {
  admin: { email: "", userId: "", memberId: "" },
  presenter: { email: "", userId: "", memberId: "" },
};

async function person(local: string, name: string, role: "admin" | "member") {
  const email = `${local}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const memberId = ((await client.rpc("provision_member")).data as { member_id: string }).member_id;
  if (role === "admin") await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [memberId]);
  return { email, userId: data.user.id, memberId };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-w10-res-${tag}.example`;
  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة النتائج', $1, 'WR', gen_random_uuid()) returning id`,
      [`e2e-w10-res-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة', 40) returning id`, [orgId])).rows[0].id;

  people.admin = await person("admin", "أمل الشمري", "admin");
  people.presenter = await person("presenter", "خالد الزهراني", "member");

  sessionId = (
    await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                    venue_id, capacity, state, published_at, completed_at)
       values ($1, 'كيف نقرأ ميزانية الفريق', 'ملخص', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
               $3, 30, 'completed', now() - interval '3 days', now() - interval '2 days') returning id`,
      [orgId, category, venue],
    )
  ).rows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, people.presenter.memberId]);

  // A template to attach from, written as rows.
  const templateId = (await db.query<{ id: string }>(`insert into public.survey_templates (org_id, title) values ($1, 'استبانة ما بعد الجلسة') returning id`, [orgId])).rows[0].id;
  const tq = await db.query<{ id: string }>(
    `insert into public.survey_template_questions (org_id, template_id, position, kind, prompt, required)
     values ($1, $2, 1, 'scale_1_5', 'ما مدى وضوح المحتوى؟', true), ($1, $2, 2, 'free_text', 'ماذا تقترح؟', false) returning id`,
    [orgId, templateId],
  );
  expect(tq.rows).toHaveLength(2);
});

test.afterAll(async () => {
  for (const who of Object.values(people)) if (who.userId) await admin.auth.admin.deleteUser(who.userId);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") await page.screenshot({ path: join(SHOTS, `wave10-event-${name}.png`), fullPage: true });
}

const main = (page: Page) => page.locator("#main");

/** `n` responses, stored the way the worker stores them. */
async function respond(n: number) {
  for (let i = 0; i < n; i += 1) {
    const response = (await db.query<{ id: string }>(`insert into public.survey_responses (org_id, survey_id) values ($1, $2) returning id`, [orgId, surveyId])).rows[0].id;
    await db.query(
      `insert into public.survey_answers (org_id, survey_id, response_id, question_id, scale_value) values ($1, $2, $3, $4, $5)`,
      [orgId, surveyId, response, scaleId, 3 + (i % 3)],
    );
    await db.query(
      `insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value) values ($1, $2, $3, $4, $5)`,
      [orgId, surveyId, response, textId, `اقتراح ${i + 1}`],
    );
  }
}

test("no survey: the state says so and offers the template that fixes it", async ({ context, page }) => {
  await signIn(context, people.admin.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  await expect(main(page).getByText("لا استبانة على هذه الجلسة")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "أضف الاستبانة" })).toBeVisible();
  await capture(page, "survey-none");
});

test("★ attaching COPIES the template, and two responses are withheld — never an empty chart", async ({ context, page }) => {
  await signIn(context, people.admin.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await main(page).getByRole("button", { name: "أضف الاستبانة" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "أُضيفت الاستبانة" })).toBeVisible();

  const survey = await db.query<{ id: string }>(`select id from public.surveys where session_id = $1`, [sessionId]);
  surveyId = survey.rows[0].id;
  const questions = await db.query<{ id: string; kind: string }>(`select id, kind::text as kind from public.survey_questions where survey_id = $1 order by position`, [surveyId]);
  expect(questions.rows.map((q) => q.kind)).toEqual(["scale_1_5", "free_text"]);
  scaleId = questions.rows[0].id;
  textId = questions.rows[1].id;

  await respond(2);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await expect(main(page).getByText("النتائج محجوبة")).toBeVisible();
  await expect(main(page).getByText(/تظهر النتائج بعد 3 استجابات على الأقل/)).toBeVisible();
  // ★ Not the count, not a mean, not a bar: below the minimum nothing leaves.
  await expect(main(page).getByRole("progressbar")).toHaveCount(0);
  await expect(main(page)).not.toContainText("اقتراح 1");
  await capture(page, "survey-withheld");
});

test("★ the third response draws it — the rate, the scale's bars, the written answers", async ({ context, page }) => {
  await respond(1);
  await signIn(context, people.admin.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  await expect(main(page).getByRole("heading", { name: "نسبة الاستجابة" })).toBeVisible();
  await expect(main(page).getByRole("article", { name: /ما مدى وضوح المحتوى؟/ }).getByRole("progressbar")).toHaveCount(5);
  await expect(main(page).getByText("اقتراح 1")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "تصدير CSV" })).toBeVisible();
  // Every number on the screen is Western (DEC-124).
  expect(await main(page).innerText()).not.toMatch(/[٠-٩]/);
  await capture(page, "survey-results");
});

test("★ the session's presenter is refused by the DATABASE, not by a missing link", async ({ context, page }) => {
  await signIn(context, people.presenter.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  await expect(main(page).getByRole("heading", { name: "نسبة الاستجابة" })).toHaveCount(0);
  await expect(main(page).getByText("النتائج محجوبة")).toHaveCount(0);
  await expect(main(page)).not.toContainText("اقتراح 1");
  await capture(page, "survey-presenter-refused");
});
