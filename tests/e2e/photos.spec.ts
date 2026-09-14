// The Photos slot against REAL local Supabase (STORY-EVT-005/006). Seeded
// directly through SQL — a `photos` row and its storage object — never
// through the worker: `process_photo`'s strip is covered on its own
// contract in tests/unit/storage-exif.test.ts, and the lead runs the real
// pipeline once at the gate. What this proves is the app layer: the
// gallery renders, the upload notice appears, and a takedown request hides
// the photo instantly (REQ-EVT-012) — before any human reviews it.
//
// Same shape as tests/e2e/checkin.spec.ts / materials.spec.ts.
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
// A genuine tiny JPEG (FFD8FF SOI+marker) — real enough that the gallery's
// <img> actually loads it.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let photoId = "";
let attendeeEmail = "";
let bystanderEmail = "";
let modEmail = "";
const userIds: string[] = [];

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

/** `members` rows do not exist until `provision_member()` runs — there is no
 *  insert trigger on `auth.users`, on purpose (03 §2). See tests/e2e/
 *  materials.spec.ts's own copy of this helper for the full reasoning. */
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
  domain = `photo-e2e-${tag}.example`;
  attendeeEmail = `attendee@${domain}`;
  bystanderEmail = `bystander@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الصور', $1, 'PH', gen_random_uuid()) returning id`,
    [`photo-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة اختبار الصور', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 hour', 60, now() + interval '10 minutes',
             $3, 30, 'in_progress', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [attendeeEmail, "الحاضر"],
    [bystanderEmail, "زميل آخر"],
    [modEmail, "المشرفة"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const attendeeMemberId = await provisionMemberId(attendeeEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  const { rows: codeRows } = await db.query<{ id: string }>(
    `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
     values ($1, $2, 'ACDEFG', now() - interval '1 minute', now() + interval '10 minutes') returning id`,
    [orgId, sessionId],
  );
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, attendeeMemberId, codeRows[0].id],
  );

  // `photos_storage_read` (03 §6) matches the OBJECT'S OWN FILENAME (minus
  // extension) against a real `photos.id` — the id has to be minted before
  // the path is built, exactly like `initiatePhotoUpload()` does, not a
  // placeholder name.
  photoId = randomUUID();
  const photoPath = `${orgId}/sessions/${sessionId}/photos/${photoId}.jpg`;
  await uploadObject("photos", photoPath, TINY_JPEG, "image/jpeg");
  await db.query(
    `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [photoId, orgId, sessionId, attendeeMemberId, photoPath, TINY_JPEG.byteLength, "b".repeat(64)],
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("★ REQ-EVT-010/013: the gallery shows the seeded photo, and the upload notice appears for a checked-in attendee", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, attendeeEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "الصور", exact: true, level: 2 })).toBeVisible();
  // gallery.tsx sets alt="" (decorative), so the accessibility tree treats
  // it as presentation, not role=img — a plain CSS locator, not getByRole.
  await expect(page.locator("img").first()).toBeVisible();
  await expect(page.getByText(/ستظهر هذه الصور لجميع أعضاء المؤسسة/)).toBeVisible();
  await expect(page.getByRole("button", { name: "إضافة صورة" })).toBeVisible();
  await review(page, "photos-event-page");
});

test("★ REQ-EVT-012: a bystander's takedown request hides the photo instantly, before any moderator acts", async ({ context, page }) => {
  await signIn(context, bystanderEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "احذف الصور التي أظهر فيها" }).click();
  await expect(page.getByText("تم إرسال طلب الإخفاء.")).toBeVisible();

  // Hidden immediately at the database level — no moderator has acted yet.
  const { rows } = await db.query<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photoId]);
  expect(rows[0].hidden_at).not.toBeNull();

  // A plain member (not staff) reloading the event page no longer sees it.
  await page.reload();
  await expect(page.getByText("لا توجد صور لهذه الجلسة بعد.")).toBeVisible();

  // The moderator sees it, marked pending review, and can restore it.
  await context.clearCookies();
  await signIn(context, modEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.getByText("مخفية — بانتظار المراجعة")).toBeVisible();
  await page.getByRole("button", { name: "استعادة" }).click();
  await expect(page.getByText("تمت استعادة الصورة.")).toBeVisible();
});
