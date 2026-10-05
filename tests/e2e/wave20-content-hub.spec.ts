// Wave 20 — `content`'s three hub screens, rebuilt from their artboards (DEC-216, DEC-218 §4; REQ-UIX-071, 073, 074).
//
//   SCR-021 `/app/me`               — read by default (no input), edit on intent at `/app/me?edit`, a refused save
//                                     stays, a saved one returns to read mode; interests are the org's categories.
//   SCR-023 `/app/me/certificates`  — one list; a revoked row struck with «ملغاة» and its reason; «قريبًا».
//   SCR-024 `/app/me/bookmarks`     — browse's row; a removal leaves at once and «تراجع» puts it back.
//
// Real local Supabase, one org of its own. Every page-level locator comes from `#main` (DEC-145). Captures land at
// `.qa-shots/rtl/wave20-content-<screen>-<state>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`, after the streams settle.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
let categoryA = "";
let sessionA = "";
let sessionB = "";
let completedSession = "";
let revokedSession = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `hub20-e2e-${tag}.example`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'HUB', gen_random_uuid()) returning id`,
    [`مؤسسة الحساب ${tag}`, `hub20-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.companies (org_id, name) values ($1, 'شركة الاختبار')`, [orgId]);
  const { rows: cats } = await db.query<{ id: string; name: string }>(
    `insert into public.categories (org_id, name) values ($1, 'حوكمة'), ($1, 'تقارير') returning id, name`,
    [orgId],
  );
  categoryA = cats.find((c) => c.name === "حوكمة")!.id;
  const { rows: venues } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  async function session(title: string, offset: string, state: "published" | "completed"): Promise<string> {
    const { rows: s } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
       values ($1, $2, 'ملخص الجلسة', $3, 'introductory', now() + $4::interval, 60, now() + $4::interval + interval '1 hour',
               $5, 30, now() + $4::interval - interval '1 day', now() + $4::interval - interval '1 day', $6, now() - interval '10 days')
       returning id`,
      [orgId, title, categoryA, offset, venues[0].id, state],
    );
    return s[0].id;
  }
  sessionA = await session("جلسة أولى محفوظة", "2 days", "published");
  sessionB = await session("جلسة ثانية محفوظة", "3 days", "published");
  completedSession = await session("الأرقام التي تكذب", "-2 days", "completed");
  revokedSession = await session("ورشة الإضاءة للمبتدئين", "-4 days", "completed");

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الحساب" } });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: memberEmail, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#main [aria-busy=true]")).toHaveCount(0);
}

async function capture(page: Page, screen: string, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await settle(page);
  const width = page.viewportSize()!.width;
  await page.screenshot({ path: join(SHOTS, `wave20-content-${screen}-${state}-${width}.png`), fullPage: true });
}

async function noSideways(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the page must not scroll sideways").toBe(true);
}

test("★ SCR-021: read by default, no company, edit on intent, a refused save stays, a saved one returns to read", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me");
  const main = page.locator("#main");

  await expect(main.getByRole("heading", { level: 1, name: "حسابي" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "ملفي" })).toBeVisible();
  await expect(main.locator("input:not([type=hidden]), select, textarea")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "الإعدادات" })).toHaveAttribute("href", "/ar/app/me/settings"); // PR B
  // ★ wave 27 (DEC-254 §2, REQ-PRF-012; ledger B): no company is SHOWN — «بلا شركة» — and nothing asks for one.
  const profileRegion = main.getByRole("region", { name: "ملفي" });
  await expect(profileRegion.getByText("بلا شركة", { exact: true })).toBeVisible();
  await expect(main.getByText("اختر شركتك", { exact: false })).toHaveCount(0);
  await noSideways(page);
  await capture(page, "me", "nocompany");
  // ★ wave 27 (ledger B): an admin's placement — the owner stands in for SCR-049 here — then a profile save that must
  // leave it where it is: the save never sends the column (REQ-PRF-012, REQ-PRF-013).
  await db.query(`update public.members set company_id = (select id from public.companies where org_id = $1 and name = 'شركة الاختبار') where id = $2`, [orgId, memberId]);
  await page.reload();
  await expect(profileRegion.getByText("شركة الاختبار", { exact: true })).toBeVisible();

  await main.getByRole("link", { name: "عدّل ملفك" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/me\?edit/);
  await expect(main.getByRole("heading", { level: 2, name: "تعديل ملفي" })).toBeVisible();
  const save = main.getByRole("button", { name: "حفظ" });
  await expect(save).toBeDisabled();

  // A refused save stays in edit mode with the summary.
  await main.getByLabel("الاسم", { exact: false }).fill("");
  await expect(main.getByText("تغيير واحد غير محفوظ")).toBeVisible();
  await save.click();
  await expect(main.getByRole("alert")).toContainText("يرجى تصحيح الأخطاء التالية");
  await expect(page).toHaveURL(/\?edit/);
  await capture(page, "me", "errors");

  // Fill everything, a category among the interests, and save.
  await main.getByLabel("الاسم", { exact: false }).fill("عضو الحساب المُحدَّث");
  // ★ wave 27 (ledger B): edit mode has no company control.
  await expect(main.getByLabel("الشركة", { exact: false })).toHaveCount(0);
  await main.getByLabel("المسمى الوظيفي", { exact: false }).fill("مهندس حلول");
  await main.getByLabel("الاهتمامات", { exact: false }).selectOption({ label: "حوكمة" });
  await capture(page, "me", "edit");
  await save.click();
  await expect(page.getByText("تم الحفظ", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/app\/me$/);

  // The standing card and the desktop band carry the name and the company too: the profile's own region, never #main.
  const profile = main.getByRole("region", { name: "ملفي" });
  await expect(profile.getByText("عضو الحساب المُحدَّث")).toBeVisible();
  await expect(profile.getByText("شركة الاختبار")).toBeVisible();
  await expect(profile.getByText("حوكمة")).toBeVisible();
  const { rows } = await db.query(`select category_id from public.member_interests where member_id = $1`, [memberId]);
  expect(rows.map((r) => r.category_id)).toEqual([categoryA]);
  await capture(page, "me", "read");

  await page.setViewportSize(DESKTOP);
  await page.reload();
  await expect(main.getByRole("heading", { level: 1, name: "حسابي" })).toBeVisible();
  await capture(page, "me", "read");
});

