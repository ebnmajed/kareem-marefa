// ★★ WAVE 28 — THE LOCAL DRAFT (REQ-DSG-036, STORY-DSG-020, DEC-258 §2.3, DEC-259 §2).
//
// A manual save that loses a closed laptop's edits is worse than the autosave it replaced, so the editor mirrors an
// unsaved document to the browser's own storage — never the server — and offers it back when it reopens:
//
//   · close-reopen-restore: a reload with unsaved edits gets the browser's own question; the reopened editor offers
//     the edits, is READ-ONLY until answered (DEC-259 §2.6), and «استعِدها» puts them back, unsaved;
//   · the browser's Back is not intercepted — the draft answers it: Back, then Forward, and the edits are offered;
//   · a STALE draft (the server's document moved since) says so and what restoring means, and is never applied or
//     dropped silently; restored and saved, it replaces the newer version;
//   · another admin on the same browser sees no offer — the draft is keyed by member and document;
//   · ⌘S / Ctrl+S saves, inside a text field too;
//   · storage that throws never breaks editing.
//
// Captures: `.qa-shots/rtl/wave28-designer-<state>-1280.png` — draft-offer, draft-offer-stale.
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
const SESSION_TITLE = "الموجة 28: مسودة لا تضيع";
const TEMPLATE = "قالب مسودة الموجة 28";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let otherEmail = "";
let sessionId = "";
let posterId = "";
let templateId = "";
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
  const domain = `draft28-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المسودة', $1, 'DR', gen_random_uuid(), $2) returning id`,
    [`draft28-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الحفظ" } });
  if (error) throw error;
  userIds.push(data.user.id);
  await provisionMemberId(adminEmail);
  // A second admin of the same org, for the same browser.
  otherEmail = `other@${domain}`;
  const { data: other, error: otherError } = await admin.auth.admin.createUser({ email: otherEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف آخر" } });
  if (otherError) throw otherError;
  userIds.push(other.user.id);
  const otherMember = await provisionMemberId(otherEmail);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [otherMember]);

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

async function layerCount(id: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select jsonb_array_length(document->'layers') as n from public.design_documents where id = $1`, [id]);
  return rows[0].n;
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


const offer = (page: Page) => main(page).getByRole("region", { name: "تعديلات لم تُحفظ" });

/** Every dialog is accepted — a reload with unsaved edits meets `beforeunload`, the browser's own question. */
function acceptDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on("dialog", (d) => {
    seen.push(d.type());
    void d.accept();
  });
  return seen;
}

