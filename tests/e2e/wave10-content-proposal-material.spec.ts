// content, wave 10 T1 (DEC-155, DEC-160 §6) — REQ-PRO-004: a proposal's own material, downloaded.
// New file (rule 3) — `tests/e2e/proposal-materials.spec.ts` (transferred from `sessions`, `DEC-160`)
// already proves the upload flow and the row-level visibility rule and is not touched; nothing here
// duplicates its assertions. This is the first e2e in the product that ever clicks a materials
// download button at all (`materials.spec.ts:121`'s own comment: "not exercised by this spec") —
// against `material_versions_read`/`materials_storage_read` together (proposed/content/0001),
// through the real Route Handler/Server Action and real Storage (`0054`'s lesson).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let proposalId = "";
let proposerEmail = "";
let adminEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `propdl-e2e-${tag}.example`;
  proposerEmail = `proposer@${domain}`;
  adminEmail = `admin@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة تنزيل المقترح', $1, 'PD', gen_random_uuid()) returning id`,
    [`propdl-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);

  for (const [email, name] of [
    [proposerEmail, "صاحب مقترح التنزيل"],
    [adminEmail, "مشرف مراجعة المقترح"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  async function provisionMemberId(email: string): Promise<string> {
    const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    const { data, error: rpcError } = await client.rpc("provision_member");
    if (rpcError) throw rpcError;
    return (data as { member_id: string }).member_id;
  }
  const proposerMemberId = await provisionMemberId(proposerEmail);
  const adminMemberId = await provisionMemberId(adminEmail);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminMemberId]);

  // EMPTY: a fresh draft proposal, no material attached yet — the upload below is this test's own
  // first write, matching DEC-159's "a demonstrable starts from nothing".
  const { rows: propRows } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, 'اقتراح جلسة عن تنزيل المواد', 'ملخص المقترح', $3, 'intermediate', 'draft') returning id`,
    [orgId, proposerMemberId, catRows[0].id],
  );
  proposalId = propRows[0].id;
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

/** React's hidden streamed copy of a section (`body > div[hidden][id^="S:"]`) stays beside the
 *  visible one until its swap script runs — `proposal-materials.spec.ts`'s own helper, copied. */
async function waitForStreamsToSettle(p: Page) {
  await expect(p.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/** 390 px, `#main`-scoped (DEC-145's orphaned streaming segment duplicates ids on desktop) — the
 *  DoD's own capture, taken BEFORE the download click navigates the tab away from the app. */
async function review(page: Page, name: string) {
  const project = test.info().project.name;
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: `${SHOTS}/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("★ REQ-PRO-004: the proposer uploads a draft material, then downloads it through the real route and real Storage", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, proposerEmail);
  await page.goto(`/ar/app/propose/${proposalId}`);
  await waitForStreamsToSettle(page);

  const main = page.locator("#main");
  await page.getByLabel("نوع المادة").selectOption("image");
  await page.getByLabel("عنوان المادة").fill("صورة قابلة للتنزيل");
  await page.locator('input[type="file"]').setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByRole("button", { name: "رفع" }).click();
  await expect(main.getByText("صورة قابلة للتنزيل")).toBeVisible();

  const downloadButton = main.getByRole("button", { name: "تحميل", exact: true });
  await expect(downloadButton).toBeVisible();
  await review(page, "wave10-content-proposal-material-proposer");

  await downloadButton.click();
  // A denial (RLS false negative) shows the failure toast instead of navigating — assert its
  // absence explicitly, `{ exact: true }` per the house toast's own text-match rule, alongside the
  // real navigation this proves.
  await expect(main.getByText("التحميل غير متاح لهذه المادة.", { exact: true })).toHaveCount(0);
  await page.waitForURL(/\/storage\/v1\/object\/sign\/materials\//);
  expect(page.url()).toContain(`${orgId}/proposals/${proposalId}/materials/`);
});

test("★ REQ-PRO-004: an admin on the review screen downloads the same file, unrelated to the proposal", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/propose/${proposalId}`);
  await waitForStreamsToSettle(page);

  const main = page.locator("#main");
  await expect(main.getByText("صورة قابلة للتنزيل")).toBeVisible();
  const downloadButton = main.getByRole("button", { name: "تحميل", exact: true });
  await expect(downloadButton).toBeVisible();
  await review(page, "wave10-content-proposal-material-admin");

  await downloadButton.click();
  await expect(main.getByText("التحميل غير متاح لهذه المادة.", { exact: true })).toHaveCount(0);
  await page.waitForURL(/\/storage\/v1\/object\/sign\/materials\//);
  expect(page.url()).toContain(`${orgId}/proposals/${proposalId}/materials/`);

  // REQ-MAT-005: an admin's download is audited (record_material_download(), 0049) — unchanged by
  // this file, re-asserted here because this is the first time a proposal's material ever exercises
  // that RPC through the real UI rather than being called directly in an RLS test. This org is
  // freshly created for this spec alone and this is its only admin download, so a plain count — not
  // an "ORDER BY id DESC" guess at "the last row" (a UUID PK is not chronological, CLAUDE.md) —
  // is exactly one row.
  const { rows } = await db.query<{ count: string }>(
    `select count(*) from public.audit_log where org_id = $1 and action = 'material.downloaded'`,
    [orgId],
  );
  expect(Number(rows[0].count)).toBe(1);
});
