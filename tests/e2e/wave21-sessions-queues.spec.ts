// Wave 21 — `sessions`' two screens doing their jobs (DEC-227 §0, REQ-UIX-088, REQ-UIX-089).
//
// SCR-041: a proposal is DECIDED WITHOUT LEAVING THE LIST — ↓ walks the queue, Enter opens, the edits since it was sent
// are shown before the decision, and after «اعتمد» the next proposal is one Enter away. A message typed before
// «اعتمد» is refused at the box, never lost (DEC-228 §4.1).
// SCR-043: a session's settings are READ BY DEFAULT under one header — «عدّل» opens the same card as the form, and
// «إلغاء» returns to it unchanged.
//
// ★ Needs `0179` applied (the content capture the diff reads). Captures at 1280, the console's primary width, into
// `.qa-shots/rtl/wave21-sessions-<screen>-<state>-1280.png`, honouring `E2E_SHOTS_DIR`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const DESK = { width: 1280, height: 900 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let sessionId = "";
const userIds: string[] = [];
const P = { first: "كيف اختصرنا وقت إعداد التقارير إلى النصف", second: "ثلاث أدوات مجانية بدل الاشتراكات", third: "كيف نقرأ عقد الإيجار قبل التوقيع" };
const SESSION_TITLE = "لوحة تحكم لا يهجرها أحد بعد أسبوع";

