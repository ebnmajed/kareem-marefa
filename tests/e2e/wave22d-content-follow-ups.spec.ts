// Wave 22, PR D · `content` — the two carried gaps, end to end on a production build (F1, F6):
//   · REQ-EVT-008 — a member reports a photograph from the lightbox, once; the report lands on SCR-051's «بلاغات الصور»
//     with the reporter visible to staff; the photograph stays visible;
//   · REQ-EVT-014 — staff remove a comment on the event page with a reason; every open report on it closes; the records
//     are the triggers' (`comment.removed` with the reason, `report.resolved`).
// Captures at 390: `.qa-shots/rtl/wave22d-content-<surface>-<state>-390.png`.
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
let sessionId = "";
let photoId = "";
let commentId = "";
let reportId = "";
let modMemberId = "";
let memberId = "";
const emails = { mod: "", member: "" };
const userIds: string[] = [];

const shots = () => process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

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

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w22d-${tag}.example`;
  emails.mod = `mod@${domain}`;
  emails.member = `member@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('شبه الجزيرة', $1, 'WD', gen_random_uuid(), $2) returning id`,
    [`w22d-${tag}`, `boss@${domain}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'مهارات') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'الأرقام التي تكذب', 'ملخص', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour', $3, 30, 'completed', now() - interval '4 days')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;

  modMemberId = await provision(emails.mod, "سلمى الحربي");
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
  memberId = await provision(emails.member, "ريم الشهري");
  const author = await provision(`author@${domain}`, "خالد الغامدي");

  // A visible photograph by someone else, uploaded through the real path's shape.
  photoId = randomUUID();
  const path = `${orgId}/sessions/${sessionId}/photos/${photoId}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": "image/jpeg", "x-upsert": "true" },
    body: TINY_JPEG as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload failed: ${res.status}`);
  await db.query(
    `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped) values ($1, $2, $3, $4, $5, 1200, 800, 2048, $6, true)`,
    [photoId, orgId, sessionId, author, path, SHA],
  );

  // A comment with an open report on it.
  const { rows: c } = await db.query<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'رابط لمنتج خارجي لا علاقة له بالجلسة') returning id`, [orgId, sessionId, author]);
  commentId = c[0].id;
  const { rows: r } = await db.query<{ id: string }>(`insert into public.reports (org_id, target, comment_id, reporter_id, reason) values ($1, 'comment', $2, $3, 'دعاية') returning id`, [orgId, commentId, memberId]);
  reportId = r[0].id;
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((x) => ({ name: x.name, value: x.value, domain: "localhost", path: "/" })));
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("REQ-EVT-008: a member reports a photograph from the lightbox, once; it stays visible", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 review — the phone project");
  await signIn(context, emails.member);
  await goto(page, `/ar/app/sessions/${sessionId}`);
  await page.locator("#main").getByRole("button", { name: /^افتح الصورة 1 من 1/ }).click();
  const lightbox = page.getByRole("dialog", { name: "صور الجلسة" });
  await lightbox.getByRole("button", { name: "إبلاغ" }).click();
  const dialog = page.getByRole("dialog", { name: "الإبلاغ عن صورة" });
  await page.screenshot({ path: `${shots()}/wave22d-content-photo-report-dialog-390.png` });
  await dialog.getByRole("button", { name: "إرسال البلاغ" }).click();
  await expect(dialog.getByText("اكتب سببًا من 3 أحرف على الأقل.")).toBeVisible();
  await dialog.getByLabel("سبب الإبلاغ", { exact: false }).fill("صورة لا تخص الجلسة");
  await expect(dialog.getByText("اكتب سببًا من 3 أحرف على الأقل.")).toHaveCount(0);
  await dialog.getByRole("button", { name: "إرسال البلاغ" }).click();
  await expect(lightbox.getByText("تم إرسال بلاغك عن هذه الصورة")).toBeVisible();
  await page.screenshot({ path: `${shots()}/wave22d-content-photo-report-sent-390.png` });

  const { rows } = await db.query<{ reporter_id: string; status: string }>(`select reporter_id, status from public.reports where target = 'photo' and photo_id = $1`, [photoId]);
  expect(rows).toEqual([{ reporter_id: memberId, status: "open" }]);
  const photo = await db.query<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photoId]);
  expect(photo.rows[0].hidden_at).toBeNull();
});

test("…and the report lands on SCR-051's «بلاغات الصور», the reporter named", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "follows the report above, on the same project");
  await signIn(context, emails.mod);
  await goto(page, `/ar/app/admin/moderation/photos/${photoId}?kind=reports`);
  const main = page.locator("#main");
  await expect(main.getByText("صورة لا تخص الجلسة")).toBeVisible();
  await expect(main.getByText("ريم الشهري").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("ظاهرة", { exact: true })).toBeVisible();
});

test("REQ-EVT-014: staff remove a comment on the event page with a reason; its report closes; the triggers record it", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 review — the phone project");
  await signIn(context, emails.mod);
  // DEC-267: staff's removal is a management control, behind «تعديل» — opened in edit mode.
  await goto(page, `/ar/app/sessions/${sessionId}?edit=1`);
  const main = page.locator("#main");
  await main.getByRole("button", { name: "إزالة" }).click();
  const dialog = page.getByRole("dialog", { name: "إزالة تعليق خالد الغامدي؟" });
  await dialog.getByRole("button", { name: "إزالة" }).click();
  await expect(dialog.getByText("اكتب السبب أولًا.")).toBeVisible();
  // The refused state, with the field empty; then the corrected one — typing clears the refusal.
  await page.screenshot({ path: `${shots()}/wave22d-content-comment-remove-refused-390.png` });
  await dialog.getByLabel("السبب — يُسجَّل في سجل التدقيق", { exact: false }).fill("دعاية لمنتج");
  await expect(dialog.getByText("اكتب السبب أولًا.")).toHaveCount(0);
  await page.screenshot({ path: `${shots()}/wave22d-content-comment-remove-dialog-390.png` });
  await dialog.getByRole("button", { name: "إزالة" }).click();
  await expect(main.getByText("رابط لمنتج خارجي لا علاقة له بالجلسة")).toHaveCount(0);
  await page.screenshot({ path: `${shots()}/wave22d-content-comment-removed-390.png`, fullPage: true });

  const comment = await db.query<{ deleted_by: string; removal_reason: string }>(`select deleted_by, removal_reason from public.comments where id = $1`, [commentId]);
  expect(comment.rows[0]).toEqual({ deleted_by: modMemberId, removal_reason: "دعاية لمنتج" });
  const report = await db.query<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [reportId]);
  expect(report.rows[0]).toEqual({ status: "resolved", resolution: "removed" });
  const removed = await db.query<{ reason: string; actor_id: string }>(`select reason, actor_id from public.audit_log where action = 'comment.removed' and subject_id = $1`, [commentId]);
  expect(removed.rows).toEqual([{ reason: "دعاية لمنتج", actor_id: modMemberId }]);
  const resolved = await db.query(`select 1 from public.audit_log where action = 'report.resolved' and subject_id = $1 and actor_id = $2`, [reportId, modMemberId]);
  expect(resolved.rowCount).toBe(1);
});
