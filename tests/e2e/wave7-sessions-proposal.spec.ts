// SCR-018 on the M9 system, wave 7 — my proposal: its state on the shared
// status vocabulary, the reviewer's reason where there is one, and the edit
// path where the state allows it (REQ-PRO-005, REQ-PRO-006, REQ-PRO-008,
// DEC-141 rulings 1 and 14).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR` or `.qa-shots/rtl`):
//   wave7-sessions-proposal-pending.png · -changes.png · -rejected.png · -edit.png
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
const REASON = "الفكرة جيدة، لكن النبذة تحتاج مثالًا واحدًا من عملك.";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
const userIds: string[] = [];
const ids = { submitted: "", changes: "", rejected: "" };

async function provisionMemberId(address: string): Promise<string> {
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
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-w7-proposal-${tag}.example`;
  const org = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المقترحات', $1, 'WQ', gen_random_uuid()) returning id`,
    [`e2e-w7-proposal-${tag}`],
  );
  orgId = org.rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);

  email = `proposer@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const memberId = await provisionMemberId(email);

  // Born a draft with its presenter row — `proposal_presenters_addable` (0012)
  // refuses a presenter on a decided proposal — then walked along 0011's legal
  // edges to the state the test needs, the reason written with the decision.
  const proposal = async (title: string, path: string[], reason: string | null) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, target_audience, expected_duration_minutes, state)
       values ($1, $2, $3, 'تجربة عملية استغرقت ثلاثة أشهر، وما تعلّمناه منها.', $4, 'intermediate', 'من يعدّون التقارير الشهرية', 45, 'draft')
       returning id`,
      [orgId, memberId, title, category.rows[0].id],
    );
    await db.query(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, rows[0].id, memberId]);
    for (const state of path) {
      const decided = state === "changes_requested" || state === "rejected";
      await db.query(`update public.proposals set state = $2::public.proposal_state, decision_reason = $3 where id = $1`, [rows[0].id, state, decided ? reason : null]);
    }
    return rows[0].id;
  };
  ids.submitted = await proposal("كيف اختصرنا وقت التقارير الشهرية", ["submitted"], null);
  ids.changes = await proposal("أتمتة الفواتير بلا برمجة", ["submitted", "in_review", "changes_requested"], REASON);
  ids.rejected = await proposal("مقدمة في كل شيء", ["submitted", "in_review", "rejected"], "الموضوع أوسع من جلسة واحدة.");
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
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: join(SHOTS, `wave7-sessions-proposal-${name}.png`), fullPage: true });
  }
}

test("pending: the state badge, what happens next, no edit and no stale reason", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/propose/${ids.submitted}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("كيف اختصرنا وقت التقارير الشهرية");
  await expect(page.getByText("بانتظار المراجعة", { exact: true })).toBeVisible();
  await expect(page.getByText("سيصلك إشعار حين يقرّر المشرف.")).toBeVisible();
  await expect(page.getByRole("link", { name: /عدّل مقترحك|أكمل مقترحك/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ما كتبه المشرف" })).toHaveCount(0);

  await capture(page, "pending");
});

test("changes requested: the reviewer's reason and the primary edit action", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/propose/${ids.changes}`);

  await expect(page.getByText("بانتظار تعديلك", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ما كتبه المشرف" })).toBeVisible();
  await expect(page.getByText(REASON)).toBeVisible();
  await expect(page.getByRole("link", { name: "عدّل مقترحك" })).toHaveAttribute("href", `/ar/app/propose/${ids.changes}/edit`);

  await capture(page, "changes");
});

test("rejected: the reason, and nothing to edit", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/propose/${ids.rejected}`);

  await expect(page.getByText("غير مقبول", { exact: true })).toBeVisible();
  await expect(page.getByText("الموضوع أوسع من جلسة واحدة.")).toBeVisible();
  await expect(page.getByRole("link", { name: /عدّل مقترحك|أكمل مقترحك/ })).toHaveCount(0);

  await capture(page, "rejected");
});

test("edit: a change request is answered by resubmitting — pre-filled, one action, and the reason stops showing", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/propose/${ids.changes}/edit`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تعديل المقترح");
  await expect(page.getByText(REASON)).toBeVisible();
  await expect(page.getByLabel("عنوان الموضوع المقترح")).toHaveValue("أتمتة الفواتير بلا برمجة");
  await expect(page.getByLabel("الفئة المستهدفة")).toHaveValue("من يعدّون التقارير الشهرية");
  await expect(page.getByLabel("المدة المتوقعة")).toHaveValue("45");
  // A change request cannot go back to a draft (0011's guard), so it is not offered.
  await expect(page.getByRole("button", { name: "احفظ كمسودة" })).toHaveCount(0);
  await capture(page, "edit");

  await page.getByLabel("نبذة عن موضوعك").fill("مثال من عملنا: فواتير الموردين الشهرية، من أربعة أيام إلى ساعتين.");
  await page.getByRole("button", { name: "أعد إرسال المقترح" }).click();

  await expect(page).toHaveURL(new RegExp(`/ar/app/propose/${ids.changes}\\?updated=submitted$`));
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "أُرسل مقترحك للمراجعة" })).toBeVisible();
  await expect(page.getByText("بانتظار المراجعة", { exact: true })).toBeVisible();
  // ★ `decision_reason` is still in the row — only approval clears it — and the page no longer shows it.
  await expect(page.getByText(REASON)).toHaveCount(0);

  const { rows } = await db.query<{ state: string; abstract: string }>(`select state, abstract from public.proposals where id = $1`, [ids.changes]);
  expect(rows[0].state).toBe("submitted");
  expect(rows[0].abstract).toContain("من أربعة أيام إلى ساعتين");
});

test("the edit page is not there for a state that cannot be edited", async ({ context, page }) => {
  await signIn(context);
  await open(page, `/ar/app/propose/${ids.rejected}/edit`);
  await expect(page.getByLabel("عنوان الموضوع المقترح")).toHaveCount(0);
  // Several robots metas are expected — the layout's and the one Next adds on
  // `notFound()` (DEC-134). Every one must say noindex.
  const robots = await page.locator('meta[name="robots"]').all();
  expect(robots.length).toBeGreaterThan(0);
  for (const meta of robots) await expect(meta).toHaveAttribute("content", /noindex/);
});
