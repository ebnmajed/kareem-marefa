// SCR-015, rebuilt from `Rate.dc.html` — wave 19 (DEC-213, DEC-214 §3, REQ-UIX-066, REQ-UIX-064).
//
// What the rebuild adds or moves, measured in a real renderer — the old specs
// (`wave7-sessions-rate`, `event-rate`, `wave10-event-rate-survey`) stay the evidence for everything
// they already pinned, untouched:
//   · the mini-row names EVERY presenter with their company (contract 8) and «حضرت» only for an attendee;
//   · each star row reads its count back under it, and a pointer hovering a star previews from the right;
//   · the comment counts «N من 2000» as the member types;
//   · the anonymity panel sits after the comment, the survey after the panel, the bar last — and the bar's
//     label follows the survey's state (REQ-SUR-004, DEC-213 §5.90);
//   · the bar is fixed below `lg` and in flow from `lg`; closed and not-eligible draw no bar at all;
//   · `?rated=1` is an in-page `role="status"` receipt, never a toast (§5.92).
//
// Captures (phone project, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave19-event-rate-{empty,chosen,error,submitted,survey,closed,not-eligible}-390.png · -open-1280.png
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
const DESKTOP = { width: 1280, height: 900 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
const userIds: string[] = [];
const ids = { open: "", withSurvey: "", closed: "", notAttended: "" };

async function provision(address: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: e2 } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (e2) throw e2;
  const { data: row, error: e3 } = await client.rpc("provision_member");
  if (e3) throw e3;
  return (row as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w19-rate-${tag}.example`;
  const org = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة التقييم', $1, 'WQ', gen_random_uuid()) returning id`,
    [`e2e-w19-rate-${tag}`],
  );
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const venue = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);
  const companyA = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'جذر', '#3be8b0') returning id`, [orgId]);
  const companyB = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'دبابيس', '#ffd23f') returning id`, [orgId]);

  email = `member@${domain}`;
  const memberId = await provision(email, "ريم العتيبي");
  const presenterA = await provision(`presenter-a@${domain}`, "محمد الدوسري");
  const presenterB = await provision(`presenter-b@${domain}`, "سارة القحطاني");
  await db.query(`update public.members set company_id = $1 where id = $2`, [companyA.rows[0].id, presenterA]);
  await db.query(`update public.members set company_id = $1 where id = $2`, [companyB.rows[0].id, presenterB]);

  const session = async (title: string, daysAgo: number, presenters: string[]) => {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
         values ($1, $2, 'ملخص الجلسة', $3, 'introductory', now() - make_interval(days => $5), 60, now() - make_interval(days => $5) + interval '1 hour', $4, 30, 'completed',
                 now() - make_interval(days => $5 + 1), now() - make_interval(days => $5))
         returning id`,
        [orgId, title, category.rows[0].id, venue.rows[0].id, daysAgo],
      )
    ).rows[0].id;
    for (const presenter of presenters) {
      await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, id, presenter]);
    }
    return id;
  };
  // Windows one day wide and days apart: one member cannot hold two overlapping check-ins.
  const checkIn = async (sessionId: string, daysAgo: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'اختبار آلي', $3, tstzrange(now() - make_interval(days => $4 + 1), now() - make_interval(days => $4)))
         returning id`,
        [orgId, sessionId, memberId, daysAgo],
      )
    ).rows[0].id;

  ids.open = await session("الأرقام التي تكذب: قراءة تقارير الأداء", 2, [presenterA, presenterB]);
  await checkIn(ids.open, 2);
  ids.notAttended = await session("جلسة لم أحضرها", 4, [presenterA]);
  ids.withSurvey = await session("العرض في 5 شرائح", 6, [presenterB]);
  await checkIn(ids.withSurvey, 6);
  const surveyId = (
    await db.query<{ id: string }>(`insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة ما بعد الجلسة') returning id`, [orgId, ids.withSurvey])
  ).rows[0].id;
  await db.query(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required) values ($1, $2, 1, 'scale_1_5'::public.survey_question_kind, 'ما مدى وضوح المحتوى؟', true)`,
    [orgId, surveyId],
  );
  ids.closed = await session("مقدمة في قراءة الميزانية", 30, [presenterA]);
  const closedCheckIn = await checkIn(ids.closed, 30);
  await db.query(
    `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, comment)
     values ($1, $2, $3, $4, 4, 5, 'مثال عملي واضح.')`,
    [orgId, ids.closed, memberId, closedCheckIn],
  );
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const bar = (page: Page) => main(page).getByRole("group", { name: "إجراءات التقييم" });

async function open(page: Page, path: string, size = PHONE) {
  await page.setViewportSize(size);
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(SHOTS, `wave19-event-rate-${name}.png`), fullPage: true });
  }
}

/** How many stars in a row are drawn filled — read from the painted fill, not from state. */
async function filled(page: Page, legend: RegExp) {
  return main(page).getByRole("radiogroup", { name: legend }).locator("label path").evaluateAll((paths) => paths.map((p) => getComputedStyle(p).fill !== "none"));
}

/** The line read back under a row — the one visible child of the read-back. */
async function readBack(page: Page, legend: RegExp) {
  return main(page).getByRole("radiogroup", { name: legend }).locator('[data-slot="read-back"] > span:visible').innerText();
}

test("empty: the top row, the mini-row with every presenter and «حضرت», two rows, the counter, the panel, the bar", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("قيّم الجلسة");
  await expect(main(page).getByRole("link", { name: "رجوع" })).toHaveAttribute("href", `/ar/app/sessions/${ids.open}`);
  // Contract 8: every presenter with their company, joined — never only the first.
  const mini = main(page).locator("article").first();
  await expect(mini).toContainText("الأرقام التي تكذب: قراءة تقارير الأداء");
  await expect(mini).toContainText("محمد الدوسري، جذر");
  await expect(mini).toContainText("سارة القحطاني، دبابيس");
  await expect(mini).toContainText("حضرت");
  await expect(main(page).getByRole("radiogroup")).toHaveCount(2);
  expect(await filled(page, /تقييم الجلسة/)).toEqual([false, false, false, false, false]);
  await expect(main(page).getByText("0 من 2000")).toBeVisible();
  await expect(main(page).getByText(/يمكن لمشرفي المؤسسة الاطلاع على التقييمات الفردية/)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "إرسال التقييم", exact: true })).toBeVisible();
  await expect(bar(page)).toContainText(/يُغلق باب التقييم في .* · يمكنك تعديله حتى ذلك الحين/);
  // Below `lg` the bar is fixed to the viewport's block end.
  expect(await bar(page).evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  await expect(main(page).getByRole("heading", { name: "استبانة الجلسة" })).toHaveCount(0);
  await capture(page, "empty-390");
});

test("chosen: the count is read back, a hover previews from the right, the comment is counted", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);
  const row = main(page).getByRole("radiogroup", { name: /تقييم الجلسة/ });
  await row.getByRole("radio", { name: "4 نجوم" }).locator("xpath=..").click();
  await expect(row.getByRole("radio", { name: "4 نجوم" })).toBeChecked();
  expect(await readBack(page, /تقييم الجلسة/)).toBe("4 نجوم");
  await main(page).getByRole("radiogroup", { name: /تقييم المُقدِّم/ }).getByRole("radio", { name: "5 نجوم" }).locator("xpath=..").click();
  expect(await readBack(page, /تقييم المُقدِّم/)).toBe("5 نجوم");

  // A pointer on star 2 previews two stars — from the right — while four are chosen; leaving restores four.
  if (test.info().project.name !== "phone") {
    await row.getByRole("radio", { name: "نجمتان" }).locator("xpath=..").hover();
    expect(await filled(page, /تقييم الجلسة/)).toEqual([true, true, false, false, false]);
    await main(page).getByRole("heading", { level: 1 }).hover();
  }
  expect(await filled(page, /تقييم الجلسة/)).toEqual([true, true, true, true, false]);

  await main(page).getByLabel("ملاحظات (اختياري)").fill("مثال عملي");
  await expect(main(page).getByText("9 من 2000")).toBeVisible();
  await capture(page, "chosen-390");
});

test("error: a missing row is a field error and a summary line, and what was typed stays", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);
  await main(page).getByRole("radiogroup", { name: /تقييم الجلسة/ }).getByRole("radio", { name: "5 نجوم" }).locator("xpath=..").click();
  await main(page).getByLabel("ملاحظات (اختياري)").fill("مثال عملي واضح.");
  await bar(page).getByRole("button", { name: "إرسال التقييم", exact: true }).click();
  const summary = page.locator("form[novalidate] [role=alert]");
  await expect(summary).toContainText("لم نستطع إرسال تقييمك");
  await expect(page.locator("#presenterStars-error")).toHaveText("اختر عدد النجوم");
  await expect(main(page).getByRole("radiogroup", { name: /تقييم الجلسة/ }).getByRole("radio", { name: "5 نجوم" })).toBeChecked();
  await expect(main(page).getByLabel("ملاحظات (اختياري)")).toHaveValue("مثال عملي واضح.");
  await expect(main(page).getByText("15 من 2000")).toBeVisible();
  await capture(page, "error-390");
});

test("submitted: the in-page receipt with the stars read-only, and the form still editable under it", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.open}/rate`);
  for (const [legend, name] of [[/تقييم الجلسة/, "5 نجوم"], [/تقييم المُقدِّم/, "4 نجوم"]] as const) {
    await main(page).getByRole("radiogroup", { name: legend }).getByRole("radio", { name }).locator("xpath=..").click();
  }
  await bar(page).getByRole("button", { name: "إرسال التقييم", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${ids.open}/rate\\?rated=1$`));
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  const receipt = main(page).getByRole("status").filter({ hasText: "تم إرسال تقييمك" });
  await expect(receipt).toBeVisible();
  await expect(receipt.getByRole("img", { name: "تقييم الجلسة: 5 نجوم" })).toBeVisible();
  await expect(receipt.getByRole("img", { name: "تقييم المُقدِّم: 4 نجوم" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "تحديث التقييم" })).toBeVisible();
  await capture(page, "submitted-390");
});

test("★ the survey stays: after the panel, before the bar, and the bar's label follows it", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.withSurvey}/rate`);
  const heading = main(page).getByRole("heading", { name: "استبانة الجلسة" });
  await expect(heading).toBeVisible();
  await expect(bar(page).getByRole("button", { name: /إرسال التقييم والإجابات/ })).toBeVisible();
  // DOM order: the panel, then the survey, then the bar.
  const order = await main(page).locator("form").evaluate((form) => {
    const panel = [...form.querySelectorAll("p")].find((p) => p.textContent?.includes("مجهول للمُقدِّم"))!;
    const survey = form.querySelector("#survey-heading")!;
    const group = form.querySelector('[role="group"][aria-label="إجراءات التقييم"]')!;
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [follows(panel, survey), follows(survey, group)];
  });
  expect(order).toEqual([true, true]);
  await capture(page, "survey-390");
});

