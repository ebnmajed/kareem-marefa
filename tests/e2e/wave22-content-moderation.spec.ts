// Wave 22 · `content` — moderation, ACTIONED (DEC-231 §0.2, REQ-UIX-103, REQ-UIX-104, REQ-ADM-010, REQ-ADM-023).
// The job, shown end to end as a moderator on a production build: on البلاغات a reported comment is read and decided
// in its row, and «مغلقة» then shows the outcome and who decided; on الصور the queue is walked with ↑ ↓, Enter opens a
// photo beside it, a decision moves focus to the next photo — and every decision leaves its record. The captures are
// the lead's evidence beside the artboards: `.qa-shots/rtl/wave22-content-<screen>-<state>-<1280|390>.png`.
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
const SHA = "0123456789abcdef".repeat(4);
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let modEmail = "";
let modMemberId = "";
let sessionTitle = "";
const comments: { id: string; body: string }[] = [];
const photos: string[] = [];
let reportedPhoto = "";
const userIds: string[] = [];

const shots = () => process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
const width = () => (test.info().project.name === "phone" ? "390" : "1280");

async function provision(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw signInErr;
  const { data: provisioned, error: rpcErr } = await client.rpc("provision_member");
  if (rpcErr) throw rpcErr;
  return (provisioned as { member_id: string }).member_id;
}

async function upload(path: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": "image/jpeg", "x-upsert": "true" },
    body: TINY_JPEG as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${path} failed: ${res.status} ${await res.text()}`);
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w22-mod-${tag}.example`;
  modEmail = `mod@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('شبه الجزيرة', $1, 'WM', gen_random_uuid(), $2) returning id`,
    [`w22-mod-${tag}`, `boss@${domain}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'مهارات') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);
  sessionTitle = "العرض في 5 شرائح";
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() - interval '3 days', 60, now() - interval '3 days' + interval '1 hour', $4, 30, 'completed', now() - interval '5 days')
     returning id`,
    [orgId, sessionTitle, cat[0].id, venue[0].id],
  );
  const sessionId = sess[0].id;

  modMemberId = await provision(modEmail, "سلمى الحربي");
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
  const author = await provision(`author@${domain}`, "خالد الغامدي");
  const reem = await provision(`reem@${domain}`, "ريم الشهري");
  const noura = await provision(`noura@${domain}`, "نورة العتيبي");

  // Two reported comments: the first by two members, three days ago; the second today.
  for (const [body, reporters, days] of [
    ["هذا الكلام لا يصلح لجلسة عمل، وفيه إساءة واضحة لأحد الحضور", [[reem, "إساءة"], [noura, "لغة غير لائقة"]], 3],
    ["رابط لمنتج خارجي لا علاقة له بالجلسة", [[noura, "دعاية"]], 0],
  ] as const) {
    const { rows: c } = await db.query<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, $4) returning id`, [orgId, sessionId, author, body]);
    comments.push({ id: c[0].id, body });
    for (const [reporter, reason] of reporters) {
      await db.query(
        `insert into public.reports (org_id, target, comment_id, reporter_id, reason, created_at) values ($1, 'comment', $2, $3, $4, now() - make_interval(days => $5::int))`,
        [orgId, c[0].id, reporter, reason, days],
      );
    }
  }

  // Three photos: two taken down (hidden at the request), one reported and still visible.
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    const path = `${orgId}/sessions/${sessionId}/photos/${id}.jpg`;
    await upload(path);
    await db.query(
      `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
       values ($1, $2, $3, $4, $5, 1200, 800, 2048, $6, true)`,
      [id, orgId, sessionId, author, path, SHA],
    );
    photos.push(id);
  }
  for (const [i, requester] of [[0, reem], [1, noura]] as const) {
    await db.query(`insert into public.photo_takedowns (org_id, photo_id, requester_id, requested_at) values ($1, $2, $3, now() - make_interval(days => $4::int))`, [orgId, photos[i], requester, 1 - i]);
  }
  reportedPhoto = photos[2];
  await db.query(`insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'صورة لا تخص الجلسة')`, [orgId, reportedPhoto, reem]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: modEmail, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Waits out the streamed Suspense boundaries — a capture of a skeleton proves nothing. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("050/052 — a reported comment is read in its row, and its reporters and reasons are all there", async ({ context, page }) => {
  await signIn(context);
  const main = page.locator("#main");
  await goto(page, "/ar/app/admin/moderation/reports");
  await expect(main.getByRole("heading", { name: "الإشراف — البلاغات", level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: "مفتوحة 2" })).toHaveAttribute("aria-current", "true");
  await expect(main.getByText("+1").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("3 أيام").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-050-open-${width()}.png`, fullPage: true });

  await main.getByRole("button", { name: /^أزل — هذا الكلام/ }).click();
  const dialog = page.getByRole("dialog", { name: `إزالة تعليق من «${sessionTitle}»؟` });
  await expect(dialog.getByText(comments[0].body)).toBeVisible();
  await expect(dialog.getByText("لغة غير لائقة")).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-050-remove-${width()}.png` });
  await dialog.getByRole("button", { name: "تراجع" }).click();
});

test("050/052 — «تجاهل» decides in the row; «مغلقة» shows the outcome and who decided; one report.resolved per report", async ({ context, page }) => {
  await signIn(context);
  const main = page.locator("#main");
  await goto(page, "/ar/app/admin/moderation/reports");
  await main.getByRole("button", { name: /^تجاهل — هذا الكلام/ }).click();
  await expect(page.getByRole("status")).toContainText("سُجّل القرار");
  await expect(main.getByRole("link", { name: "مفتوحة 1" })).toBeVisible();

  const { rows } = await db.query<{ status: string; resolution: string; resolved_by: string }>(
    `select status, resolution, resolved_by from public.reports where comment_id = $1`,
    [comments[0].id],
  );
  expect(rows).toEqual([
    { status: "resolved", resolution: "dismissed", resolved_by: modMemberId },
    { status: "resolved", resolution: "dismissed", resolved_by: modMemberId },
  ]);
  // The lead's trigger (DEC-231 §4): one `report.resolved` per closed report, the moderator its actor.
  const audit = await db.query(`select 1 from public.audit_log where action = 'report.resolved' and actor_id = $1 and org_id = $2`, [modMemberId, orgId]);
  expect(audit.rowCount).toBe(2);

  await goto(page, "/ar/app/admin/moderation/reports?state=closed");
  await expect(main.getByText("تُجوهل", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("سلمى الحربي").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-050-closed-${width()}.png`, fullPage: true });
});

