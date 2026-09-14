// The Tasks slot against REAL local Supabase (STORY-TSK-001/002).
// session_tasks/task_completions/task_form_responses need no worker at all
// (REQ-TSK-002: reminder-only, nothing async here) — every assertion below
// exercises the real RLS-gated tables through the real app.
//
// Same shape as tests/e2e/materials.spec.ts / photos.spec.ts.
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
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let checklistTaskId = "";
let presenterEmail = "";
let memberEmail = "";
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
  domain = `tasks-e2e-${tag}.example`;
  presenterEmail = `presenter@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المهام', $1, 'TK', gen_random_uuid()) returning id`,
    [`tasks-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة اختبار المهام', 'ملخص الجلسة', $2, 'introductory', now() + interval '2 days', 60, now() + interval '2 days' + interval '1 hour',
             $3, 30, now() + interval '1 day', now() + interval '1 day', 'published', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [presenterEmail, "مقدّم الاختبار"],
    [memberEmail, "عضو الاختبار"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const presenterMemberId = await provisionMemberId(presenterEmail);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterMemberId]);

  const { rows: taskRows } = await db.query<{ id: string }>(
    `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'أحضر جهازك المحمول') returning id`,
    [orgId, sessionId],
  );
  checklistTaskId = taskRows[0].id;
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("★ REQ-TSK-004: a member marks a checklist task done, and it persists across a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "مهام ما قبل الجلسة", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText("أحضر جهازك المحمول")).toBeVisible();

  await page.getByRole("button", { name: "أنجزتها" }).click();
  await expect(page.getByRole("button", { name: "التراجع عن الإنجاز" })).toBeVisible();
  await review(page, "tasks-event-page");

  await page.reload();
  await expect(page.getByRole("button", { name: "التراجع عن الإنجاز" })).toBeVisible();

  const { rows } = await db.query(`select 1 from public.task_completions where task_id = $1`, [checklistTaskId]);
  expect(rows.length).toBe(1);
});

test("★ REQ-TSK-001/002: the presenter adds an external task through the inline form; it is a reminder only — check-in path never consults it", async ({ context, page }) => {
  await signIn(context, presenterEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);

  await page.getByLabel("نوع المهمة").selectOption("external");
  await page.getByLabel("عنوان المهمة").fill("ثبّت التطبيق قبل الحضور");
  await page.getByLabel("الرابط").fill("https://example.com/app");
  await page.getByRole("button", { name: "إضافة" }).click();

  await expect(page.getByText("ثبّت التطبيق قبل الحضور")).toBeVisible();
  await expect(page.getByRole("link", { name: "فتح الرابط — يغادر المنصة" })).toHaveAttribute("href", "https://example.com/app");

  // REQ-TSK-002, made structural: no scoring catalogue entry names a task
  // action, and no check-in RPC reads task_completions at all — proven at
  // the RLS/schema level already; this just confirms the new task exists
  // and completion is still purely self-declared, never a gate.
  const { rows } = await db.query<{ kind: string }>(`select kind from public.session_tasks where session_id = $1 and title = $2`, [sessionId, "ثبّت التطبيق قبل الحضور"]);
  expect(rows[0].kind).toBe("external");
});
