// SCR-041 · /app/admin/proposals, rebuilt onto the system (wave 6, `16` §6.7,
// `DEC-130`). `tests/e2e/sessions-admin-proposals.spec.ts` (wave 1's file,
// not this track's) already proves the full propose → decide → the proposer
// reads it round trip; this file proves what changed this wave and that file
// does not cover: the PageHeader, the empty state, and REQ-UIX-013's reject
// confirmation — a dialog naming the proposal, portalled outside the
// `<details>` it opens from, submitting the SAME form via `form={id}`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let proposerEmail = "";
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
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
  const domain = `admin-props-${tag}.example`;
  adminEmail = `boss@${domain}`;
  proposerEmail = `presenter@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة المراجعة', $1, 'AP', gen_random_uuid(), $2) returning id`,
    [`admin-props-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // `proposals.category_id` has been NOT NULL since 0010 — found on a real
  // build (the lead's), not by reading the schema first.
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف المراجعة') returning id`, [orgId]);

  for (const email of [adminEmail, proposerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: email === adminEmail ? "مشرفة المراجعة" : "مقدّمة المقترح" } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provisionMemberId(adminEmail);
  const proposerId = await provisionMemberId(proposerEmail);
  await db.query(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state) values ($1, $2, 'مقترح للمراجعة', 'ملخص المقترح الذي سيُراجَع', $3, 'introductory', 'submitted')`,
    [orgId, proposerId, catRows[0].id],
  );
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ DEC-145: every locator on the page itself scopes to `#main`. A streamed
// segment React has not yet swapped in is a hidden `<div id="S:…">` at the end
// of `<body>` holding a second copy of the same text, and a page-wide
// `getByText` matched both (the final gate at 5bf0327, phone). Dialogs and
// toasts are portalled outside `#main` and stay page-wide.
test("the page header carries the title and intro, and the queue count reads correctly", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/proposals");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "مراجعة المقترحات", level: 1 })).toBeVisible();
  // ★ Two separate strings, not one combined sentence: the queue count under
  // the intro is a plain number ("admin.proposals.count", every ICU form),
  // deliberately not "N awaiting review" — the queue mixes submitted and
  // in_review proposals, and only the per-card line ("state.submitted" ·
  // "age") names a specific proposal's own state. This test's old combined
  // string never existed after the wave-6 rebuild; checking both separately
  // is what the page actually renders.
  await expect(main.getByText("مقترح واحد")).toBeVisible();
  const card = main.locator("li", { has: page.getByRole("heading", { name: "مقترح للمراجعة" }) });
  await expect(card.getByText("بانتظار المراجعة", { exact: false })).toBeVisible();
});

test("★ rejecting confirms in a dialog naming the proposal — cancel changes nothing, confirm submits", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/proposals");
  const main = page.locator("#main");
  const card = main.locator("li", { has: page.getByRole("heading", { name: "مقترح للمراجعة" }) });
  await card.getByText("ارفض المقترح").click();
  // ★ A real build's own run found this a strict-mode violation: both the
  // reject AND request-changes boxes shared one label. Each now names its
  // own decision (review-card.tsx's `reasonLabelReject`/
  // `reasonLabelRequestChanges`), so this resolves to exactly one.
  await card.getByLabel("سبب الرفض الذي سيصل صاحب المقترح").fill("سبب الرفض لهذا الاختبار");
  await card.getByRole("button", { name: "أرسل" }).last().click();

  const dialog = page.getByRole("dialog", { name: "رفض «مقترح للمراجعة»؟" });
  await expect(dialog).toBeVisible();

  // Cancel: the dialog closes, nothing was submitted, the proposal is still in the queue.
  await dialog.getByRole("button", { name: "تراجع" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "مقترح للمراجعة" })).toBeVisible();
  expect((await db.query<{ state: string }>(`select state from public.proposals where org_id = $1`, [orgId])).rows[0].state).toBe("submitted");

  // Confirm: submits the SAME form (the dialog's button is portalled outside
  // the <details> it opened from — form={id} is what makes this work at all).
  // The <details> itself is untouched by cancelling the dialog — still open
  // from the click above, its typed reason still in the textarea — so this
  // does NOT re-click the summary (that would toggle it closed).
  await card.getByRole("button", { name: "أرسل" }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الرفض" }).click();
  await expect(main.getByRole("heading", { name: "مقترح للمراجعة" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("سُجّل قرارك ووصل صاحب المقترح");
  expect((await db.query<{ state: string }>(`select state from public.proposals where org_id = $1`, [orgId])).rows[0].state).toBe("rejected");
});

test("the empty state names the next action once every proposal has a decision", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/proposals");
  const main = page.locator("#main");
  await expect(main.getByText("لا مقترحات تنتظر المراجعة الآن.")).toBeVisible();
  await main.getByRole("link", { name: "العودة إلى اللوحة" }).click();
  await expect(main.getByRole("heading", { name: "لوحة المؤسسة", level: 1 })).toBeVisible();
});
