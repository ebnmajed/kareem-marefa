// /app/me/privacy rebuilt from `Privacy.dc.html` (wave 26, PR B) — REQ-UIX-117, REQ-PRF-006, REQ-PRF-007, REQ-PRF-008,
// REQ-NFR-005, DEC-208, DEC-251 §3, against REAL local Supabase, on the phone project at the artboard's 390 × 844.
//
// ★ The artboard draws ONE export state; the screen draws every state the row can hold, each seeded here and captured
// at `${E2E_SHOTS_DIR}/wave26-branding-privacy-<state>-390.png`:
//   never-asked · requested · building · ready · expired · failed-limited · sheet-open · sent
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
const userIds: string[] = [];

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return data;
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w26-privacy-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الخصوصية', $1, 'WPV', gen_random_uuid()) returning id`,
    [`w26-privacy-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** A capture at rest, as the page is drawn — no stitching. The toast is closed, nothing is focused (the skip link would
 *  show), and the viewport is grown to the document's height for the shot, so a sticky bar is painted once, at the
 *  top, instead of across a stitched full-page image; then the viewport is put back. */
async function atRest(page: Page, path: string) {
  const toastClose = page.getByRole("button", { name: "إغلاق الإشعار" });
  for (const close of await toastClose.all()) await close.click().catch(() => {});
  await expect(toastClose).toHaveCount(0);
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  });
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
  await page.screenshot({ path });
  await page.setViewportSize(viewport);
}

async function capture(page: Page, state: string, width: 390 | 1280 = 390) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await atRest(page, `${SHOTS}/wave26-branding-privacy-${state}-${width}.png`);
}

/** One export row in the given state; `hoursAgo` decides whether the 24-hour limit still applies. */
async function seed(status: "queued" | "building" | "ready" | "expired" | "failed", hoursAgo: number) {
  await db.query(`delete from public.data_export_requests where member_id = $1`, [memberId]);
  const done = status === "queued" || status === "building" ? null : `now() - make_interval(hours => ${hoursAgo})`;
  await db.query(
    `insert into public.data_export_requests (org_id, member_id, status, requested_at, completed_at, storage_path, byte_size)
     values ($1, $2, $3::public.data_export_status, now() - make_interval(hours => $4), ${done ?? "null"}, $5, $6)`,
    [orgId, memberId, status, hoursAgo, status === "ready" ? `orgs/${orgId}/exports/${memberId}.json` : null, status === "ready" ? 4096 : null],
  );
}

test("★ every export state from the data, the hub page's rows, and «إيقاف حسابي» behind its sheet", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the privacy artboard is drawn at 390");
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  memberId = (await db.query<{ id: string }>(`select id from public.members where org_id = $1`, [orgId])).rows[0].id;
  const main = page.locator("#main");

  await page.goto("/ar/app/me/privacy");
  await expect(main.getByRole("heading", { name: "البيانات والخصوصية", level: 1 })).toBeVisible();
  await expect(main.getByRole("button", { name: "اطلب التصدير" })).toBeVisible();
  await expect(main.getByRole("link", { name: /سياسة الخصوصية/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /الشروط والأحكام/ })).toBeVisible();
  // ★ REQ-PRF-008: the profile-picture answer is still given here.
  await expect(main.getByRole("heading", { name: "صورتك الشخصية" })).toBeVisible();
  await capture(page, "never-asked");

  await seed("queued", 0);
  await page.reload();
  await expect(main.getByText(/^طُلب · /)).toBeVisible();
  await capture(page, "requested");

  await seed("building", 0);
  await page.reload();
  await expect(main.getByText("جارٍ", { exact: true })).toBeVisible();
  await capture(page, "building");

  await seed("ready", 1);
  await page.reload();
  await expect(main.getByText(/^جاهز · /)).toBeVisible();
  await expect(main.getByRole("link", { name: "نزّل", exact: true })).toHaveAttribute("href", "/api/me/export");
  await expect(main.getByText(/سبعة أيام/)).toBeVisible();
  await capture(page, "ready");

  await seed("expired", 24 * 9);
  await page.reload();
  await expect(main.getByText("انتهت صلاحيته")).toBeVisible();
  await expect(main.getByRole("button", { name: "اطلب نسخة جديدة" })).toBeVisible();
  await capture(page, "expired");

  // REQ-NFR-005: inside the 24 hours the limit is said before the click, and no button is offered.
  await seed("failed", 1);
  await page.reload();
  await expect(main.getByText("تعثّر", { exact: true })).toBeVisible();
  await expect(main.getByText(/أربع وعشرين ساعة/)).toBeVisible();
  await expect(main.getByRole("button", { name: /اطلب/ })).toHaveCount(0);
  await capture(page, "failed-limited");

  // «إيقاف حسابي»: a sheet that holds the reason; sent once; the request reaches the audit and deactivates nobody.
  await main.getByRole("button", { name: "إيقاف حسابي" }).click();
  const sheet = page.getByRole("dialog", { name: "إيقاف حسابي" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel(/سبب الطلب/).fill("أغادر المؤسسة نهاية الشهر");
  await capture(page, "sheet-open");
  await sheet.getByRole("button", { name: "أرسل الطلب" }).click();
  await expect(main.getByRole("status")).toContainText("أُرسل طلبك");
  const { rows } = await db.query<{ status: string }>(
    `select m.status from public.audit_log a join public.members m on m.id = a.subject_id
      where a.org_id = $1 and a.action = 'member.deactivation_requested'`,
    [orgId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("active");
  await capture(page, "sent");
});

test("/app/me/privacy at 1280 — a ready export inside the window, under the desktop hub frame", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the 1280 capture runs on the desktop project");
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(context, memberEmail);
  memberId = (await db.query<{ id: string }>(`select id from public.members where org_id = $1`, [orgId])).rows[0].id;
  const main = page.locator("#main");

  await seed("ready", 1);
  await page.goto("/ar/app/me/privacy");
  await expect(main.getByRole("heading", { name: "البيانات والخصوصية", level: 1 })).toBeVisible();
  await expect(main.getByText(/^جاهز · /)).toBeVisible();
  await expect(main.getByRole("link", { name: "نزّل", exact: true })).toHaveAttribute("href", "/api/me/export");
  await expect(main.getByText(/أربع وعشرين ساعة/)).toBeVisible();
  await capture(page, "ready", 1280);
});
