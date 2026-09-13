// STORY-PRO-003 end to end — SCR-041 against REAL local Supabase.
// Run with `npm run test:e2e:local`.
//
// What this proves that the RLS suite cannot: the queue renders the proposal
// an admin has to judge, the two reasoned decisions cannot be taken without
// their reason, and the reason the admin typed is the text the proposer reads.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminUserId = "";
let adminEmail = "";
let memberUserId = "";
let memberEmail = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-rev-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاختبار', $1, 'ER', gen_random_uuid(), $2) returning id`,
    [`e2e-rev-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1,'فني'), ($1,'درس من تجربة')`, [orgId]);

  // `first_admin_email` is how provision_member() grants admin (DEC-035), so
  // the role is earned by the same path production will use, not by an UPDATE.
  const a = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة المؤسسة" } });
  if (a.error) throw a.error;
  adminUserId = a.data.user.id;

  memberEmail = `member@${domain}`;
  const m = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
  if (m.error) throw m.error;
  memberUserId = m.data.user.id;
});

test.afterAll(async () => {
  for (const id of [adminUserId, memberUserId]) if (id) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: who, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** A submitted proposal from the member, through the same route a member uses. */
async function memberProposes(context: BrowserContext, page: import("@playwright/test").Page, title: string) {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/propose");
  await page.getByLabel("عنوان الموضوع المقترح").fill(title);
  await page.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.");
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "درس من تجربة" });
  await page.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  return page.url().replace(/\?created=1$/, "");
}

test("a member cannot open the review queue at all", async ({ context, page }) => {
  await signIn(context, memberEmail);
  const response = await page.goto("/ar/app/admin/proposals");
  expect(response!.status()).toBe(404);
});

test("an admin approves, and approving does not publish (REQ-PRO-005)", async ({ context, page }) => {
  const title = "مقترح سيُعتمد";
  await memberProposes(context, page, title);

  const bossContext = await page.context().browser()!.newContext();
  await signIn(bossContext, adminEmail);
  const boss = await bossContext.newPage();
  await boss.goto("/ar/app/admin/proposals");
  await expect(boss.getByRole("heading", { name: title })).toBeVisible();
  await expect(boss.getByText("الاعتماد لا ينشر الجلسة").first()).toBeVisible();
  await boss.getByRole("button", { name: "اعتمد المقترح" }).first().click();
  await expect(boss.getByRole("heading", { name: title })).toHaveCount(0);
  await bossContext.close();

  const { rows } = await db.query<{ state: string }>(`select state from public.proposals where title = $1`, [title]);
  expect(rows[0].state).toBe("approved");
  // REQ-PRO-005: approving is not publishing. No session row exists yet.
  const sessions = await db.query(`select 1 from public.sessions s join public.proposals p on p.id = s.proposal_id where p.title = $1`, [title]);
  expect(sessions.rowCount).toBe(0);
});

test("a rejection needs a written reason, and that reason is what the proposer reads", async ({ context, page }) => {
  const title = "مقترح سيُرفض";
  const detailUrl = await memberProposes(context, page, title);
  const reason = "الموضوع مكرر مع جلسة الشهر الماضي — اقترح زاوية مختلفة.";

  const bossContext = await page.context().browser()!.newContext();
  await signIn(bossContext, adminEmail);
  const boss = await bossContext.newPage();
  await boss.goto("/ar/app/admin/proposals");
  const card = boss.locator("li", { has: boss.getByRole("heading", { name: title }) });

  // Sending with the box empty is refused, and the proposal does not move.
  await card.getByRole("group").filter({ hasText: "ارفض المقترح" }).getByText("ارفض المقترح").click();
  await card.getByRole("button", { name: "أرسل" }).last().click();
  await expect(boss.getByRole("alert")).toContainText("اكتب السبب أولًا");
  expect((await db.query<{ state: string }>(`select state from public.proposals where title = $1`, [title])).rows[0].state).toBe("submitted");

  await card.getByLabel("السبب الذي سيصل صاحب المقترح").last().fill(reason);
  await card.getByRole("button", { name: "أرسل" }).last().click();
  await expect(boss.getByRole("heading", { name: title })).toHaveCount(0);
  await bossContext.close();

  // The proposer reads the admin's own words, on their own proposal.
  await page.goto(detailUrl);
  await expect(page.getByText("ما كتبه المشرف")).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText("غير مقبول")).toBeVisible();
});

test("SCR-041 at 390 px RTL: the queue reads down the page and never sideways", async ({ context, page }) => {
  await memberProposes(context, page, "مقترح للقياس البصري");
  const bossContext = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  await signIn(bossContext, adminEmail);
  const boss = await bossContext.newPage();
  await boss.goto("/ar/app/admin/proposals");
  await expect(boss.locator("html")).toHaveAttribute("dir", "rtl");

  const overflow = await boss.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the queue must not scroll sideways at 390 px").toBeLessThanOrEqual(0);
  const box = await boss.getByRole("button", { name: "اعتمد المقترح" }).first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await boss.screenshot({ path: "test-results/scr-041-review-390-rtl.png", fullPage: true });
  await bossContext.close();
});
