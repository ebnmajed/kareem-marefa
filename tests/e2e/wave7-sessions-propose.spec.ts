// SCR-017 on the M9 system, wave 7 — the review captures, and the form model
// through a real browser: blur checks a field the server did not refuse, the
// summary counts and reassures, and a failed submit keeps what was typed
// (REQ-UIX-009 … 011, `16` §8.2, DEC-141).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-propose-empty.png · -error.png · -submitted.png
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

// The page streams several reads after a navigation or an action; five seconds
// measured the machine, not the page.
const expect = baseExpect.configure({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w7-propose-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاقتراحات', $1, 'WP', gen_random_uuid()) returning id`,
    [`e2e-w7-propose-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1,'فني'), ($1,'إداري'), ($1,'درس من تجربة')`, [orgId]);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userId = data.user.id;
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

/** React's hidden streamed copy of a section is counted by strict locators until its swap runs (`185fbb1`). */
async function streamed(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/** The proposal form, not the shell's search or sign-out forms. */
const proposalForm = (page: Page) => page.locator("form[novalidate]");

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-propose-${name}.png`), fullPage: true });
  }
}

test("empty: two sections, «المتبقّي» counting three, and no date, time or venue", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/propose");
  await streamed(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("اقترح موضوعًا");
  await expect(page.getByRole("heading", { level: 2, name: "الموضوع" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "المُقدِّمون والملاحظات" })).toBeVisible();
  await expect(page.getByText("المتبقّي: 3 حقول مطلوبة")).toBeVisible();
  await expect(proposalForm(page).locator('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
  // Nothing is invalid before a submit (REQ-UIX-011).
  await page.getByLabel("عنوان الموضوع المقترح").click();
  await page.getByLabel("نبذة عن موضوعك").click();
  await expect(page.locator("#title-error")).toHaveCount(0);

  await capture(page, "empty");
});

test("error: the summary counts, reassures and takes focus; blur checks a field the server did not refuse; typed text stays", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/propose");
  await streamed(page);

  const abstract = "تجربة عملية استغرقت ثلاثة أشهر، وما تعلّمناه منها.";
  await page.getByLabel("نبذة عن موضوعك").fill(abstract);
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  const summary = proposalForm(page).locator("[role=alert]");
  await expect(summary).toContainText("لم نستطع إرسال المقترح — حقلان يحتاجان تصحيحًا");
  await expect(summary).toContainText("ما كتبته محفوظ كما هو");
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(2);
  await expect(page.getByLabel("نبذة عن موضوعك")).toHaveValue(abstract);

  await expect(summary).toContainText("اضغط على أيٍّ منهما للانتقال إليه.");

  // ★ The duration was never refused; a bad one typed now is caught on blur —
  // and joins the summary, which lists exactly the errors on the page (sync 2).
  const duration = page.getByLabel("المدة المتوقعة");
  await duration.fill("5");
  await duration.blur();
  await expect(page.locator("#expectedDurationMinutes-error")).toBeVisible();
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(summary).toContainText("لم نستطع إرسال المقترح — 3 حقول تحتاج تصحيحًا");
  await expect(summary.getByRole("link")).toHaveCount(3);

  await summary.scrollIntoViewIfNeeded();
  await capture(page, "error");
});

test("submitted: the round trip lands on the proposal with its receipt", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/propose");
  await streamed(page);

  const title = "كيف اختصرنا وقت إعداد التقارير إلى النصف";
  await page.getByLabel("عنوان الموضوع المقترح").fill(title);
  await page.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلّمناه منها.");
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "فني" });
  await expect(page.getByText("اكتملت الحقول المطلوبة")).toBeVisible();
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  await expect(page).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  await streamed(page);
  await expect(page.getByRole("status").filter({ hasText: "وصلنا مقترحك" })).toBeVisible();

  await capture(page, "submitted");
});
