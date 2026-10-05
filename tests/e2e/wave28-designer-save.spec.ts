// ★★ WAVE 28 — THE PERSON SAVES, AND LEAVING ASKS (REQ-DSG-036, STORY-DSG-019, DEC-258, DEC-259).
//
// The owner's words: «instead of auto save i want the user to manually save and in case they made edits that weren't
// saved then a popup shows up to either discard or save». Performed with `click()` and `selectOption()` alone — no
// mouse, no keyboard — so the three answers are proven on the single-pointer path (DEC-093);
// `tests/unit/designer-taps-guard.test.ts` holds this file to that. Reading the stored document after each step:
//
//   · an edit sends no PUT, however long it waits; the bar says «غير محفوظ»; «احفظ» sends one; the bar says «محفوظ»;
//   · an undo back to the saved document reads «محفوظ» again, with no request — dirty is derived, never flagged;
//   · the back link asks: «ابقَ» stays, «تجاهلها وغادر» leaves with the server's document unchanged and no draft,
//     «احفظ وغادر» leaves with the edit stored, and a save that FAILS keeps the person in the editor with «لم يُحفظ»;
//   · «معاينة بجلسة» saves nothing and keeps the unsaved edit on screen (the editor stays mounted);
//   · «انشر» on a template draft saves first, then publishes what was saved.
//
// Captures: `.qa-shots/rtl/wave28-designer-<state>-1280.png` — unsaved, saved, leave-dialog, save-failed.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The pre-wave-24 `talk` composition, read from 0098 — the fixture wave 23's studio specs own (wave 27, PR D). */
function legacyTalk(): unknown {
  const dir = join(process.cwd(), "supabase", "migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_certificate_library.sql"));
  if (!file) throw new Error("0098 (the certificate library) is not in supabase/migrations");
  const m = readFileSync(join(dir, file), "utf8").match(/-- @family talk@v2[\s\S]*?\$json\$([\s\S]*?)\$json\$/);
  if (!m) throw new Error("0098 has no talk@v2 document");
  return JSON.parse(m[1]!);
}

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1440, height: 1000 };
const SESSION_TITLE = "الموجة 28: الحفظ بيد صاحبه";
const TEMPLATE = "قالب الموجة 28";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let sessionId = "";
let posterId = "";
let templateId = "";
let draftId = "";
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
  const domain = `save28-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الحفظ', $1, 'SV', gen_random_uuid(), $2) returning id`,
    [`save28-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الحفظ" } });
  if (error) throw error;
  userIds.push(data.user.id);
  await provisionMemberId(adminEmail);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الحفظ') returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, $2, 'نبذة الجلسة', $3, 'introductory', 'ar', now() + interval '7 days', 60, now() + interval '7 days 1 hour',
             'Asia/Riyadh', 40, 'القاعة الكبرى', 'published', now())
     returning id`,
    [orgId, SESSION_TITLE, cat[0].id],
  );
  sessionId = sess[0].id;
  const { rows: tpl } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'talk', $2) returning id`,
    [orgId, TEMPLATE],
  );
  templateId = tpl[0].id;
  const { rows: version } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now()) returning id`,
    [templateId, JSON.stringify(legacyTalk())],
  );
  // A detached session poster (the back link goes to the session's schedule) …
  const { rows: poster } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(legacyTalk()), version[0].id, sessionId],
  );
  posterId = poster[0].id;
  await db.query(
    `insert into public.session_posters (org_id, session_id, document_id, mode, binding, detached_at)
     values ($1, $2, $3, 'customised', 'detached', now())
     on conflict (session_id) do update set document_id = excluded.document_id, mode = 'customised', binding = 'detached', detached_at = now()`,
    [orgId, sessionId, posterId],
  );
  // … and the template's working draft, which previews with a session and publishes.
  const { rows: draft } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, draft_for_template_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(legacyTalk()), version[0].id, templateId],
  );
  draftId = draft[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";
/** ★ DEC-145: page content under `/app` is found inside `#main`. */
const main = (page: Page) => page.locator("#main");
const bar = (page: Page) => main(page).getByRole("toolbar").first();
const panel = (page: Page) => main(page).getByRole("tablist", { name: "لوحات المحرّر", exact: true });
const railPanel = (page: Page) => main(page).getByRole("tabpanel").first();
const saveButton = (page: Page) => bar(page).getByRole("button", { name: "احفظ", exact: true });
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: "لم تُحفظ تعديلاتك" });

async function layerCount(id: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select jsonb_array_length(document->'layers') as n from public.design_documents where id = $1`, [id]);
  return rows[0].n;
}

/** Every PUT the page sends to the save route — the proof that nothing saves on its own. */
function countPuts(page: Page, id: string): { n: number } {
  const counter = { n: 0 };
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes(`/api/designer/${id}`)) counter.n += 1;
  });
  return counter;
}

async function open(page: Page, id: string, heading: string) {
  await page.goto(`/ar/app/admin/designer/${id}`);
  await expect(main(page).getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

/** One edit, by taps: «دائرة» in العناصر adds an ellipse (wave 23's tap path). */
async function addCircle(page: Page) {
  await panel(page).getByRole("tab", { name: "العناصر", exact: true }).click();
  await railPanel(page).getByRole("button", { name: "دائرة", exact: true }).click();
}

async function pressSave(page: Page, id: string) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/designer/${id}`) && r.request().method() === "PUT" && r.status() === 200),
    saveButton(page).click(),
  ]);
}

