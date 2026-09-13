// STORY-PRO-001 end to end — SCR-017 against REAL local Supabase.
// Run with `npm run test:e2e:local`; skipped without it, exactly as
// tests/e2e/session.spec.ts is (CI has no Supabase; the RLS suite covers the
// database there).
//
// What this proves that a unit test cannot: the Server Action round trip
// keeps the member's text, the row lands with the session's own org and
// proposer, and — the ★ — there is no date, time or venue control anywhere on
// the rendered page.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

// One org per worker, as session.spec.ts explains: the two device projects run
// in parallel workers and would tear down each other's fixture.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-pro-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EP', gen_random_uuid()) returning id`,
    [`e2e-pro-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // The four categories create_org() seeds — the same four the pre-launch
  // registration form offered.
  await db.query(
    `insert into public.categories (org_id, name) values ($1,'فني'), ($1,'إداري'), ($1,'إبداعي'), ($1,'درس من تجربة')`,
    [orgId],
  );
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
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
  expect(["provisioned", "member"]).toContain((envelope as { status: string }).status);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function fillProposal(page: Page, title: string) {
  await page.getByLabel("عنوان الموضوع المقترح").fill(title);
  await page.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.");
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "درس من تجربة" });
}

test("★ the propose form offers no date, time or venue control (REQ-PRO-001)", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("اقترح موضوعًا");

  // Not hidden — absent. Every input on the page, by type and by name.
  const types = await page.locator("form input, form select, form textarea").evaluateAll((els) =>
    els.map((e) => ({ type: (e as HTMLInputElement).type ?? e.tagName.toLowerCase(), name: (e as HTMLInputElement).name })),
  );
  expect(types.length).toBeGreaterThan(0);
  for (const { type, name } of types) {
    expect(["date", "time", "datetime-local", "week", "month"], `an input of type ${type} exists`).not.toContain(type);
    expect(name).not.toMatch(/date|time|venue|location|capacity|deadline|starts|ends/i);
  }
  // And the page says why, rather than leaving a member hunting for the box.
  await expect(page.getByText(/لا تحتاج لاختيار موعد أو مكان/)).toBeVisible();
});

test("a member submits a proposal and it lands with their org and their id", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const title = "كيف اختصرنا وقت إعداد التقارير إلى النصف";
  await fillProposal(page, title);
  await page.getByLabel("الفئة المستهدفة").fill("من يعدّون التقارير الشهرية");
  await page.getByLabel("المدة المتوقعة").fill("45");
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  await expect(page).toHaveURL(/\/ar\/app\/propose\?created=/);
  await expect(page.getByRole("status")).toContainText("وصلنا مقترحك");
  await expect(page.getByRole("status")).toContainText(title);

  const { rows } = await db.query<{ state: string; org_id: string; proposer_id: string; expected_duration_minutes: number }>(
    `select p.state, p.org_id, p.proposer_id, p.expected_duration_minutes
       from public.proposals p join public.members m on m.id = p.proposer_id
      where p.title = $1 and m.auth_user_id = $2`,
    [title, userId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].state).toBe("submitted");
  expect(rows[0].org_id).toBe(orgId);
  expect(rows[0].expected_duration_minutes).toBe(45);
});

test("saving a draft does not put it in front of an admin", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const title = "فكرة ما زالت تنضج";
  await fillProposal(page, title);
  await page.getByRole("button", { name: "احفظ كمسودة" }).click();

  await expect(page.getByRole("status")).toContainText("حُفظ مقترحك كمسودة");
  const { rows } = await db.query<{ state: string }>(`select state from public.proposals where title = $1`, [title]);
  expect(rows[0].state).toBe("draft");
});

test("a rejected submission keeps every word the member typed", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const abstract = "نبذة طويلة كتبتها بعناية ولا أريد أن أفقدها لأن العنوان كان قصيرًا.";
  await page.getByLabel("عنوان الموضوع المقترح").fill("ق"); // below the 3-character floor
  await page.getByLabel("نبذة عن موضوعك").fill(abstract);
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "فني" });
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  await expect(page.getByRole("alert")).toContainText("يرجى تصحيح الأخطاء التالية");
  await expect(page.getByRole("alert")).toContainText("العنوان قصير جدًا");
  // ★ The abstract survives the round trip — the form's own promise.
  await expect(page.getByLabel("نبذة عن موضوعك")).toHaveValue(abstract);
  await expect(page.getByLabel("عنوان الموضوع المقترح")).toHaveValue("ق");
  expect((await db.query(`select 1 from public.proposals where abstract = $1`, [abstract])).rowCount).toBe(0);
});

test("SCR-017 at 390 px RTL: no horizontal scroll, and the primary action is ≥ 44 px", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/app/propose");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll sideways at 390 px").toBeLessThanOrEqual(0);

  const submit = page.getByRole("button", { name: "أرسل المقترح" });
  const box = await submit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // The reviewed screenshot of the definition of done.
  await page.screenshot({ path: "test-results/scr-017-propose-390-rtl.png", fullPage: true });
});