test("closed: the rating read-only, the comment, the way back — and no bar", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.closed}/rate`);
  await expect(main(page).getByText("أُغلق باب التقييم لهذه الجلسة")).toBeVisible();
  await expect(main(page).getByRole("img", { name: "تقييم الجلسة: 4 نجوم" })).toBeVisible();
  await expect(main(page).getByRole("img", { name: "تقييم المُقدِّم: 5 نجوم" })).toBeVisible();
  await expect(main(page).getByText("مثال عملي واضح.")).toBeVisible();
  await expect(main(page).getByRole("radiogroup")).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
  await capture(page, "closed-390");
});

test("not eligible: the reason and the way back, no «حضرت», no form, no bar — never a 404", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.notAttended}/rate`);
  await expect(main(page).getByText("التقييم متاح لمن سجّل حضوره فقط")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "العودة إلى الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${ids.notAttended}`);
  await expect(main(page).locator("article").first()).not.toContainText("حضرت");
  await expect(main(page).getByRole("radiogroup")).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
  await capture(page, "not-eligible-390");
});

test("from lg the bar sits in flow at the end of the form (DEC-214 §3)", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/sessions/${ids.withSurvey}/rate`, DESKTOP);
  expect(await bar(page).evaluate((el) => getComputedStyle(el).position)).toBe("static");
  if (test.info().project.name === "phone") {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(SHOTS, "wave19-event-rate-open-1280.png"), fullPage: true });
  }
});
