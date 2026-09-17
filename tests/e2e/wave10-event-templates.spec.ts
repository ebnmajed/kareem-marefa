// SCR-065 · /app/admin/surveys — the templates an org reuses (REQ-SUR-001,
// REQ-SUR-002, REQ-DSG-028, SC 2.5.7, DEC-160 §5).
//
// ★ ORDER BY TAPS ALONE, AND THE SPEC USES `click()` ONLY. No drag, no keyboard
// shortcut, no pointer gymnastics — the same gesture a member of staff makes on
// a phone, which is the whole reason `ui/reorderable-list` exists.
//
// Captures: wave10-event-templates-empty.png · -templates-list.png
//           · -templates-editor-moved.png
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

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w10-tpl-${tag}.example`;
  orgId = (
    await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القوالب', $1, 'WT', gen_random_uuid()) returning id`,
      [`e2e-w10-tpl-${tag}`],
    )
  ).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  email = `mod@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "منى المطيري" } });
  if (error) throw error;
  userId = data.user.id;
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const memberId = ((await client.rpc("provision_member")).data as { member_id: string }).member_id;
  // ★ A MODERATOR, not an admin: the survey's audience is both (REQ-SUR-005),
  // and the screen that only an admin could reach would be a defect nobody saw.
  await db.query(`update public.members set org_role = 'moderator', claims_version = claims_version + 1 where id = $1`, [memberId]);
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

test("empty: no templates yet, and the way out is the only thing on the screen", async ({ context, page }) => {
  await signIn(context);
  await open(page, "/ar/app/admin/surveys");

  await expect(main(page).getByRole("heading", { name: "الاستبانات" })).toBeVisible();
  await expect(main(page).getByText("لا قوالب بعد")).toBeVisible();
  await capture(page, "templates-empty");
});

test("★ a moderator writes a template, moves a question with ONE CLICK, and saves what the list then shows", async ({ context, page }) => {
  await signIn(context);
  await open(page, "/ar/app/admin/surveys/new");

  await main(page).getByLabel(/اسم القالب/).fill("استبانة ما بعد الجلسة");

  const add = main(page).getByRole("button", { name: "أضف سؤالًا" });
  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(0).fill("ما مدى وضوح المحتوى؟");
  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(1).fill("ماذا تقترح للجلسة القادمة؟");
  await main(page).getByLabel(/نوع السؤال/).nth(1).selectOption("free_text");
  await add.click();
  await main(page).getByLabel(/نص السؤال/).nth(2).fill("هل كانت المدة مناسبة؟");
  await main(page).getByLabel(/نوع السؤال/).nth(2).selectOption("single_choice");
  const options = main(page).getByLabel(/نص الخيار/);
  await options.nth(0).fill("مناسبة");
  await options.nth(1).fill("طويلة");

  // ★ ONE CLICK on ▼ moves the second question down. `getByRole` inside the row
  // would find the nested option list's arrows too, so the row's own controls
  // are the last element of the row.
  const rows = main(page).getByRole("list", { name: "أسئلة الاستبانة" }).locator("> li");
  await rows.nth(1).locator("> div").last().getByRole("button", { name: "انقل لأسفل" }).click();
  await expect(main(page).getByLabel(/نص السؤال/).nth(1)).toHaveValue("هل كانت المدة مناسبة؟");
  await expect(main(page).getByLabel(/نص السؤال/).nth(2)).toHaveValue("ماذا تقترح للجلسة القادمة؟");
  // The move is announced, naming the row and its new position in Western digits.
  await expect(main(page).getByRole("status")).toContainText("إلى الموضع 3 من 3");
  await capture(page, "templates-editor-moved");

  await main(page).getByRole("button", { name: "حفظ القالب" }).click();
  await expect(page).toHaveURL(/\/app\/admin\/surveys\/[0-9a-f-]{36}/);

  // ★ The order the screen showed is the order the database stored — and the
  // positions are the database's own 1…n, never the browser's.
  const stored = await db.query<{ position: number; prompt: string }>(
    `select q.position, q.prompt from public.survey_template_questions q
       join public.survey_templates t on t.id = q.template_id
      where t.org_id = $1 order by q.position`,
    [orgId],
  );
  expect(stored.rows.map((r) => [r.position, r.prompt])).toEqual([
    [1, "ما مدى وضوح المحتوى؟"],
    [2, "هل كانت المدة مناسبة؟"],
    [3, "ماذا تقترح للجلسة القادمة؟"],
  ]);

  await open(page, "/ar/app/admin/surveys");
  await expect(main(page).getByText("استبانة ما بعد الجلسة")).toBeVisible();
  await expect(main(page).getByText(/3 أسئلة/)).toBeVisible();
  await expect(main(page).getByText(/لم تُستخدم بعد/)).toBeVisible();
  await capture(page, "templates-list");
});

test("a member who is not staff cannot reach the templates at all", async ({ context, page }) => {
  // The same person, demoted between the two visits: the screen is gone, and it
  // is the DAL's guard and the policy that took it away, not a hidden link.
  const memberRow = await db.query<{ id: string }>(`select id from public.members where org_id = $1`, [orgId]);
  await db.query(`update public.members set org_role = 'member', claims_version = claims_version + 1 where id = $1`, [memberRow.rows[0].id]);
  await signIn(context);
  await open(page, "/ar/app/admin/surveys");
  await expect(main(page).getByRole("heading", { name: "الاستبانات" })).toHaveCount(0);
  await db.query(`update public.members set org_role = 'moderator', claims_version = claims_version + 1 where id = $1`, [memberRow.rows[0].id]);
});