test.beforeEach(async ({ page }) => {
  test.skip(onPhone(), "the editor is desktop-only (06 §2); the phone is view and approve");
  await page.setViewportSize(DESKTOP);
});

test("★ an edit sends nothing; «احفظ» sends one; an undo back to the saved document reads «محفوظ» with no request", async ({ context, page }) => {
  await signIn(context, adminEmail);
  const puts = countPuts(page, posterId);
  await open(page, posterId, SESSION_TITLE);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  const before = await layerCount(posterId);

  await addCircle(page);
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  // Long past the old autosave's 1.2 s: nothing reaches the server until the person says so.
  await page.waitForTimeout(3_000);
  expect(puts.n).toBe(0);
  expect(await layerCount(posterId)).toBe(before);
  await page.screenshot({ path: `${SHOTS}/wave28-designer-unsaved-1280.png` });

  await pressSave(page, posterId);
  expect(puts.n).toBe(1);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  expect(await layerCount(posterId)).toBe(before + 1);
  await page.screenshot({ path: `${SHOTS}/wave28-designer-saved-1280.png` });

  // Dirty is derived: an edit and its undo are the saved document again, and say so without a request.
  await addCircle(page);
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  await bar(page).getByRole("button", { name: "تراجع", exact: true }).click();
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(puts.n).toBe(1);
});

test("★ leaving asks — «ابقَ» stays, «تجاهلها وغادر» leaves the server's document unchanged, «احفظ وغادر» stores the edit", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  const back = main(page).getByRole("link", { name: "جدولة الجلسة" });

  // «ابقَ»
  await addCircle(page);
  await back.click();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(leaveDialog(page).getByRole("button", { name: "احفظ وغادر" })).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/wave28-designer-leave-dialog-1280.png` });
  await leaveDialog(page).getByRole("button", { name: "ابقَ", exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/admin/designer/${posterId}`));
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();

  // «تجاهلها وغادر»: the server's document is unchanged, and reopening offers nothing — the draft went with it.
  await back.click();
  await leaveDialog(page).getByRole("button", { name: "تجاهلها وغادر", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${sessionId}/schedule`));
  expect(await layerCount(posterId)).toBe(before);
  await open(page, posterId, SESSION_TITLE);
  await expect(main(page).getByRole("region", { name: "تعديلات لم تُحفظ" })).toHaveCount(0);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();

  // «احفظ وغادر»: one save, then the way out.
  await addCircle(page);
  await back.click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/designer/${posterId}`) && r.request().method() === "PUT" && r.status() === 200),
    leaveDialog(page).getByRole("button", { name: "احفظ وغادر", exact: true }).click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${sessionId}/schedule`));
  expect(await layerCount(posterId)).toBe(before + 1);
});

test("★ a save that fails keeps the person in the editor — «لم يُحفظ», the dialog closed, nothing lost", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  await page.route(`**/api/designer/${posterId}`, (route) =>
    route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue(),
  );
  await addCircle(page);
  await main(page).getByRole("link", { name: "جدولة الجلسة" }).click();
  await leaveDialog(page).getByRole("button", { name: "احفظ وغادر", exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/admin/designer/${posterId}`));
  await expect(bar(page).getByText("لم يُحفظ", { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/wave28-designer-save-failed-1280.png` });
  expect(await layerCount(posterId)).toBe(before);
  await page.unroute(`**/api/designer/${posterId}`);
  // The retry is one press.
  await pressSave(page, posterId);
  expect(await layerCount(posterId)).toBe(before + 1);
});

test("«معاينة بجلسة» saves nothing, and the unsaved edit stays on screen", async ({ context, page }) => {
  await signIn(context, adminEmail);
  const puts = countPuts(page, draftId);
  await open(page, draftId, TEMPLATE);
  await addCircle(page);
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  await bar(page).getByRole("combobox", { name: "معاينة بجلسة" }).selectOption({ label: SESSION_TITLE });
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}`));
  await expect(leaveDialog(page)).toHaveCount(0);
  // The editor stayed mounted (Next keys a page's state without its search params): the edit is still the screen's.
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  expect(puts.n).toBe(0);
});

test("★ «انشر» saves first, then publishes what was saved", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, draftId, TEMPLATE);
  const before = await layerCount(draftId);
  await addCircle(page);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/designer/${draftId}`) && r.request().method() === "PUT" && r.status() === 200),
    bar(page).getByRole("button", { name: "انشر", exact: true }).click(),
  ]);
  await expect(page.getByText("نُشر إصدار جديد من القالب.", { exact: true })).toBeVisible();
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  const { rows } = await db.query<{ n: number }>(
    `select jsonb_array_length(document->'layers') as n from public.design_template_versions where template_id = $1 order by version desc limit 1`,
    [templateId],
  );
  expect(rows[0].n).toBe(before + 1);
});
