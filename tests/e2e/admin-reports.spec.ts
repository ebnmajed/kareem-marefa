// SCR-052 · /app/admin/moderation/reports — the photo report queue, rebuilt
// onto the system for wave 6 (`16` §6.7, `DEC-130`). Proves the Card grid
// (not DataTable — DEC-130's own reasoning), the remove confirmation dialog
// naming the session (REQ-UIX-013), and dismiss staying one click.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const SHA = "e".repeat(64);

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let reportId = "";
let photoId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `admin-reports-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة البلاغات', $1, 'AR', gen_random_uuid(), $2) returning id`,
    [`admin-reports-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة البلاغات" } });
  if (error) throw error;
  userIds.push(data.user.id);

  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف البلاغات') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة البلاغات', 30) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة صور البلاغات', 'ملخص', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour', $3, 30, 'completed', now() - interval '3 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  const sessionId = sessRows[0].id;

  // The uploader/reporter member id: `first_admin_email` grants admin at
  // provisioning (DEC-035), so a SEPARATE member is needed for both roles —
  // the admin themselves is who resolves the report, not who filed it.
  const { data: memberAuth, error: memberErr } = await admin.auth.admin.createUser({
    email: `member@${domain}`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو رافع الصورة" },
  });
  if (memberErr) throw memberErr;
  userIds.push(memberAuth.user.id);
  const memberClient = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInErr } = await memberClient.auth.signInWithPassword({ email: `member@${domain}`, password: PASSWORD });
  if (signInErr) throw signInErr;
  const { data: provisioned, error: rpcErr } = await memberClient.rpc("provision_member");
  if (rpcErr) throw rpcErr;
  const memberId = (provisioned as { member_id: string }).member_id;

  const { rows: photoRows } = await db.query<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 1200, 800, 2048, $5, true) returning id`,
    [orgId, sessionId, memberId, `${orgId}/sessions/${sessionId}/photos/placeholder.jpg`, SHA],
  );
  photoId = photoRows[0].id;
  const { rows: reportRows } = await db.query<{ id: string }>(
    `insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'محتوى غير لائق') returning id`,
    [orgId, photoId, memberId],
  );
  reportId = reportRows[0].id;
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
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test("the page header and the report card render for a real open photo report", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/admin/moderation/reports");
  await expect(page.getByRole("heading", { name: "الصور المُبلَّغ عنها", level: 1 })).toBeVisible();
  // `page.tsx`'s `<dd><bdi>{sessionTitle}</bdi></dd>` — bidi-isolating every
  // interpolated value (CLAUDE.md's own rule) wraps it in a `<bdi>` with no
  // sibling text, so the `<dd>` and the `<bdi>` share the exact same
  // normalised text content and `getByText` matches both. `.last()` for the
  // innermost, same nesting trap `event-comments.spec.ts` already documents.
  await expect(page.getByText("جلسة صور البلاغات").last()).toBeVisible();
  await expect(page.getByText("محتوى غير لائق")).toBeVisible();
});

test("★ removing confirms in a dialog naming the session — cancel changes nothing, confirm resolves the report and removes the photo", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/admin/moderation/reports");
  await page.getByRole("button", { name: "أزل" }).click();

  const dialog = page.getByRole("dialog", { name: "حذف صورة من «جلسة صور البلاغات»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تراجع" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await db.query<{ status: string }>(`select status from public.reports where id = $1`, [reportId])).rows[0].status).toBe("open");

  await page.getByRole("button", { name: "أزل" }).click();
  await page.getByLabel("السبب الذي يُسجَّل في سجل التدقيق", { exact: false }).fill("مخالفة سياسة المحتوى");
  await page.getByRole("button", { name: "أرسل" }).click();
  await expect(page.getByRole("status")).toContainText("تم تنفيذ القرار");
  await expect(page.getByText("جلسة صور البلاغات")).toHaveCount(0);

  const report = await db.query<{ status: string }>(`select status from public.reports where id = $1`, [reportId]);
  expect(report.rows[0].status).toBe("resolved");
  const photo = await db.query<{ removed_at: string | null; hidden_at: string | null }>(`select removed_at, hidden_at from public.photos where id = $1`, [photoId]);
  expect(photo.rows[0].removed_at).not.toBeNull();
  expect(photo.rows[0].hidden_at).not.toBeNull();
});
