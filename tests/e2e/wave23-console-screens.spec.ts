// Wave 23 — `console`'s two screens beside their boards, and the paths the lead's walkthrough does not take.
// SCR-055 (`AdminTemplates.dc.html`, `AdminTemplatesCerts.dc.html`) and SCR-045 (`AdminCertificates.dc.html`).
// REQ-UIX-108, REQ-UIX-109, REQ-ADM-020, REQ-ADM-023, REQ-CRT-004, REQ-CRT-015, DEC-134, DEC-238.
//
// The job, one line per screen (note §0): on `055` an admin reads the three defaults in one strip and copies a platform
// template with ⋯ → «انسخ لتعدّل»; on `045` an admin issues a held certificate with «أصدر» and, while the kind is only
// held, still changes its template behind «غيّر». Each act's audit row is read back, written by the admin member.
// ★ The owner's tie guard: a kind with no default set is named by neither screen. A moderator reads both screens and
// writes on neither; a member gets the streamed not-found.
//
// Captures at `.qa-shots/rtl/wave23-console-<screen>-<state>-<1280|390>.png`, honouring `E2E_SHOTS_DIR`: every screen
// at 1280 on the desktop project and at 390 on the phone project (both stack under `lg`). Writes run once, on desktop.
// Fixtures as `wave23-lead-certificate-walk.spec.ts`: completion and its fan-out in SQL (the worker is not running).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const NAMES = { admin: "مديرة الشاشات", mod: "منظّم الشاشات", member: "عضو الشاشات", a: "يمان", b: "ريم الشهري" };

let service: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
const emails: Record<keyof typeof NAMES, string> = { admin: "", mod: "", member: "", a: "", b: "" };
const members: Record<keyof typeof NAMES, string> = { admin: "", mod: "", member: "", a: "", b: "" };
const userIds: string[] = [];

const main = (page: Page) => page.locator("#main");
const width = (info: TestInfo) => (info.project.name === "phone" ? "390" : "1280");
const shot = (page: Page, info: TestInfo, screen: string, state: string) =>
  page.screenshot({ path: `${SHOTS}/wave23-console-${screen}-${state}-${width(info)}.png`, fullPage: true });
