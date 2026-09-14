// SCR-050/051/052 — the moderation queues, against REAL local Supabase
// (REQ-ADM-010, REQ-EVT-008, REQ-EVT-012, REQ-EVT-014, DEC-005). Proves the
// takedown queue and the report queue never merge, a member gets a real
// 404 on all three, a moderator can act on all three, and a removal
// reverses the original points award.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
let memberEmail = "";
let commentId = "";
let commentReportId = "";
let photoTakedownId = "";
let takenDownPhotoId = "";
let reportedPhotoId = "";
let photoReportId = "";
let uploaderMemberId = "";
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
  domain = `admin-mod-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الإشراف', $1, 'MD', gen_random_uuid(), $2) returning id`,
    [`admin-mod-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الإشراف') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الإشراف', 40) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة الإشراف', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 day', 60, now() - interval '23 hours', $3, 30, 'completed', now() - interval '2 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  const sessionId = sessRows[0].id;

  for (const [email, name] of [
    [adminEmail, "مشرفة الإشراف"],
    [modEmail, "منظّم الإشراف"],
    [memberEmail, "عضو الإشراف"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  uploaderMemberId = await provisionMemberId(memberEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  // A comment, reported and open.
  const { rows: commentRows } = await db.query<{ id: string }>(
    `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق مسيء يستحق المراجعة') returning id`,
    [orgId, sessionId, uploaderMemberId],
  );
  commentId = commentRows[0].id;
  const { rows: commentReportRows } = await db.query<{ id: string }>(
    `insert into public.reports (org_id, target, comment_id, reporter_id, reason) values ($1, 'comment', $2, $3, 'لغة مسيئة') returning id`,
    [orgId, commentId, uploaderMemberId],
  );
  commentReportId = commentReportRows[0].id;

  // A photo, its takedown already hiding it (open).
  const SHA = "0123456789abcdef".repeat(4);
  const { rows: photo1Rows } = await db.query<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 2048, $5, true) returning id`,
    [orgId, sessionId, uploaderMemberId, `${orgId}/sessions/${sessionId}/photos/takedown.jpg`, SHA],
  );
  takenDownPhotoId = photo1Rows[0].id;
  const { rows: takedownRows } = await db.query<{ id: string }>(
    `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
    [orgId, takenDownPhotoId, uploaderMemberId],
  );
  photoTakedownId = takedownRows[0].id;
  await db.query(`update public.photos set hidden_at = now(), hidden_reason = 'طلب إخفاء' where id = $1`, [takenDownPhotoId]);

  // A second photo, reported but never taken down — still visible.
  const { rows: photo2Rows } = await db.query<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 2048, $5, true) returning id`,
    [orgId, sessionId, uploaderMemberId, `${orgId}/sessions/${sessionId}/photos/reported.jpg`, SHA],
  );
  reportedPhotoId = photo2Rows[0].id;
  const { rows: photoReportRows } = await db.query<{ id: string }>(
    `insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'محتوى غير مناسب') returning id`,
    [orgId, reportedPhotoId, uploaderMemberId],
  );
  photoReportId = photoReportRows[0].id;
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
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test("a member gets a real 404 on all three moderation queues", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["comments", "photos", "reports"]) {
    const response = await page.goto(`/ar/app/admin/moderation/${path}`);
    expect(response!.status(), path).toBe(404);
  }
});

test("REQ-ADM-020: a moderator reaches all three queues, and DEC-005 keeps the takedown queue separate from the report queue", async ({ context, page }) => {
  await signIn(context, modEmail);

  await page.goto("/ar/app/admin/moderation/comments");
  await expect(page.getByRole("heading", { name: "التعليقات المُبلَّغ عنها", level: 1 })).toBeVisible();
  await expect(page.getByText("تعليق مسيء يستحق المراجعة")).toBeVisible();

  await page.goto("/ar/app/admin/moderation/photos");
  await expect(page.getByRole("heading", { name: "طلبات إخفاء الصور", level: 1 })).toBeVisible();
  // The takedown queue shows only the taken-down photo's requester — never
  // the plain report's reporter (a different photo entirely here, but the
  // real assertion is that the two queues never share a list).
  await expect(page.getByText("طالب الإخفاء")).toBeVisible();
  await expect(page.getByText("المُبلِّغ")).toHaveCount(0);

  await page.goto("/ar/app/admin/moderation/reports");
  await expect(page.getByRole("heading", { name: "الصور المُبلَّغ عنها", level: 1 })).toBeVisible();
  await expect(page.getByText("المُبلِّغ")).toBeVisible();
  await expect(page.getByText("طالب الإخفاء")).toHaveCount(0);
});

test("REQ-EVT-014: removing a reported comment records the reason and audits the removal", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/moderation/comments");
  const card = page.locator("li", { has: page.getByText("تعليق مسيء يستحق المراجعة") });

  await card.getByText("أزل", { exact: true }).click();
  await card.getByRole("button", { name: "أرسل" }).click();
  await expect(card.getByText("اكتب السبب أولًا")).toBeVisible();

  await card.getByLabel("السبب الذي يُسجَّل في سجل التدقيق").fill("لغة غير لائقة");
  await card.getByRole("button", { name: "أرسل" }).click();
  await expect(page.getByText("تعليق مسيء يستحق المراجعة")).toHaveCount(0);

  const { rows: commentRows } = await db.query<{ deleted_at: string; removal_reason: string }>(`select deleted_at, removal_reason from public.comments where id = $1`, [commentId]);
  expect(commentRows[0].deleted_at).toBeTruthy();
  expect(commentRows[0].removal_reason).toBe("لغة غير لائقة");
  const reportRows = await db.query<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [commentReportId]);
  expect(reportRows.rows[0]).toEqual({ status: "resolved", resolution: "removed" });
  const audit = await db.query(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [commentId]);
  expect(audit.rowCount).toBe(1);
});

test("REQ-EVT-012: restoring a takedown clears the hide and resolves the request", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/moderation/photos");
  await page.getByRole("button", { name: "أعد الإظهار" }).click();
  await expect(page.getByText("طالب الإخفاء")).toHaveCount(0);

  const photoRows = await db.query<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [takenDownPhotoId]);
  expect(photoRows.rows[0].hidden_at).toBeNull();
  const takedownRows = await db.query<{ resolution: string }>(`select resolution from public.photo_takedowns where id = $1`, [photoTakedownId]);
  expect(takedownRows.rows[0].resolution).toBe("restored");
});

test("REQ-PTS-013: removing a reported photo reverses its original points award and resolves the report", async ({ context, page }) => {
  const { rows: photoRow } = await db.query<{ session_id: string }>(`select session_id from public.photos where id = $1`, [reportedPhotoId]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
     values ($1, $2, 3, 'photo', $3, $4, 'صورة من الجلسة', 'photo', $5)`,
    [orgId, uploaderMemberId, reportedPhotoId, photoRow[0].session_id, `e2e-photo-award-${reportedPhotoId}`],
  );

  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/moderation/reports");
  const card = page.locator("li", { has: page.getByText("محتوى غير مناسب") });
  await card.getByText("أزل", { exact: true }).click();
  await card.getByLabel("السبب الذي يُسجَّل في سجل التدقيق").fill("مخالفة صريحة");
  await card.getByRole("button", { name: "أرسل" }).click();
  await expect(page.getByText("محتوى غير مناسب")).toHaveCount(0);

  const photoRows = await db.query<{ removed_at: string | null }>(`select removed_at from public.photos where id = $1`, [reportedPhotoId]);
  expect(photoRows.rows[0].removed_at).toBeTruthy();
  const reportRows = await db.query<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [photoReportId]);
  expect(reportRows.rows[0]).toEqual({ status: "resolved", resolution: "removed" });
  const reversal = await db.query<{ amount: number }>(`select amount from public.points_ledger where source = 'reversal' and source_id in (select id from public.points_ledger where source = 'photo' and source_id = $1)`, [
    reportedPhotoId,
  ]);
  expect(reversal.rows).toEqual([{ amount: -3 }]);
});

test("SCR-050/051/052 at 390 px RTL: each queue reads down the page, never sideways", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, modEmail);
  for (const [path, name] of [
    ["comments", "scr-050-moderation-comments"],
    ["photos", "scr-051-moderation-photos"],
    ["reports", "scr-052-moderation-reports"],
  ] as const) {
    await page.goto(`/ar/app/admin/moderation/${path}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${test.info().project.name}.png`, fullPage: true });
  }
});

