// ★ Wave 22 — SCR-064 and SCR-065, the two jobs the owner named (DEC-231 §0, REQ-UIX-105, REQ-UIX-106, DEC-232).
//
// 064: an admin opens a completed session's الاستبانة tab and reads what the room thought in one screen — the four
// figures, each naming its instrument (the survey's responses and rate, the rating's two averages), the survey's own
// 1–5 bars, the written answers and an anonymity line that tells the truth — and takes the CSV from the header in one
// press, which leaves `export.created`. A moderator reads the same and is offered no CSV. ★ An ADMIN WHO PRESENTED the
// session gets the not-found page, not the error boundary (the defect DEC-208's table found).
//
// 065: a moderator sees the templates beside the selected one's questions, creates, saves and deletes one — and ★
// EACH WRITE LEAVES ITS RECORD, read back from `audit_log` with the moderator as its actor (`survey_template.created`
// · `changed` · `deleted`, the lead's trigger on `survey_templates`, DEC-231 §4). Written as a member, never as the owner.
//
// Desktop first (1280), the wave's primary width; 065 also at 390, where the tables are cards.
// Captures: wave22-event-064-results-1280.png · wave22-event-065-templates-1280.png · wave22-event-065-templates-390.png (inside the 065 test)
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
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ mode: "serial" });

type Who = "admin" | "moderator" | "presenter" | "a1" | "a2" | "a3";
let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
const people = {} as Record<Who, { email: string; userId: string; memberId: string }>;

