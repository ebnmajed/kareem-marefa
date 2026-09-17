// SCR-055 · SCR-056 on the M9 system — wave 8, D2/D3 (DEC-147, DEC-148),
// against REAL local Supabase. REQ-ADM-013, REQ-DSG-007, REQ-DSG-008,
// REQ-DSG-024, REQ-DSG-026, REQ-UIX-009 … 013.
//
// What only a real browser against a real database shows:
//
//   · an org admin READS a platform template and is offered a COPY, never an
//     edit — and the copy is a copy (`duplicated_from`, its own version 1);
//   · a name left empty is refused by the ACTION and said beside the field —
//     the forms are `noValidate`, so no browser bubble gets there first;
//   · publishing a draft adds a version and edits none (REQ-DSG-007); set
//     default, rename, retire (behind a confirm that names the template) and
//     restore each land and say so;
//   · a blank certificate starts on the composition chosen for it (DEC-148);
//   · a member reaches none of it — the gated not-found (DEC-134).
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as
// `wave8-designer-templates-<library>-<state>.png`, phone project, 390 × 844.
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
const DESKTOP = { width: 1440, height: 1000 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
const orgIds: string[] = [];
const userIds: string[] = [];
let adminEmail = "";
let modEmail = "";
let memberEmail = "";
let emptyAdminEmail = "";
let orgId = "";
let documentId = "";
let orgPosterName = "";

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

async function newOrg(tag: string, adminAddress: string): Promise<string> {
  const domain = adminAddress.split("@")[1]!;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة القوالب', $1, 'TL', gen_random_uuid(), $2) returning id`,
    [tag, adminAddress],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, domain]);
  orgIds.push(rows[0].id);
  return rows[0].id;
}

/** The latest version of a platform default, as the migrations seeded it. */
async function platformDefault(purpose: "poster" | "certificate", family: string) {
  const { rows } = await db.query<{ template_id: string; version_id: string; name: string; document: unknown }>(
    `select t.id as template_id, v.id as version_id, t.name, v.document
       from public.design_templates t join public.design_template_versions v on v.template_id = t.id
      where t.scope = 'platform' and t.purpose = $1 and t.family = $2 and t.is_default
      order by v.version desc limit 1`,
    [purpose, family],
  );
  return rows[0]!;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  adminEmail = `boss@tpl-${tag}.example`;
  modEmail = `mod@tpl-${tag}.example`;
  memberEmail = `member@tpl-${tag}.example`;
  emptyAdminEmail = `boss@tpl-empty-${tag}.example`;

  orgId = await newOrg(`tpl-${tag}`, adminEmail);
  await newOrg(`tpl-empty-${tag}`, emptyAdminEmail);

  for (const email of [adminEmail, modEmail, memberEmail, emptyAdminEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو القوالب" } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provisionMemberId(adminEmail);
  await provisionMemberId(memberEmail);
  await provisionMemberId(emptyAdminEmail);
  const modId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modId]);

  // One org copy per library, so a capture shows the baseline AND an org's
  // own template. A poster copy is in use by one session, so its count reads.
  const talk = await platformDefault("poster", "talk");
  orgPosterName = `نسختنا من ${talk.name}`;
  const { rows: poster } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, duplicated_from)
     values ($1, 'org', 'poster', 'talk', $2, $3) returning id`,
    [orgId, orgPosterName, talk.template_id],
  );
  const { rows: posterVersion } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now()) returning id`,
    [poster[0].id, JSON.stringify(talk.document)],
  );
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: session } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at, time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, 'جلسة تستخدم القالب', 'نبذة', $2, 'introductory', 'ar', now() + interval '5 days', 60, now() + interval '5 days 1 hour', 'Asia/Riyadh', 30, 'القاعة', 'published', now())
     returning id`,
    [orgId, cat[0].id],
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id) values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(talk.document), posterVersion[0].id, session[0].id],
  );
  documentId = doc[0].id;

  const attendance = await platformDefault("certificate", "attendance");
  const { rows: cert } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, duplicated_from)
     values ($1, 'org', 'certificate', 'attendance', $2, $3) returning id`,
    [orgId, `نسختنا من ${attendance.name}`, attendance.template_id],
  );
  await db.query(`insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now())`, [
    cert[0].id,
    JSON.stringify(attendance.document),
  ]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const id of orgIds) await db.query(`delete from public.orgs where id = $1`, [id]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";

async function capture(p: Page, name: string) {
  expect(p.viewportSize()).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // DEC-149 §4: no smooth scroll under the capture.
  await p.emulateMedia({ reducedMotion: "reduce" });
  // ★ The cards draw their previews once near the viewport. Each one is
  // scrolled into view and must report `data-rendered="true"` — its frame
  // loaded and its faces ready — before the page is captured, so a blank
  // render cannot pass for one that never mounted (DEC-149 §4).
  const previews = main(p).locator("[data-template-preview]");
  const count = await previews.count();
  for (let i = 0; i < count; i++) {
    await previews.nth(i).scrollIntoViewIfNeeded();
    await expect(previews.nth(i), `${name}: card media ${i + 1} of ${count} never rendered`).toHaveAttribute("data-rendered", "true");
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  // ★ The page is captured at its own full height as the VIEWPORT, then the
  // phone viewport comes back. A `fullPage` screenshot paints beyond the
  // viewport, where Chromium throttles an iframe's rendering: cards whose
  // frames had loaded and reported ready came out as empty dark boxes below
  // the first screen. In the viewport, every frame paints.
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: PHONE.width, height });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/wave8-designer-templates-${name}.png` });
  await p.setViewportSize(PHONE);
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(1);
}

/** ★ DEC-145 / DEC-149 §4: under `/app` a page's content can be streamed twice,
 *  the second copy in a hidden `S:` segment outside `#main` — so every locator
 *  for page content scopes to `#main`. Dialogs, menus and toasts are portalled
 *  outside it and stay page-wide. */
const main = (page: Page) => page.locator("#main");

/** A card, by the name in its heading. */
const card = (page: Page, name: string) => main(page).locator("article", { has: page.getByRole("heading", { name, exact: true, level: 3 }) });

/* ── access ─────────────────────────────────────────────────────────────── */

test("a member reaches neither library nor the studio — the gated not-found (DEC-134)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["/ar/app/admin/templates/posters", "/ar/app/admin/templates/certificates", `/ar/app/admin/designer/${documentId}`]) {
    await page.goto(path);
    await expect(main(page).getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveCount(1);
  }
});

