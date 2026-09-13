// The 390 px RTL review of every screen this track adds, taken by walking
// M2's demonstrable through the real screens rather than seeding rows:
// add a venue → propose → approve → create the session → schedule → publish
// → open the event page.
//
// Screens captured: SCR-046 venues, SCR-018 my proposal, SCR-042 sessions,
// SCR-043 schedule and publish, SCR-012 the event page. SCR-017 and SCR-041
// have their own captures in sessions-propose and sessions-admin-proposals.
//
// Every capture is paired with the two things a screenshot review cannot
// judge: that the page does not scroll sideways at 390 px, and that its
// primary action is at least 44 px tall (REQ-SES-013, REQ-NFR-009).
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

// One org per worker, and the whole walk is one ordered story.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let memberEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-scr-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاختبار', $1, 'ES', gen_random_uuid(), $2) returning id`,
    [`e2e-scr-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1,'فني'), ($1,'درس من تجربة')`, [orgId]);

  for (const [email, name] of [
    [adminEmail, "مشرفة المؤسسة"],
    [memberEmail, "عضو الاختبار"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
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

/** A 390 px RTL page signed in as `who`. */
async function phone(page: Page, who: string): Promise<Page> {
  const context = await page.context().browser()!.newContext({ viewport: PHONE, locale: "ar-SA" });
  await signIn(context, who);
  return context.newPage();
}

/**
 * The half of a 390 px review a screenshot cannot do. `scrollWidth` past
 * `clientWidth` is the failure that makes an RTL page feel broken, and it is
 * invisible in a full-page capture because the capture widens to fit.
 */
async function review(p: Page, name: string, primary?: string) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
  if (primary) {
    const box = (await p.getByRole("button", { name: primary }).first().boundingBox())!;
    expect(box.height, `${name}: the primary action must be at least 44 px tall`).toBeGreaterThanOrEqual(44);
  }
  await p.screenshot({ path: `test-results/${name}-390-rtl.png`, fullPage: true });
}

test("the demonstrable, screen by screen, at 390 px RTL", async ({ page }) => {
  test.slow(); // six screens and two sign-ins

  // ── SCR-046 · venues ──────────────────────────────────────────────────────
  const boss = await phone(page, adminEmail);
  await boss.goto("/ar/app/admin/venues");
  await expect(boss.getByRole("heading", { level: 1 })).toHaveText("الأماكن");
  await boss.getByLabel("الاسم").fill("قاعة الابتكار");
  await boss.getByLabel("العنوان").fill("الدور الثالث، مبنى الإدارة");
  await boss.getByLabel("السعة").fill("30");
  await boss.getByRole("button", { name: "أضف المكان" }).click();
  await expect(boss.getByText("قاعة الابتكار")).toBeVisible();
  // REQ-SES-006: there is no delete control at all, and the page says why.
  await expect(boss.getByRole("button", { name: /احذف/ })).toHaveCount(0);
  await expect(boss.getByText(/لا يمكن حذف مكان/)).toBeVisible();
  await review(boss, "scr-046-venues", "أضف المكان");

  // ── SCR-018 · my proposal ─────────────────────────────────────────────────
  const member = await phone(page, memberEmail);
  await member.goto("/ar/app/propose");
  const title = "كيف اختصرنا وقت إعداد التقارير إلى النصف";
  await member.getByLabel("عنوان الموضوع المقترح").fill(title);
  await member.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.");
  await member.getByLabel("تصنيف الموضوع").selectOption({ label: "درس من تجربة" });
  await member.getByLabel("المدة المتوقعة").fill("45");
  await member.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(member).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  await expect(member.getByRole("status")).toContainText("وصلنا مقترحك");
  await review(member, "scr-018-my-proposal");

  // ── SCR-041 → approve ─────────────────────────────────────────────────────
  await boss.goto("/ar/app/admin/proposals");
  await boss.getByRole("button", { name: "اعتمد المقترح" }).first().click();
  await expect(boss.getByRole("heading", { name: title })).toHaveCount(0);

  // ── SCR-042 · sessions ────────────────────────────────────────────────────
  await boss.goto("/ar/app/admin/sessions");
  await expect(boss.getByText(title)).toBeVisible(); // waiting under «جاهزة للجدولة»
  await review(boss, "scr-042-sessions", "أنشئ الجلسة");
  await boss.getByRole("button", { name: "أنشئ الجلسة" }).first().click();
  await expect(boss.getByText("لا مقترحات معتمدة تنتظر.")).toBeVisible();

  const { rows } = await db.query<{ id: string }>(`select id from public.sessions where org_id = $1`, [orgId]);
  expect(rows).toHaveLength(1);
  const sessionId = rows[0].id;

  // ── SCR-043 · schedule and publish ────────────────────────────────────────
  await boss.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  // Incomplete first: REQ-SES-001's gate, naming what is missing.
  await expect(boss.getByText("لا يمكن النشر بعد — ينقص:")).toBeVisible();
  await expect(boss.getByRole("button", { name: "انشر الجلسة" })).toBeDisabled();
  await review(boss, "scr-043-schedule", "احفظ الجدولة");

  const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const local = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}T18:00`;
  await boss.getByLabel("التاريخ والوقت").fill(local);
  await boss.getByLabel("المدة").fill("60");
  await boss.getByLabel("المكان", { exact: true }).selectOption({ label: "قاعة الابتكار" });
  await boss.getByRole("button", { name: "احفظ الجدولة" }).click();
  await expect(boss.getByRole("status")).toContainText("حُفظت الجدولة");

  // The gate is satisfied now, so the control is live.
  await expect(boss.getByText("لا يمكن النشر بعد — ينقص:")).toHaveCount(0);
  await boss.getByRole("button", { name: "انشر الجلسة" }).click();
  await expect(boss.getByRole("status").filter({ hasText: "نُشرت الجلسة" })).toBeVisible();

  // 02 §6.2's chain, walked rather than jumped.
  const transitions = await db.query<{ from_state: string | null; to_state: string }>(
    `select from_state, to_state from public.session_state_transitions where session_id = $1 order by occurred_at, ctid`,
    [sessionId],
  );
  expect(transitions.rows.map((r) => `${r.from_state}→${r.to_state}`)).toEqual([
    "null→draft",
    "draft→submitted",
    "submitted→in_review",
    "in_review→approved",
    "approved→published",
  ]);

  // ── SCR-012 · the event page ──────────────────────────────────────────────
  await member.goto(`/ar/app/sessions/${sessionId}`);
  await expect(member.getByRole("heading", { level: 1 })).toContainText(title);
  await expect(member.getByText("قاعة الابتكار")).toBeVisible();
  // REQ-SES-008: no remote-attendance affordance anywhere on the page.
  await expect(member.getByText(/بث|رابط الانضمام|عن بعد|أونلاين/)).toHaveCount(0);
  await expect(member.getByText("الحضور في القاعة فقط.")).toBeVisible();
  // REQ-SES-011: the spoken language is above the RSVP action, not below it.
  const language = (await member.getByText("لغة الجلسة").first().boundingBox())!;
  const action = (await member.locator("aside").first().boundingBox())!;
  expect(language.y, "the spoken language appears before the RSVP action").toBeLessThan(action.y);
  await review(member, "scr-012-event-page");

  await boss.context().close();
  await member.context().close();
});
