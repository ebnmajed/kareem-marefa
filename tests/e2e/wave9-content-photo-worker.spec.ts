// T4 (docs/plan/notes/content.md, "Wave 9 plan" §7) — one photo driven end to end through the
// REAL worker, against real local Supabase. Closes two gaps at once, both named in the agent
// brief: REQ-EVT-010's "no reload" clause (DEC-139, `0091`) was reconciled in wave 7 but never
// actually driven through a real `process_photo` run — the stub-based `photos.spec.ts` seeds the
// `photos` row directly through SQL and never touches the worker at all; and `record_photo_
// upload()`'s new tenth parameter (`p_uploaded_at`, `supabase/proposed/content/0001`) has only
// ever been called from the RLS suite's own transactional harness, never from the real worker
// process reading a real job payload off the real queue.
//
// Gated on `E2E_WORKER=1` (`wave8-designer-editor.spec.ts`'s own convention) — there is nothing
// to prove about "the real worker" without a real worker consuming the queue. Run without it, the
// job would sit `queued` forever and the test would only be timing out, not testing anything.
//
// A one-day session is deliberate, not a shortcut: T4 is not where the day-resolution logic is
// proven (photos-days.test.ts, against applyProposed(), already covers the in-window/nearest-edge/
// n<=1 cases exhaustively) — it is where the REAL PIPELINE is proven, and DEC-121's own null-at-
// n<=1 rule is the simplest, most-travelled path through it. `session_day_id` stays null here, and
// that null is itself asserted below: the real worker's own call must default the SQL function's
// new argument correctly, or record a wrong one, for exactly the reasons the commit message for
// `0001_day_scope_writes.sql` describes.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
const WORKER = process.env.E2E_WORKER === "1";

test.skip(
  !SERVICE_KEY || !PUBLISHABLE_KEY || !WORKER,
  !SERVICE_KEY || !PUBLISHABLE_KEY ? "needs local Supabase: run `npm run test:e2e:local`" : "T4 proves the REAL worker pipeline — nothing to assert without one (E2E_WORKER=1)",
);

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

// A real JPEG — SOI, APP1/EXIF (the marker `stripImageMetadata` must remove), a minimal SOF0/SOS/
// EOI — built the same way `tests/unit/storage-exif.test.ts`'s own `jpegFixture()` is, so this
// spec proves the REAL worker strips what that unit test already proves the function removes in
// isolation. Not a decodable photograph (no real pixel data is needed — the gallery's own `<img>`
// counts as "visible" once it has a signed URL and CSS-driven size, decode success or not), but a
// real container a real `sniffImageKind()`/`stripImageMetadata()` genuinely parses.
function jpegWithExif(): Buffer {
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const bytes = (...parts: (number[] | string | Buffer)[]) =>
    Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.isBuffer(p) ? p : Buffer.from(p))));
  const app0 = bytes([0xff, 0xe0], u16(16), "JFIF\0", [1, 1, 0], u16(1), u16(1), [0, 0]);
  // APP1/EXIF — a real TIFF header (II, magic 42) so a real EXIF reader, not just this project's
  // byte-level stripper, would recognise it as metadata; the strip never parses this far in, it
  // only has to see the 0xFFE1 marker.
  const exifBody = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])]);
  const app1Exif = bytes([0xff, 0xe1], u16(2 + exifBody.length), exifBody);
  const sof0 = bytes([0xff, 0xc0], u16(17), [8], u16(1), u16(1), [3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = bytes([0xff, 0xda], u16(2 + 1 + 6 + 3), [3, 1, 0, 2, 17, 3, 17, 0, 63, 0]);
  const scanData = bytes([0xaa, 0xbb, 0xcc]);
  const eoi = bytes([0xff, 0xd9]);
  return bytes([0xff, 0xd8], app0, app1Exif, sof0, sos, scanData, eoi);
}

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let attendeeEmail = "";
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
  domain = `photo-worker-e2e-${tag}.example`;
  attendeeEmail = `attendee@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة اختبار العامل', $1, 'PW', gen_random_uuid()) returning id`,
    [`photo-worker-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  // A ONE-DAY session — deliberate (see this file's own header): T4 proves the pipeline, not the
  // day-resolution logic (photos-days.test.ts already does that exhaustively).
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة اختبار العامل الحقيقي', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 hour', 60, now() + interval '10 minutes',
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

// See photos.spec.ts's identical helper for the full reasoning (the streaming-SSR hidden-copy
// finding).
async function waitForStreamsToSettle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ T4 — a real upload through the real worker: exif stripped, the gallery updates with NO RELOAD, session_day_id resolves to null at one day", async ({ context, page }) => {
  test.setTimeout(2 * 60_000);
  await page.setViewportSize(PHONE);
  await signIn(context, attendeeEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await waitForStreamsToSettle(page);

  await expect(page.locator("img")).toHaveCount(0); // nothing seeded — this run creates the only photo

  await page.locator('input[name="file"]').setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: jpegWithExif() });
  await page.getByRole("button", { name: "إضافة صورة" }).click();
  // REQ-EVT-010: told AT ONCE that it is processing, never that it was posted.
  await expect(page.getByText("تتم معالجة الصورة الآن…")).toBeVisible();

  // ★ THE POINT OF THIS TEST: no page.reload() anywhere below. The gallery must take its place
  // on its own — the private Realtime broadcast (or the UploadWidget's own bounded fallback
  // timer) — while a REAL worker is the one doing the downloading, sniffing, stripping and
  // inserting, not the stub or a direct SQL seed.
  await expect(page.locator("img")).toBeVisible({ timeout: 60_000 });

  const { rows } = await db.query<{ id: string; exif_stripped: boolean; session_day_id: string | null; storage_path: string }>(
    `select id, exif_stripped, session_day_id, storage_path from public.photos where session_id = $1`,
    [sessionId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].exif_stripped).toBe(true);
  // DEC-121: null while the session has one day — the real worker's own call to the new
  // ten-parameter record_photo_upload() must resolve this the same way the RLS suite's
  // transactional harness already proves in isolation.
  expect(rows[0].session_day_id).toBeNull();

  // REQ-EVT-011, proven on the STORED bytes, not just the `exif_stripped` flag: download what the
  // real worker re-uploaded and confirm no APP1 (0xFFE1) marker remains.
  const { data: signed } = await admin.storage.from("photos").createSignedUrl(rows[0].storage_path, 60);
  const stripped = Buffer.from(await (await fetch(signed!.signedUrl)).arrayBuffer());
  let sawExifMarker = false;
  for (let i = 0; i < stripped.length - 1; i++) {
    if (stripped[i] === 0xff && stripped[i + 1] === 0xe1) { sawExifMarker = true; break; }
  }
  expect(sawExifMarker, "the re-uploaded object must carry no APP1/EXIF marker").toBe(false);

  await page.screenshot({ path: `${SHOTS}/wave9-content-photo-worker-visible.png`, fullPage: true });
});