const desktopOnly = (info: TestInfo) => test.skip(info.project.name === "phone", "the writes run once, on the desktop project");

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Settled: every card preview on screen has rendered (a skeleton proves nothing). */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  const previews = main(page).locator("[data-template-preview]");
  const n = await previews.count();
  for (let i = 0; i < n; i++) {
    await previews.nth(i).scrollIntoViewIfNeeded();
    await expect(previews.nth(i)).toHaveAttribute("data-rendered", "true", { timeout: 15_000 });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function auditRows(action: string, subjectId: string) {
  const { rows } = await db.query<{ actor_id: string }>(`select actor_id from public.audit_log where action = $1 and subject_id = $2`, [action, subjectId]);
  return rows;
}

test.beforeAll(async ({}, testInfo) => {
  service = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `screens23-${tag}.example`;
  for (const key of Object.keys(emails) as Array<keyof typeof NAMES>) emails[key] = `${key}@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الشاشات', $1, 'SC', gen_random_uuid(), $2) returning id`,
    [`screens23-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const key of Object.keys(emails) as Array<keyof typeof NAMES>) {
    const { data, error } = await service.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true, user_metadata: { full_name: NAMES[key] } });
    if (error) throw error;
    userIds.push(data.user.id);
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error: e1 } = await client.auth.signInWithPassword({ email: emails[key], password: PASSWORD });
    if (e1) throw e1;
    const { error: e2 } = await client.rpc("provision_member");
    if (e2) throw e2;
    const role = key === "mod" ? "moderator" : key === "admin" ? "admin" : "member";
    const { rows } = await db.query<{ id: string }>(
      `update public.members set display_name = $3, org_role = $4::public.org_role, claims_version = claims_version + 1 where org_id = $1 and email = $2 returning id`,
      [orgId, emails[key], NAMES[key], role],
    );
    members[key] = rows[0].id;
  }

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'التحليل') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, 'الأرقام التي تكذب: قراءة تقارير الأداء', 'نبذة عن الجلسة وأهدافها للحاضرين.', $2, 'introductory', 'ar',
             now() - interval '3 hours', 60, now() - interval '2 hours', 'Asia/Riyadh', 30, 'قاعة الاختبار', 'published', now() - interval '1 day')
     returning id`,
    [orgId, cat[0].id],
  );
  sessionId = s[0].id;
  for (const key of ["a", "b"] as const) {
    await db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'حضر الجلسة', $4, 'empty'::tstzrange)`,
      [orgId, sessionId, members[key], members.admin],
    );
  }
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/* ── 055 ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test("055 · the posters tab and the certificates tab, beside their boards; the three defaults named", async ({ page, context }, info) => {
  await signIn(context, emails.admin);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("القوالب");
  await expect(main(page).getByRole("link", { name: "قالب جديد" })).toBeVisible();
  await expect(main(page).getByRole("heading", { level: 2, name: /قوالب مؤسستك/ })).toBeVisible();
  await expect(main(page).getByRole("heading", { level: 2, name: /قوالب المنصة/ })).toBeVisible();
  await settled(page);
  await shot(page, info, "templates", "posters");

  await page.goto("/ar/app/admin/templates/certificates");
  const defaults = main(page).getByLabel("القوالب الافتراضية");
  for (const kind of ["الافتراضي للحضور", "الافتراضي للتقديم", "الافتراضي للإنجاز"]) await expect(defaults).toContainText(kind);
  // With no org template, issuance falls back to the platform's default — named and marked «المنصة» (DEC-238 §2.3).
  await expect(defaults).toContainText("المنصة");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "the grid scrolls the page sideways").toBe(false);
  await settled(page);
  await shot(page, info, "templates", "certificates");
});

test("055 · a platform template is read-only until copied — one action, «انسخ لتعدّل», audited as the admin", async ({ page, context }, info) => {
  desktopOnly(info);
  await signIn(context, emails.admin);
  await page.goto("/ar/app/admin/templates/certificates");
  const platform = main(page).locator("section", { has: page.getByRole("heading", { level: 2, name: /قوالب المنصة/ }) });
  const card = platform.locator("article").first();
  const name = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
  await card.getByRole("button", { name: "إجراءات أخرى" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["انسخ لتعدّل"]);
  await page.getByRole("menuitem", { name: "انسخ لتعدّل" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/الاسم/).fill(`${name} لنا`);
  await dialog.getByRole("button", { name: "انسخ لتعدّل" }).click();
  await expect(page.getByText("نُسخ القالب إلى مؤسستك.", { exact: true })).toBeVisible();

  const mine = main(page).locator("article", { has: page.getByRole("heading", { name: `${name} لنا`, exact: true, level: 3 }) });
  await expect(mine).toBeVisible();
  const { rows } = await db.query<{ id: string }>(`select id from public.design_templates where org_id = $1 and name = $2`, [orgId, `${name} لنا`]);
  expect(await auditRows("design_template.created", rows[0].id)).toEqual([{ actor_id: members.admin }]);
  // ★ The tie guard: an org copy that is not the default takes issuance from the platform's default, so that kind has no
  // default set — the strip names neither, and says so (DEC-238, the owner's ruling).
  const strip = main(page).getByLabel("القوالب الافتراضية");
  await expect(strip).toContainText("لا قالب افتراضي");
  await expect(strip).not.toContainText(`${name} لنا`);
});

test("055 · ★ the tie guard — two non-default org templates of one kind on v1: the strip names neither", async ({ page, context }, info) => {
  desktopOnly(info);
  const doc = JSON.stringify({ schemaVersion: 1, purpose: "certificate", master: { width: 3508, height: 2480, unit: "px", dpi: 300 }, direction: "rtl", background: { type: "solid", color: "{{brand.canvas}}" }, layers: [] });
  for (const name of ["تقديم أول", "تقديم ثانٍ"]) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'certificate', 'presenter', $2) returning id`,
      [orgId, name],
    );
    await db.query(`insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now())`, [rows[0].id, doc]);
  }
  await signIn(context, emails.admin);
  await page.goto("/ar/app/admin/templates/certificates");
  const presenter = main(page).getByLabel("القوالب الافتراضية").locator("div", { has: page.getByText("الافتراضي للتقديم", { exact: true }) });
  await expect(presenter.locator("dd")).toHaveText("لا قالب افتراضي");
  await expect(main(page).getByLabel("القوالب الافتراضية")).not.toContainText("تقديم أول");
  await expect(main(page).getByLabel("القوالب الافتراضية")).not.toContainText("تقديم ثانٍ");
  await settled(page);
  await shot(page, info, "templates", "no-default");

  // One move: ⋯ → «اجعله الافتراضي» names it.
  const card = main(page).locator("article", { has: page.getByRole("heading", { name: "تقديم أول", exact: true, level: 3 }) });
  await card.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "اجعله الافتراضي" }).click();
  await expect(page.getByText("صار هذا القالب الافتراضي لعائلته.", { exact: true })).toBeVisible();
  await expect(presenter.locator("dd")).toHaveText("تقديم أول");
});