/** Whether leaving would be asked about by the browser — `beforeunload` armed. */
const asksOnUnload = (page: Page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

test.beforeEach(async ({ page }) => {
  test.skip(onPhone(), "the editor is desktop-only (06 §2); the phone is view and approve");
  await page.setViewportSize(DESKTOP);
});

test("★ close-reopen-restore — the reopened editor offers the edits, waits read-only for an answer, and restores them unsaved", async ({ context, page }) => {
  await signIn(context, adminEmail);
  acceptDialogs(page);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  expect(await asksOnUnload(page)).toBe(false);
  await addCircle(page);
  expect(await asksOnUnload(page)).toBe(true);
  await page.reload();
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();

  await expect(offer(page)).toBeVisible();
  await expect(offer(page).getByText("لم تُحفظ تعديلاتك في المرة السابقة.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave28-designer-draft-offer-1280.png` });
  expect(await layerCount(posterId)).toBe(before);

  // ★ DEC-259 §2.6: nothing is edited while the offer waits — the add tiles are disabled, undo is gone, and Save and
  // ⌘S are inert.
  await panel(page).getByRole("tab", { name: "العناصر", exact: true }).click();
  await expect(railPanel(page).getByRole("button", { name: "دائرة", exact: true })).toBeDisabled();
  await expect(bar(page).getByRole("button", { name: "تراجع", exact: true })).toHaveCount(0);
  await expect(saveButton(page)).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+s");
  await page.waitForTimeout(500);
  expect(await layerCount(posterId)).toBe(before);

  await offer(page).getByRole("button", { name: "استعِدها", exact: true }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  expect(await layerCount(posterId)).toBe(before);
  await pressSave(page, posterId);
  expect(await layerCount(posterId)).toBe(before + 1);
  // A save that landed deletes the draft: reopening offers nothing.
  await open(page, posterId, SESSION_TITLE);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
});

test("★ the browser's Back is not intercepted — the draft answers it", async ({ context, page }) => {
  await signIn(context, adminEmail);
  acceptDialogs(page);
  await open(page, posterId, SESSION_TITLE);
  // Arrive at the studio by a client-side navigation, so Back is the App Router's own.
  await main(page).getByRole("link", { name: "جدولة الجلسة" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${sessionId}/schedule`));
  await page.goBack();
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();

  await addCircle(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${sessionId}/schedule`));
  await page.goForward();
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();
  await expect(offer(page)).toBeVisible();
  await offer(page).getByRole("button", { name: "احذفها", exact: true }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
});

test("★ a stale draft says so, and restored and saved it replaces the newer version", async ({ context, page }) => {
  await signIn(context, adminEmail);
  acceptDialogs(page);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  await addCircle(page);
  await page.waitForTimeout(500); // the idle write
  // Another admin saved since: the server's document moved after the edits were made.
  await db.query(`update public.design_documents set updated_at = now() + interval '1 minute' where id = $1`, [posterId]);
  await page.reload();
  await expect(offer(page)).toBeVisible();
  await expect(offer(page).getByText("لم تُحفظ تعديلاتك في المرة السابقة، وحُفظت بعدها نسخة أحدث من هذا المستند.", { exact: true })).toBeVisible();
  await expect(offer(page).getByText("إن استعدتها وحفظتها حلّت محلّ النسخة الأحدث.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave28-designer-draft-offer-stale-1280.png` });
  await offer(page).getByRole("button", { name: "استعِدها", exact: true }).click();
  await pressSave(page, posterId);
  expect(await layerCount(posterId)).toBe(before + 1);
});

test("another admin on the same browser sees no offer — the draft is the member's", async ({ context, page }) => {
  await signIn(context, adminEmail);
  acceptDialogs(page);
  await open(page, posterId, SESSION_TITLE);
  await addCircle(page);
  await page.waitForTimeout(500);
  await context.clearCookies();
  await signIn(context, otherEmail);
  await page.reload();
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
  // … and the first admin's draft is still theirs.
  await context.clearCookies();
  await signIn(context, adminEmail);
  await page.reload();
  await expect(offer(page)).toBeVisible();
  await offer(page).getByRole("button", { name: "احذفها", exact: true }).click();
});

test("⌘S / Ctrl+S saves — inside a text field too", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  await addCircle(page);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/designer/${posterId}`) && r.request().method() === "PUT" && r.status() === 200),
    page.keyboard.press("ControlOrMeta+s"),
  ]);
  await expect(bar(page).getByText("محفوظ", { exact: true })).toBeVisible();
  expect(await layerCount(posterId)).toBe(before + 1);

  // The new circle is selected and its الطبقة panel open: type a width and save from inside the field.
  await panel(page).getByRole("tab", { name: "الطبقة", exact: true }).click();
  const inspector = main(page).getByRole("region", { name: "الخصائص", exact: true });
  await inspector.getByRole("tab", { name: "الموضع", exact: true }).click();
  const numbers = inspector.getByRole("button", { name: "الموضع والحجم", exact: true });
  if ((await numbers.getAttribute("aria-expanded")) === "false") await numbers.click();
  const width = inspector.getByLabel("العرض", { exact: true });
  await width.fill("321");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/designer/${posterId}`) && r.request().method() === "PUT" && r.status() === 200),
    width.press("ControlOrMeta+s"),
  ]);
  const { rows } = await db.query<{ w: number }>(`select (document->'layers'->-1->'frame'->>'w')::int as w from public.design_documents where id = $1`, [posterId]);
  expect(rows[0].w).toBe(321);
});

test("★ storage that throws never breaks editing — the edit saves, and nothing is said about the draft", async ({ context, page }) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await signIn(context, adminEmail);
  acceptDialogs(page);
  await open(page, posterId, SESSION_TITLE);
  const before = await layerCount(posterId);
  await addCircle(page);
  await expect(bar(page).getByText("غير محفوظ", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(main(page).getByRole("alert")).toHaveCount(0);
  await pressSave(page, posterId);
  expect(await layerCount(posterId)).toBe(before + 1);
});