test("★ SCR-021: leaving with changes asks", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me?edit");
  const main = page.locator("#main");
  await main.getByLabel("المسمى الوظيفي", { exact: false }).fill("عنوان لم يُحفظ");
  await main.getByRole("link", { name: "إلغاء" }).click();
  const dialog = page.getByRole("dialog", { name: "تجاهل التغييرات؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تابع التعديل" }).click();
  await expect(page).toHaveURL(/\?edit/);
  await main.getByRole("link", { name: "إلغاء" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تجاهل", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/app\/me$/);
  await expect(main.getByText("عنوان لم يُحفظ")).toHaveCount(0);
});

test("★ SCR-023: empty, then one list — a revoked row struck with its reason, a row with no PDF «قريبًا»", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me/certificates");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "شهاداتي" })).toBeVisible();
  await expect(main.getByText("لا شهادات بعد", { exact: false })).toBeVisible();
  await capture(page, "certificates", "empty");

  const { rows: tpl } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default) values ($1, 'org', 'certificate', 'presenter', 'شهادة التقديم', true) returning id`,
    [orgId],
  );
  const { rows: ver } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (org_id, template_id, version, document, published_at) values ($1, $2, 1, '{"schemaVersion":1,"canvas":{"width":10,"height":10},"layers":[]}'::jsonb, now()) returning id`,
    [orgId, tpl[0].id],
  );
  await db.query(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at)
     values ($1, $2, 'presenter', $3, 'HUB-2026-000001', 'abcdefghijklmnopqrstuvwx', 'issued', $4, 'عضو الحساب', now())`,
    [orgId, memberId, completedSession, ver[0].id],
  );
  await db.query(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at, revoked_at, revocation_reason)
     values ($1, $2, 'presenter', $3, 'HUB-2026-000002', 'yzabcdefghijklmnopqrstuv', 'revoked', $4, 'عضو الحساب', now() - interval '1 day', now(), 'إصدار مكرر بالخطأ')`,
    [orgId, memberId, revokedSession, ver[0].id],
  );

  // Presenter certificates: an attendance one needs a check-in row (`certificates_attendance_needs_check_in`), and
  // the list draws every kind the same way.
  await page.reload();
  await expect(main.getByText("الأرقام التي تكذب")).toBeVisible();
  await expect(main.getByText("قريبًا")).toBeVisible();
  await expect(main.getByText("ملغاة", { exact: true })).toBeVisible();
  await expect(main.getByText("إصدار مكرر بالخطأ")).toBeVisible();
  await expect(main.getByText("HUB-2026-000001")).toHaveAttribute("dir", "ltr");
  await expect(main.getByText("صالحة")).toHaveCount(0);
  await expect(main.getByText("abcdefghijklmnopqrstuvwx")).toHaveCount(0);
  await noSideways(page);
  await capture(page, "certificates", "list");
});

test("★ SCR-024: empty, browse's rows, a removal leaves at once and «تراجع» puts it back", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me/bookmarks");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "المحفوظات" })).toBeVisible();
  await expect(main.getByText("لم تحفظ شيئًا بعد")).toBeVisible();
  await expect(main.getByRole("link", { name: "تصفّح الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
  await capture(page, "bookmarks", "empty");

  await db.query(`insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3), ($1, $2, $4)`, [orgId, memberId, sessionA, sessionB]);
  await page.reload();
  await expect(main.getByRole("heading", { level: 3, name: "جلسة أولى محفوظة" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 3, name: "جلسة ثانية محفوظة" })).toBeVisible();
  await noSideways(page);
  await capture(page, "bookmarks", "list");

  const first = main.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "جلسة أولى محفوظة" }) });
  await first.getByRole("button", { name: "احفظ الجلسة" }).click();
  await expect(main.getByRole("heading", { level: 3, name: "جلسة أولى محفوظة" })).toHaveCount(0);
  const undo = page.getByRole("button", { name: "تراجع", exact: true });
  await expect(undo).toBeVisible();
  await capture(page, "bookmarks", "undo");
  await expect.poll(async () => (await db.query(`select 1 from public.bookmarks where member_id = $1 and session_id = $2`, [memberId, sessionA])).rowCount).toBe(0);

  await undo.click();
  await expect(main.getByRole("heading", { level: 3, name: "جلسة أولى محفوظة" })).toBeVisible();
  await expect.poll(async () => (await db.query(`select 1 from public.bookmarks where member_id = $1 and session_id = $2`, [memberId, sessionA])).rowCount).toBe(1);
});