async function provision(email: string): Promise<string> {
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
  const domain = `w21-queues-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const proposerEmail = `yaman@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('شبه الجزيرة', $1, 'WQ', gen_random_uuid(), $2) returning id`,
    [`w21-queues-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);

  for (const [email, name] of [[adminEmail, "عبدالله المطيري"], [proposerEmail, "يمان"]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const adminMember = await provision(adminEmail);
  const proposer = await provision(proposerEmail);

  // Three proposals waiting, oldest first. The FIRST was sent back once and resubmitted with a new abstract and a
  // shorter duration — through the state machine, so `0179` records what it was and what it is.
  const insert = async (title: string, abstract: string, minutes: number, ageDays: number) => {
    const { rows: p } = await db.query<{ id: string }>(
      `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, expected_duration_minutes, state, created_at)
       values ($1, $2, $3, $4, $5, 'introductory', $6, 'submitted', now() - make_interval(days => $7::int)) returning id`,
      [orgId, proposer, title, abstract, cat[0].id, minutes, ageDays],
    );
    return p[0].id;
  };
  const first = await insert(P.first, "قبل سنة كان التقرير يأخذ يومًا كاملًا.", 60, 6);
  await insert(P.second, "ثلاث أدوات جرّبناها بدل ثلاثة اشتراكات.", 45, 4);
  await insert(P.third, "ما الذي يجب أن تقرأه قبل أن توقّع.", 30, 2);
  await db.query(`update public.proposals set state = 'in_review' where id = $1`, [first]);
  await db.query(`update public.proposals set state = 'changes_requested', decision_reason = 'اختصر المدة' where id = $1`, [first]);
  await db.query(
    `update public.proposals set abstract = 'قبل سنة كان التقرير يأخذ نصف يوم من شخص واحد.', expected_duration_minutes = 45, state = 'submitted' where id = $1`,
    [first],
  );

  // A published session for the hub.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, $2, 'لوحة تبقى مفتوحة بعد الأسبوع الأول.', $3, 'introductory',
             now() + interval '7 days', 60, now() + interval '7 days' + interval '1 hour',
             $4, 40, now() + interval '6 days', now() + interval '7 days' - interval '6 hours', 'published', now() - interval '1 day')
     returning id`,
    [orgId, SESSION_TITLE, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  // The session's log, as the RPCs would have written it (a direct insert writes none): «جُدولت», then «نُشرت» by the admin.
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, subject_id, occurred_at)
     values ($1, $2, 'admin', 'session.scheduled', 'session', $3, now() - interval '2 days'),
            ($1, $2, 'admin', 'session.published', 'session', $3, now() - interval '1 day')`,
    [orgId, adminMember, sessionId],
  );
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, proposer]);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave21-sessions-${name}-1280.png`), fullPage: true });
}

test("★ SCR-041: the queue is walked by keyboard, the edits are read, and the next proposal is one Enter away", async ({ context, page }) => {
  await page.setViewportSize(DESK);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/proposals");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);

  const list = main(page).getByRole("list", { name: "المقترحات" });
  const row = (title: string) => list.getByRole("link", { name: new RegExp(title) });
  // The oldest is open beside the queue; its row is the open one.
  await expect(row(P.first)).toHaveAttribute("aria-current", "page");
  const detail = main(page).getByRole("region", { name: P.first });

  // ★ The edits since it was sent, field by field, before deciding (contract 5).
  const edits = detail.locator("details", { hasText: "تعديلات على المحتوى منذ الإرسال" });
  await expect(edits.locator("summary")).toContainText("2");
  await edits.locator("summary").click();
  await expect(edits.locator("del").first()).toContainText("يومًا كاملًا");
  await expect(edits.locator("ins").first()).toContainText("نصف يوم من شخص واحد");
  await capture(page, "scr041-open");

  // ★ ↓ walks the list WITHOUT opening; Enter opens, and focus stays on the row.
  await row(P.first).focus();
  await page.keyboard.press("ArrowDown");
  await expect(row(P.second)).toBeFocused();
  await expect(row(P.first)).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Enter");
  await expect(main(page).getByRole("region", { name: P.second })).toBeVisible();
  await expect(row(P.second)).toBeFocused();
  // Nothing sent back, nothing changed: no edits drawn.
  await expect(main(page).getByRole("region", { name: P.second }).locator("details")).toHaveCount(0);

  // ★ A message typed before «اعتمد» is refused at the box, and kept.
  const second = main(page).getByRole("region", { name: P.second });
  await second.getByLabel("رسالة للمقترِح").fill("شكرًا");
  await second.getByRole("button", { name: "اعتمد" }).click();
  await expect(second.getByText("الاعتماد لا يحمل رسالة", { exact: false })).toBeVisible();
  await expect(second.getByLabel("رسالة للمقترِح")).toHaveValue("شكرًا");

  // ★ Approve: the proposal leaves the queue, and focus lands on the next one — Enter opens it.
  await second.getByLabel("رسالة للمقترِح").fill("");
  await second.getByRole("button", { name: "اعتمد" }).click();
  await expect(page.getByRole("status")).toContainText("سُجّل قرارك", { timeout: 15_000 });
  await expect(row(P.second)).toHaveCount(0);
  await expect(row(P.third)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(main(page).getByRole("region", { name: P.third })).toBeVisible();
  const { rows } = await db.query<{ state: string }>(`select state from public.proposals where org_id = $1 and title = $2`, [orgId, P.second]);
  expect(rows[0].state).toBe("approved");
  await capture(page, "scr041-after-decision");

  // ★ Under `lg` the queue is the page and a proposal opens at its own route, with a way back.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/app/admin/proposals");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await row(P.third).click();
  await page.waitForURL(/\/app\/admin\/proposals\/[0-9a-f-]{36}/);
  await expect(main(page).getByRole("region", { name: P.third })).toBeVisible();
  await expect(main(page).getByRole("link", { name: "المقترحات", exact: true })).toBeVisible();
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "wave21-sessions-scr041-detail-390.png"), fullPage: true });
});

test("★ SCR-043: one header above five tabs; الجدولة reads by default and «عدّل» opens the same card as the form", async ({ context, page }) => {
  await page.setViewportSize(DESK);
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);

  await expect(main(page).getByRole("heading", { level: 1 })).toContainText(SESSION_TITLE);
  await expect(main(page).getByRole("link", { name: "صفحة الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await expect(main(page).getByRole("button", { name: "ألغِ الجلسة" })).toBeVisible();
  const strip = main(page).getByRole("navigation", { name: "إعدادات الجلسة" });
  await expect(strip.getByRole("link")).toHaveText(["الجدولة", "المحتوى", "الحضور", "الاستبانة", "الشهادات"]);

  // Read by default: the card, no field.
  const card = main(page).getByRole("region", { name: "الجدولة" });
  await expect(card.getByText("قاعة الرياض", { exact: false })).toBeVisible();
  await expect(main(page).getByLabel("المدة بالدقائق")).toHaveCount(0);
  // The side column: the reservations read whole — nothing wider than its card — and the log says what happened.
  const side = main(page).getByRole("complementary").last();
  await expect(side.getByText("0 / 40")).toBeVisible();
  const clipped = await side.evaluate((el) => [...el.querySelectorAll<HTMLElement>("*")].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== "visible").length);
  expect(clipped, "nothing in the side column is clipped").toBe(0);
  await expect(side.getByText("نُشرت", { exact: false })).toBeVisible();
  await capture(page, "scr043-read");

  // «عدّل»: the same rows as the form; the lifecycle action steps aside while editing.
  await main(page).getByRole("link", { name: "عدّل" }).click();
  await page.waitForURL(/\/schedule\?edit/);
  await expect(main(page).getByLabel("المدة بالدقائق")).toHaveValue("60");
  await expect(main(page).getByRole("group", { name: "الموعد" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "ألغِ الجلسة" })).toHaveCount(0);
  await capture(page, "scr043-edit");

  // «إلغاء» returns to the card, nothing saved.
  await main(page).getByRole("link", { name: "إلغاء" }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/schedule") && !url.search.includes("edit"));
  await expect(main(page).getByLabel("المدة بالدقائق")).toHaveCount(0);
});