async function person(local: string, name: string, role: "admin" | "moderator" | "member") {
  const email = `${local}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const memberId = ((await client.rpc("provision_member")).data as { member_id: string }).member_id;
  if (role !== "member") await db.query(`update public.members set org_role = $2, claims_version = claims_version + 1 where id = $1`, [memberId, role]);
  return { email, userId: data.user.id, memberId };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-w22-ev-${tag}.example`;
  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاستبانة', $1, 'WS', gen_random_uuid()) returning id`,
      [`e2e-w22-ev-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة', 40) returning id`, [orgId])).rows[0].id;

  people.admin = await person("admin", "أمل الشمري", "admin");
  people.moderator = await person("moderator", "منى المطيري", "moderator");
  // ★ An ADMIN who presents: `survey_results()` refuses the presenter whatever the org role.
  people.presenter = await person("presenter", "خالد الزهراني", "admin");
  people.a1 = await person("a1", "سارة العتيبي", "member");
  people.a2 = await person("a2", "فهد القحطاني", "member");
  people.a3 = await person("a3", "نورة الدوسري", "member");

  sessionId = (
    await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                    venue_id, capacity, state, published_at, completed_at)
       values ($1, 'الأرقام التي تكذب', 'ملخص', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
               $3, 30, 'completed', now() - interval '3 days', now() - interval '2 days') returning id`,
      [orgId, category, venue],
    )
  ).rows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, people.presenter.memberId]);

  // Three attendees, each checked in and each rating — the rating's minimum is 3, so its averages are released.
  const stars = [
    [5, 5],
    [5, 4],
    [4, 4],
  ];
  for (const [i, who] of (["a1", "a2", "a3"] as const).entries()) {
    const checkIn = (
      await db.query<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by) values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [orgId, sessionId, people[who].memberId, people.admin.memberId],
      )
    ).rows[0].id;
    await db.query(
      `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, $5, $6)`,
      [orgId, sessionId, people[who].memberId, checkIn, stars[i][0], stars[i][1]],
    );
  }

  // The survey, as attaching writes it, and three responses as the worker stores them — no member, no instant.
  const surveyId = (
    await db.query<{ id: string }>(`insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة ما بعد الجلسة') returning id`, [orgId, sessionId])
  ).rows[0].id;
  const q = await db.query<{ id: string }>(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
     values ($1, $2, 1, 'scale_1_5', 'ما مدى وضوح المحتوى؟', true), ($1, $2, 2, 'free_text', 'ما كنت تودّ أن يكون مختلفًا؟', false) returning id`,
    [orgId, surveyId],
  );
  const [scaleId, textId] = q.rows.map((r) => r.id);
  for (const [i, text] of ["أرسلوا الشرائح قبل الجلسة", "الجزء العملي كان قصيرًا", "أريد جزءًا ثانيًا"].entries()) {
    const response = (await db.query<{ id: string }>(`insert into public.survey_responses (org_id, survey_id) values ($1, $2) returning id`, [orgId, surveyId])).rows[0].id;
    await db.query(`insert into public.survey_answers (org_id, survey_id, response_id, question_id, scale_value) values ($1, $2, $3, $4, $5)`, [orgId, surveyId, response, scaleId, i === 2 ? 4 : 5]);
    await db.query(`insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value) values ($1, $2, $3, $4, $5)`, [orgId, surveyId, response, textId, text]);
  }
});

test.afterAll(async () => {
  for (const who of Object.values(people)) if (who?.userId) await admin.auth.admin.deleteUser(who.userId);
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
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, path: string, size = DESKTOP) {
  await page.setViewportSize(size);
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  expect(await main(page).innerText()).not.toMatch(/[٠-٩]/);
  await page.screenshot({ path: join(SHOTS, `wave22-event-${name}.png`), fullPage: true });
}

const main = (page: Page) => page.locator("#main");

const auditRows = async (action: string, subjectId?: string) =>
  (
    await db.query<{ action: string; actor_id: string | null; actor_role: string; after: Record<string, unknown> | null }>(
      `select action, actor_id, actor_role, after from public.audit_log where org_id = $1 and action = $2 ${subjectId ? "and subject_id = $3" : ""}`,
      subjectId ? [orgId, action, subjectId] : [orgId, action],
    )
  ).rows;

test("★ 064 — an admin reads the room in one screen: four figures naming their instrument, the survey's bars, the answers", async ({ context, page }) => {
  await signIn(context, people.admin.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);

  // The survey's two figures and the rating's two, each saying which it is (DEC-074, DEC-232).
  await expect(main(page).getByText("استجابات الاستبانة")).toBeVisible();
  await expect(main(page).getByText("3 / 3")).toBeVisible();
  await expect(main(page).getByText("100%")).toBeVisible();
  await expect(main(page).getByText("متوسط تقييم الجلسة")).toBeVisible();
  await expect(main(page).getByText("4.67")).toBeVisible();
  await expect(main(page).getByText("متوسط تقييم المُقدِّم")).toBeVisible();
  await expect(main(page).getByText("4.33")).toBeVisible();

  // The stars are the survey's own 1–5 question, five first, each bar with its words and its count.
  const scale = main(page).getByRole("article", { name: /ما مدى وضوح المحتوى؟/ });
  await expect(scale.getByRole("listitem").first()).toHaveText(/^5 نجوم\s*2$/);
  await expect(main(page).getByText("الجزء العملي كان قصيرًا", { exact: true })).toBeVisible();
  // ★ The anonymity line tells the truth: never the presenter, and the minimum is read.
  await expect(main(page).getByText(/مجهولة · لا يراها المُقدِّم · تظهر بعد 3 استجابات/)).toBeVisible();

  // ★ Reading wrote nothing — no per-rater read happened on this page (DEC-232 §2.7).
  expect(await auditRows("ratings.read_admin", sessionId)).toHaveLength(0);
  await capture(page, "064-results-1280");
});

test("★ 064 — «CSV» is the header's one action, and taking it writes export.created", async ({ context, page }) => {
  await signIn(context, people.admin.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  const link = main(page).getByRole("link", { name: /CSV/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveText("CSV");
  const before = (await auditRows("export.created", sessionId)).length;

  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 with a BOM (REQ-ADM-017)
  expect(body).toContain("ما مدى وضوح المحتوى؟");
  expect(await auditRows("export.created", sessionId)).toHaveLength(before + 1);
});

test("064 — a moderator reads the same results and is offered no CSV", async ({ context, page }) => {
  await signIn(context, people.moderator.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await expect(main(page).getByText("3 / 3")).toBeVisible();
  await expect(main(page).getByText("4.67")).toBeVisible();
  await expect(main(page).getByRole("link", { name: /CSV/ })).toHaveCount(0);
});

test("★ 064 — an ADMIN WHO PRESENTED gets the not-found page, never the error boundary", async ({ context, page }) => {
  await signIn(context, people.presenter.email);
  await open(page, `/ar/app/admin/sessions/${sessionId}/survey`);
  await expect(page.getByText("لم نعثر على ما تبحث عنه").first()).toBeVisible();
  await expect(page.getByText("تعذّر تحميل هذا القسم")).toHaveCount(0);
  await expect(page.getByText("استجابات الاستبانة")).toHaveCount(0);
  await expect(page.getByText("الجزء العملي كان قصيرًا")).toHaveCount(0);
});

test("★ 065 — a moderator creates, saves and deletes a template from the list, and each write leaves its record", async ({ context, page }) => {
  await signIn(context, people.moderator.email);

  // Create — through the editor, kept untouched (DEC-232).
  await open(page, "/ar/app/admin/surveys");
  await main(page).getByRole("link", { name: "قالب جديد" }).first().click();
  await main(page).getByLabel(/اسم القالب/).fill("ورشة عملية");
  await main(page).getByRole("button", { name: "أضف سؤالًا" }).click();
  await main(page).getByLabel(/نص السؤال/).nth(0).fill("ما الذي نفعك؟");
  await main(page).getByLabel(/نوع السؤال/).nth(0).selectOption("free_text");
  await main(page).getByRole("button", { name: "حفظ القالب" }).click();
  await expect(page).toHaveURL(/\/app\/admin\/surveys\/[0-9a-f-]{36}/);
  const templateId = page.url().split("/").pop()!;

  const created = await auditRows("survey_template.created", templateId);
  expect(created).toHaveLength(1);
  expect(created[0].actor_id).toBe(people.moderator.memberId);
  expect(created[0].actor_role).toBe("moderator");

  // Save again — `changed`, the moderator its actor.
  await main(page).getByRole("button", { name: "حفظ القالب" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "حُفظ القالب" })).toBeVisible();
  const changed = await auditRows("survey_template.changed", templateId);
  expect(changed).toHaveLength(1);
  expect(changed[0].actor_id).toBe(people.moderator.memberId);

  // The list: the templates beside the selected one's questions (REQ-UIX-106).
  await open(page, `/ar/app/admin/surveys?template=${templateId}`);
  const list = main(page).getByRole("table", { name: "قوالب الاستبانات" });
  await expect(list.getByRole("link", { name: "ورشة عملية" })).toHaveAttribute("aria-current", "true");
  await expect(main(page).getByRole("table", { name: "أسئلة القالب ورشة عملية" }).getByRole("row").nth(1)).toContainText("نص حر");
  await capture(page, "065-templates-1280");
  // The same rows as cards at 390, before the delete takes the template away.
  await open(page, `/ar/app/admin/surveys?template=${templateId}`, PHONE);
  await expect(main(page).getByRole("link", { name: "ورشة عملية" })).toBeVisible();
  await capture(page, "065-templates-390");
  await open(page, `/ar/app/admin/surveys?template=${templateId}`);

  // Delete — from the row's ⋯, asked twice, completed by a form.
  await list.getByRole("button", { name: "إجراءات القالب ورشة عملية" }).click();
  await page.getByRole("menuitem", { name: "احذف القالب" }).click();
  await expect(page).toHaveURL(/delete=/);
  await main(page).getByRole("button", { name: "احذف القالب" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "حُذف القالب" })).toBeVisible();

  const deleted = await auditRows("survey_template.deleted", templateId);
  expect(deleted).toHaveLength(1);
  expect(deleted[0].actor_role).toBe("moderator");
  // Nothing is written twice (REQ-ADM-023).
  expect(await auditRows("survey_template.created", templateId)).toHaveLength(1);
});