/* ── the poster library ─────────────────────────────────────────────────── */

test("★ REQ-DSG-008: a platform template is copied, never edited — and the empty name is refused beside the field", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByRole("heading", { name: "قوالب الملصقات", level: 1 })).toBeVisible();

  const talk = await platformDefault("poster", "talk");
  const platform = card(page, talk.name).filter({ hasText: "قالب المنصة" });
  await expect(platform).toBeVisible();
  // The action that EXISTS, and no other.
  await expect(platform.getByRole("button", { name: "افتح في المصمّم" })).toHaveCount(0);

  await platform.getByRole("button", { name: "انسخ إلى مؤسستي" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(talk.name);

  // ★ noValidate: the ACTION refuses the empty name, and says so by the field.
  await dialog.getByLabel(/اسم النسخة/).fill("");
  await dialog.getByRole("button", { name: "انسخ إلى مؤسستي" }).click();
  await expect(dialog.getByText("اكتب اسمًا للقالب.")).toBeVisible();

  await dialog.getByLabel(/اسم النسخة/).fill("نسخة ثانية من الجلسة");
  await dialog.getByRole("button", { name: "انسخ إلى مؤسستي" }).click();
  await expect(page.getByText("نُسخ القالب إلى مؤسستك.", { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(card(page, "نسخة ثانية من الجلسة")).toBeVisible();

  // A COPY: its own version 1, pointing back at where it came from.
  const { rows } = await db.query<{ duplicated_from: string; versions: string }>(
    `select t.duplicated_from, (select count(*) from public.design_template_versions v where v.template_id = t.id)::text as versions
       from public.design_templates t where t.org_id = $1 and t.name = 'نسخة ثانية من الجلسة'`,
    [orgId],
  );
  expect(rows[0]).toEqual({ duplicated_from: talk.template_id, versions: "1" });
});

test("★ an org template: set as default, renamed, retired behind a confirm that names it, and restored", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");

  const mine = card(page, orgPosterName);
  // The count the library shows is this org's use, from real rows.
  await expect(mine).toContainText("مستخدم في جلسة واحدة");

  await mine.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "اجعله الافتراضي" }).click();
  await expect(page.getByText("صار هذا القالب الافتراضي لعائلته.", { exact: true })).toBeVisible();
  await expect(mine.getByText("الافتراضي", { exact: true })).toBeVisible();

  await mine.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "غيّر الاسم" }).click();
  const renameDialog = page.getByRole("dialog");
  await renameDialog.getByLabel(/الاسم/).fill("جلساتنا الداكنة");
  await renameDialog.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByText("حُدّث الاسم.", { exact: true })).toBeVisible();
  orgPosterName = "جلساتنا الداكنة";

  const renamed = card(page, orgPosterName);
  await renamed.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "أحِله للتقاعد" }).click();
  const confirm = page.getByRole("dialog");
  // REQ-UIX-013: the confirm names the object and the consequence.
  await expect(confirm).toContainText(orgPosterName);
  await expect(confirm).toContainText("تبقى كما هي");
  await confirm.getByRole("button", { name: "أحِله للتقاعد" }).click();
  await expect(page.getByText("أُحيل القالب للتقاعد.", { exact: true })).toBeVisible();
  await expect(renamed.getByText("متقاعد", { exact: true })).toBeVisible();

  await renamed.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "أعِده للخدمة" }).click();
  await expect(page.getByText("أُعيد القالب للخدمة.", { exact: true })).toBeVisible();
});

