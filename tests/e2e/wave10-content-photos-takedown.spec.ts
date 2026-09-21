// content, wave 10 T2·1 (docs/plan/notes/content.md, "Wave 10 plan") — the carried "photo tile's
// takedown label wraps" finding. ★ No code changed for it: `git log` shows the exact diagnosis and
// fix this note carried from wave 6 already landed on `main` at `7c6f9e5` (wave 9, merged in
// `f2ead54`) — `h-auto! min-h-9 py-2` on `takedown-button.tsx`'s trigger button, beating the fixed
// `h-9` `size="sm"` sets. What was still missing was the DoD's own named capture proving it at
// 390 px, under a real (long) Arabic label, on a real half-width tile — this file is that capture,
// nothing else. Seeded the same shape as `tests/e2e/photos.spec.ts`'s own `beforeAll` (a checked-in
// attendee, one real photo object, not hidden).
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
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
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let attendeeEmail = "";
const userIds: string[] = [];

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

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
  domain = `photo-td-e2e-${tag}.example`;
  attendeeEmail = `attendee@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة تسمية الإخفاء', $1, 'PT', gen_random_uuid()) returning id`,
    [`photo-td-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة اختبار تسمية الإخفاء', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 hour', 60, now() + interval '10 minutes',
             $3, 30, 'in_progress', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email: attendeeEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "الحاضر" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const attendeeMemberId = await provisionMemberId(attendeeEmail);

  const { rows: codeRows } = await db.query<{ id: string }>(
    `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
     values ($1, $2, 'ACDEFG', now() - interval '1 minute', now() + interval '10 minutes') returning id`,
    [orgId, sessionId],
  );
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, attendeeMemberId, codeRows[0].id],
  );

  const photoId = randomUUID();
  const photoPath = `${orgId}/sessions/${sessionId}/photos/${photoId}.jpg`;
  await uploadObject("photos", photoPath, TINY_JPEG, "image/jpeg");
  await db.query(
    `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [photoId, orgId, sessionId, attendeeMemberId, photoPath, TINY_JPEG.byteLength, "c".repeat(64)],
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

async function waitForStreamsToSettle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ T2·1: the takedown label «احذف الصور التي أظهر فيها» wraps without being clipped, and clears the 36px target, under a half-width tile at 390 px", async ({ page, context }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, attendeeEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await waitForStreamsToSettle(page);

  const main = page.locator("#main");
  const trigger = main.getByRole("button", { name: "احذف الصور التي أظهر فيها", exact: true });
  await expect(trigger).toBeVisible();

  // The wrap-vs-clip question is a LAYOUT one: the trigger's own box must be
  // tall enough to hold two lines without the text overflowing it — the
  // exact defect (`h-9` clipping a wrapped label) reads as the box being
  // SHORTER than its own scrollHeight, not as a screenshot artefact.
  const box = await trigger.boundingBox();
  const overflowed = await trigger.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(overflowed, "the label must not be clipped by a fixed-height box").toBe(false);
  expect(box?.height ?? 0, "the trigger must be at least the 36px floor (min-h-9)").toBeGreaterThanOrEqual(36);

  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/wave10-content-photos-takedown-390-rtl.png`, fullPage: true });
});