test("051 — the queue is walked with ↑ ↓ and Enter, beside the photo; the status says it is hidden", async ({ context, page }) => {
  test.skip(test.info().project.name === "phone", "the split view's two panes are the desktop's; the phone opens a photo on its own route");
  await signIn(context);
  const main = page.locator("#main");
  await goto(page, "/ar/app/admin/moderation/photos");
  await expect(main.getByRole("heading", { name: "الإشراف — الصور", level: 1 })).toBeVisible();
  await expect(main.getByText("مخفية بانتظار المراجعة")).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-051-takedowns-1280.png`, fullPage: true });

  const list = main.getByRole("list", { name: "صور بانتظار القرار" });
  await list.getByRole("link").first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/moderation/photos/${photos[1]}$`));
  await expect(list.getByRole("link").nth(1)).toHaveAttribute("aria-current", "page");
});

test("051 — «أعدها للعرض» restores in one press, writes photo.restored, and focus lands on the next photo", async ({ context, page }) => {
  await signIn(context);
  const main = page.locator("#main");
  await goto(page, `/ar/app/admin/moderation/photos/${photos[0]}`);
  await main.getByRole("button", { name: "أعدها للعرض" }).click();
  await expect(page.getByRole("status")).toContainText("سُجّل القرار");
  await expect(main.getByText("ظاهرة", { exact: true })).toBeVisible();

  const { rows } = await db.query<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photos[0]]);
  expect(rows[0].hidden_at).toBeNull();
  const audit = await db.query(`select 1 from public.audit_log where action = 'photo.restored' and subject_id = $1 and actor_id = $2`, [photos[0], modMemberId]);
  expect(audit.rowCount).toBe(1);
  if (test.info().project.name !== "phone") {
    await expect(main.getByRole("list", { name: "صور بانتظار القرار" }).getByRole("link").first()).toBeFocused();
  }
});

test("051 — a reported photo is visible, and its detail says so; the closed list shows what was decided", async ({ context, page }) => {
  await signIn(context);
  const main = page.locator("#main");
  await goto(page, `/ar/app/admin/moderation/photos/${reportedPhoto}?kind=reports`);
  await expect(main.getByText("ظاهرة", { exact: true })).toBeVisible();
  await expect(main.getByText("صورة لا تخص الجلسة")).toBeVisible();
  await expect(main.getByRole("button", { name: "تجاهل" })).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-051-report-${width()}.png`, fullPage: true });

  await goto(page, "/ar/app/admin/moderation/photos?kind=closed");
  await expect(main.getByText(/أُعيدت للعرض/).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22-content-051-closed-${width()}.png`, fullPage: true });
});