test("★ REQ-DSG-007: the studio opens the template's draft, and publishing it adds a version and edits none", async ({ context, page }) => {
  test.skip(onPhone(), "the studio's editor is desktop-only (09)");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");

  await card(page, orgPosterName).getByRole("button", { name: "افتح في المصمّم" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/designer\//);
  await expect(main(page).getByRole("heading", { name: orgPosterName, level: 1 })).toBeVisible();
  await expect(main(page).getByText("مسودة قالب", { exact: true })).toBeVisible();
  await main(page).getByRole("navigation", { name: "مسار التنقّل" }).getByRole("link", { name: "قوالب الملصقات" }).click();

  const { rows: before } = await db.query<{ document: string }>(
    `select v.document::text as document from public.design_template_versions v join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.name = $2 and v.version = 1`,
    [orgId, orgPosterName],
  );
  const mine = card(page, orgPosterName);
  await expect(mine.getByText("مسودة غير منشورة")).toBeVisible();
  await mine.getByRole("button", { name: "انشر إصدارًا جديدًا" }).click();
  await expect(page.getByText("نُشر إصدار جديد. ما صدر قبله من ملصقات وشهادات يبقى على إصداره.", { exact: true })).toBeVisible();

  const { rows: after } = await db.query<{ version: number; document: string }>(
    `select v.version, v.document::text as document from public.design_template_versions v join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.name = $2 order by v.version`,
    [orgId, orgPosterName],
  );
  expect(after.map((r) => r.version)).toEqual([1, 2]);
  expect(after[0]!.document).toBe(before[0]!.document);
});

/* ── the certificate library ────────────────────────────────────────────── */

test("★ DEC-148: a blank certificate starts on the composition chosen for it, and the scheme is a preview choice", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(main(page).getByRole("heading", { name: "قوالب الشهادات", level: 1 })).toBeVisible();

  await main(page).getByRole("button", { name: "قالب فارغ" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/الاسم/).fill("شهادة حضورنا العمودية");
  // Only the certificate families are offered — no poster family leaks across.
  await expect(dialog.getByRole("option", { name: "ورشة" })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "عمودية" }).click();
  await dialog.getByRole("button", { name: "أنشئ" }).click();
  await expect(page.getByText("أُنشئ القالب.", { exact: true })).toBeVisible();

  const { rows } = await db.query<{ width: number; height: number }>(
    `select (v.document->'master'->>'width')::int as width, (v.document->'master'->>'height')::int as height
       from public.design_template_versions v join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.name = 'شهادة حضورنا العمودية'`,
    [orgId],
  );
  expect(rows[0]).toEqual({ width: 2480, height: 3508 });
  await expect(card(page, "شهادة حضورنا العمودية").getByText("عمودية", { exact: true })).toBeVisible();

  const schemes = main(page).getByRole("navigation", { name: "ألوان المعاينة" });
  await schemes.getByRole("link", { name: "داكن" }).click();
  await expect(page).toHaveURL(/scheme=dark/);
  await expect(schemes.getByRole("link", { name: "داكن" })).toHaveAttribute("aria-current", "true");
});

/* ── 390 px ─────────────────────────────────────────────────────────────── */

test("the libraries at 390 px — populated, the copy dialog, dark certificates, an empty org, and the moderator", async ({ context, page }) => {
  test.skip(!onPhone(), "the 390 px review runs on the phone project (TEAM.md §5)");
  await signIn(context, adminEmail);
  await page.setViewportSize(PHONE);

  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByRole("heading", { name: "قوالب الملصقات", level: 1 })).toBeVisible();
  await expect(card(page, orgPosterName)).toBeVisible();
  await capture(page, "posters-populated");

  const talk = await platformDefault("poster", "talk");
  await card(page, talk.name).filter({ hasText: "قالب المنصة" }).getByRole("button", { name: "انسخ إلى مؤسستي" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave8-designer-templates-posters-duplicate-dialog.png` });
  await page.keyboard.press("Escape");

  await page.goto("/ar/app/admin/templates/certificates");
  await expect(main(page).getByRole("heading", { name: "قوالب الشهادات", level: 1 })).toBeVisible();
  await capture(page, "certificates-populated");
  await page.goto("/ar/app/admin/templates/certificates?scheme=dark");
  await capture(page, "certificates-dark");
});

test("an org with no templates of its own is told what to do next", async ({ context, page }) => {
  await signIn(context, emptyAdminEmail);
  await page.setViewportSize(onPhone() ? PHONE : DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByText("لا قوالب لمؤسستك بعد")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "إلى قوالب المنصة" })).toBeVisible();
  if (onPhone()) await capture(page, "posters-empty-org");
});

test("a moderator reads the library and is offered no write", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.setViewportSize(onPhone() ? PHONE : DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(main(page).getByRole("heading", { name: "قوالب الملصقات", level: 1 })).toBeVisible();
  await expect(main(page).getByText("إنشاؤها وتعديلها من صلاحيات مشرف المؤسسة", { exact: false })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "انسخ إلى مؤسستي" })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "قالب فارغ" })).toHaveCount(0);
  if (onPhone()) await capture(page, "posters-moderator");
});