test("055 · a moderator reads the library and writes nothing; a member gets the streamed not-found (DEC-134)", async ({ page, context }, info) => {
  await signIn(context, emails.mod);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("القوالب");
  await expect(main(page).getByRole("link", { name: "قالب جديد" })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "إجراءات أخرى" })).toHaveCount(0);
  await settled(page);
  await shot(page, info, "templates", "moderator");

  await signIn(context, emails.member);
  const response = await page.goto("/ar/app/admin/templates/posters");
  expect(response?.status()).toBe(200);
  // The not-found page carries more than one robots meta; one of them says noindex (DEC-134).
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(main(page).getByRole("heading", { level: 1, name: "القوالب" })).toHaveCount(0);
});

/* ── 045 ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test("045 · before completion: the template per kind, the mode, and who receives one", async ({ page, context }, info) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  await expect(main(page).getByRole("heading", { level: 2, name: "التصميم" })).toBeVisible();
  await expect(main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" })).toBeVisible();
  await expect(main(page).getByRole("heading", { level: 2, name: /من يستحق/ })).toContainText("2");
  await expect(main(page).getByRole("table", { name: "الشهادات المحجوزة" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await shot(page, info, "certificates", "before");
});

test("045 · completed in review: «أصدر» issues one, audited as the admin; «غيّر» still opens the template while held", async ({ page, context }, info) => {
  desktopOnly(info);
  await db.query(`update public.sessions set certificate_mode = 'review', state = 'completed', completed_at = now() where id = $1`, [sessionId]);
  const ids: Record<"a" | "b", string> = { a: "", b: "" };
  for (const key of ["a", "b"] as const) {
    const { rows } = await db.query<{ id: string; state: string }>(`select id, state from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`, [
      sessionId,
      members[key],
    ]);
    expect(rows[0].state).toBe("held");
    ids[key] = rows[0].id;
  }

  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  await expect(main(page).getByText("تُراجَع قبل الإطلاق")).toBeVisible();
  await expect(main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" })).toHaveCount(0);
  await expect(main(page).getByRole("table", { name: "الشهادات المحجوزة" })).toContainText(NAMES.a);
  await page.waitForLoadState("networkidle");
  await shot(page, info, "certificates", "held");

  // The template, while the kind is held and none issued (DEC-238 §2).
  await main(page).getByRole("link", { name: "غيّر" }).click();
  await expect(page.getByRole("dialog", { name: /القالب/ })).toBeVisible();
  await shot(page, info, "certificates", "change-template");
  await page.keyboard.press("Escape");

  await main(page).getByRole("table", { name: "الشهادات المحجوزة" }).getByRole("button", { name: `أصدر — ${NAMES.b}` }).click();
  await expect(page.getByRole("dialog")).toContainText("إصدار شهادة واحدة؟");
  await page.getByRole("dialog").getByRole("button", { name: "أصدر", exact: true }).click();
  await expect(page.getByText("صدرت شهادة واحدة", { exact: true })).toBeVisible();
  expect(await auditRows("certificate.released", ids.b)).toEqual([{ actor_id: members.admin }]);
  await expect(main(page).getByRole("table", { name: "الشهادات الصادرة" })).toContainText(NAMES.b);

  // Issued now: the kind is fixed, so «غيّر» is gone (set_certificate_design()'s own lock re-checks it).
  await expect(main(page).getByRole("link", { name: "غيّر" })).toHaveCount(0);
  await shot(page, info, "certificates", "issued");
});

test("045 · the phone stack, and a moderator's view: the line and who receives one, no certificate", async ({ page, context }, info) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "a table scrolls the page sideways").toBe(false);
  await page.waitForLoadState("networkidle");
  await shot(page, info, "certificates", "admin");

  await signIn(context, emails.mod);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  await expect(main(page).getByRole("heading", { level: 2, name: /من يستحق/ })).toBeVisible();
  await expect(main(page).getByRole("table", { name: "الشهادات المحجوزة" })).toHaveCount(0);
  await expect(main(page).getByRole("table", { name: "الشهادات الصادرة" })).toHaveCount(0);
  await shot(page, info, "certificates", "moderator");
});
