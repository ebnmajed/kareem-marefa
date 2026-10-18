// DEC-299 — an admin logs an event that already happened, silently, and adds who came (REQ-SES-025; `0231`).
//
//   · «إنشاء» → «فعالية سابقة» opens the direct form; it lands on الجدولة, which offers no day after today;
//   · «سجّلها منتهية» completes it at its own end and lands on الحضور with the sheet open, the reason written;
//   · two members are marked in one press; nobody receives anything, no story frame exists, and the check-ins arrive
//     at the event's start.
// Captures: `.qa-shots/rtl/past-event-<schedule|attendance>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial", timeout: 120_000 });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let meEmail = "";
let tag = "";
const users: string[] = [];
const desktop = () => test.info().project.name === "desktop";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `past-e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الفعاليات السابقة', $1, 'PE', gen_random_uuid()) returning id`,
    [`past-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1, 'تصنيف سابق')`, [orgId]);
  await db.query(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة القديمة', 40)`, [orgId]);

  for (const name of ["ريم الحاضرة", "سالم الحاضر"]) {
    const email = `${users.length}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    await db.query(`insert into public.members (org_id, auth_user_id, email, display_name) values ($1, $2, $3, $4)`, [orgId, data.user.id, email, name]);
  }

  meEmail = `admin@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف" } });
  if (error) throw error;
  users.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<void> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: meEmail, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [id]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const newContext = (browser: import("@playwright/test").Browser) =>
  browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function capture(page: Page, screen: "schedule" | "attendance") {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `past-event-${screen}-${desktop() ? 1280 : 390}.png`), fullPage: true });
}

test("★★ a past event is logged, completed at its end, and its attendees added — and nobody is told", async ({ browser }) => {
  const context = await newContext(browser);
  await signIn(context);
  const page = await context.newPage();
  const title = `ملتقى مضى ${tag}`;

  // ── «إنشاء» → «فعالية سابقة» ─────────────────────────────────────────────
  await page.goto("/ar/app/admin/sessions");
  await page.locator("#main").getByRole("button", { name: "إنشاء" }).click();
  await page.getByRole("menuitem", { name: "فعالية سابقة" }).click();
  await expect(page.getByRole("heading", { name: "تسجيل فعالية سابقة" })).toBeVisible();
  // A past event is logged directly — no proposals to turn into one.
  await expect(page.getByRole("heading", { name: "جاهزة للجدولة" })).toHaveCount(0);
  await page.locator("#direct-title").fill(title);
  await page.locator("#direct-abstract").fill("لقاء عُقد ولم يُسجَّل في وقته.");
  const category = page.locator("#direct-category");
  await category.selectOption((await category.locator("option", { hasText: "تصنيف سابق" }).getAttribute("value"))!);
  await page.getByRole("button", { name: "أنشئ ثم حدّد التاريخ" }).click();
  await page.waitForURL(/\/schedule/);
  const sessionId = page.url().match(/sessions\/([0-9a-f-]{36})\//)![1];
  expect((await db.query(`select logged_retrospectively from public.sessions where id = $1`, [sessionId])).rows[0].logged_retrospectively).toBe(true);

  // ── الجدولة: last month's 10th; no day after today is offered ─────────────
  if (!/\?edit/.test(page.url())) await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule?edit`);
  await page.getByRole("button", { name: /^التاريخ والوقت: / }).click();
  const picker = page.getByRole("dialog", { name: "التاريخ والوقت" });
  // Next month's days are all after today: the picker disables them.
  await picker.getByRole("button", { name: "الشهر التالي" }).click();
  await expect(picker.getByRole("button", { name: /^10 / }).and(page.locator(":enabled"))).toHaveCount(0);
  await picker.getByRole("button", { name: "الشهر السابق" }).click();
  await picker.getByRole("button", { name: "الشهر السابق" }).click();
  await picker.getByRole("button", { name: /^10 / }).and(page.locator(":enabled")).first().click();
  await picker.getByLabel("الساعة").selectOption("18");
  await picker.getByLabel("الدقيقة").selectOption("0");
  await picker.getByRole("button", { name: "تم", exact: true }).click();
  const venue = page.getByLabel("المكان", { exact: true });
  await venue.selectOption((await venue.locator("option", { hasText: "القاعة القديمة" }).getAttribute("value"))!);
  await expect(page.getByText("لن يصل إشعار لأحد، وتُسجَّل الفعالية منتهية بتاريخها.")).toBeVisible();
  await capture(page, "schedule");

  // ── «سجّلها منتهية» → الحضور, the sheet open with the reason written ───────
  await page.getByRole("button", { name: "سجّلها منتهية" }).click();
  await page.waitForURL(/\/attendance\?manual=1/, { timeout: 20_000 });
  const { rows: s } = await db.query<{ state: string; completed_at: Date; ends_at: Date; starts_at: Date }>(
    `select state, completed_at, ends_at, starts_at from public.sessions where id = $1`,
    [sessionId],
  );
  expect(s[0].state).toBe("completed");
  expect(s[0].completed_at.getTime()).toBe(s[0].ends_at.getTime());

  const sheet = page.getByRole("dialog", { name: "تسجيل حضور يدوي" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("السبب", { exact: false })).toHaveValue("سُجّلت بأثر رجعي");
  for (const name of ["ريم الحاضرة", "سالم الحاضر"]) {
    await sheet.getByRole("combobox").fill(name.split(" ")[0]);
    await page.getByRole("option", { name }).click();
  }
  await capture(page, "attendance");
  await sheet.getByRole("button", { name: /^سجّل حضور/ }).click();
  await expect(sheet).toHaveCount(0, { timeout: 20_000 });

  const { rows: ci } = await db.query<{ arrived_at: Date }>(`select arrived_at from public.check_ins where session_id = $1 and removed_at is null`, [sessionId]);
  expect(ci).toHaveLength(2);
  for (const r of ci) expect(r.arrived_at.getTime()).toBe(s[0].starts_at.getTime());

  // ── nobody was told, and the story ring has nothing ───────────────────────
  expect((await db.query(`select 1 from public.notifications where session_id = $1`, [sessionId])).rows).toHaveLength(0);
  expect((await db.query(`select 1 from public.story_frames where session_id = $1`, [sessionId])).rows).toHaveLength(0);
  await context.close();
});
