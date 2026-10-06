// ★ M4 — «تنزيل الكل» with the REAL worker (REQ-ADM-021, DEC-180, DEC-182).
//
// A staff member presses «تنزيل الكل»: the request returns at once and the
// page says «نُجهّز»; the real `zip_session_photos` builds the album; a reload
// says «جاهز»; the in-app notice has arrived; the zip is taken through the
// audited route, opened here in Node (a stored zip needs no `unzip`), and holds
// EXACTLY the visible photographs — every entry byte-for-byte its row's stripped
// object, no EXIF marker in any, and the hidden photograph absent.
//
// Gated on `E2E_WORKER=1`, like `wave9-content-photo-worker.spec.ts`: without a
// worker consuming the queue the album stays «نُجهّز» and there is nothing to
// prove. The lead runs it.
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { readStoredZip } from "../unit/photos-zip-reader";
import { drawPhotos } from "../unit/photos-fixtures";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const WORKER = process.env.E2E_WORKER === "1";

test.skip(
  !SERVICE_KEY || !PUBLISHABLE_KEY || !WORKER,
  !SERVICE_KEY || !PUBLISHABLE_KEY ? "needs local Supabase: run `npm run test:e2e:local`" : "M4 proves the REAL worker's zip — nothing to assert without one (E2E_WORKER=1)",
);
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const EXIF_MARKERS = ["Exif\0\0", "http://ns.adobe.com/xap/", "Photoshop 3.0"];

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let staffEmail = "";
let staffMemberId = "";
const userIds: string[] = [];
const visible: { id: string; sha256: string }[] = [];
let hidden = { id: "", sha256: "" };

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

test.beforeAll(async ({ browser }, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `album-e2e-${tag}.example`;
  staffEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الألبوم', $1, 'AL', gen_random_uuid()) returning id`,
    [`album-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة الألبوم', 'ملخص', $2, 'introductory', now() - interval '1 hour', 60, now() + interval '10 minutes', $3, 30, 'in_progress', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "المشرفة" } });
  if (error) throw error;
  userIds.push(data.user.id);
  staffMemberId = await provisionMemberId(staffEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [staffMemberId]);

  // Real, decodable, EXIF-free photographs (a canvas's own JPEG encoder writes no metadata), so the
  // captures show real tiles and the zip holds real files.
  const drawer = await browser.newPage();
  const drawn = await drawPhotos(drawer, 4);
  await drawer.close();
  for (let i = 0; i < 4; i += 1) {
    const id = randomUUID();
    const { bytes, width, height } = drawn[i];
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const path = `${orgId}/sessions/${sessionId}/photos/${id}.jpg`;
    await uploadObject("photos", path, bytes, "image/jpeg");
    await db.query(
      `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, created_at, hidden_at)
       values ($1, $2, $3, $4, $5, $10, $11, $6, $7, true, now() - ($8 || ' minutes')::interval, $9)`,
      [id, orgId, sessionId, staffMemberId, path, bytes.byteLength, sha256, String(10 - i), i === 1 ? new Date() : null, width, height],
    );
    if (i === 1) hidden = { id, sha256 };
    else visible.push({ id, sha256 });
  }
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

// ★ Staff open the page in edit mode (`?edit=1`): their downloads are behind «تعديل» (the owner's ruling,
// `sessions/edit-mode.tsx`); a member's page ignores the flag.
async function openEventPage(page: Page, edit = false) {
  await page.goto(`/ar/app/sessions/${sessionId}${edit ? "?edit=1" : ""}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ «تنزيل الكل» returns at once; the real worker writes the zip; it holds the stripped, visible photographs and no others", async ({ context, page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONE);
  await signIn(context, staffEmail);
  await openEventPage(page, true);
  const main = page.locator("#main");

  // Returns at once: the POST's own response, measured, and the page already says «نُجهّز».
  const started = Date.now();
  const [post] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith(`/api/photos/albums/${sessionId}`) && res.request().method() === "POST"),
    main.getByRole("button", { name: "تنزيل الكل", exact: true }).click(),
  ]);
  expect(post.status()).toBe(303);
  expect(Date.now() - started).toBeLessThan(5_000);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(main.getByRole("status").filter({ hasText: "نُجهّز ملف الصور" })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave14-content-album-building.png"), fullPage: true });

  // The real worker builds it.
  await expect
    .poll(async () => (await db.query<{ status: string }>(`select status::text from public.photo_albums where session_id = $1`, [sessionId])).rows[0]?.status, {
      timeout: 120_000,
      intervals: [1_000],
    })
    .toBe("ready");

  // «Ready» is a state of the page, the same after a reload — and the notice is in the inbox.
  await page.reload();
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(main.getByRole("status").filter({ hasText: "ملف الصور جاهز" })).toBeVisible();
  const link = main.getByRole("link", { name: "تنزيل الملف", exact: true });
  await expect(link).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave14-content-album-ready.png"), fullPage: true });
  const notes = await db.query<{ n: number }>(
    `select count(*)::int as n from public.notifications where member_id = $1 and key = 'MSG-photo_album_ready'`,
    [staffMemberId],
  );
  expect(notes.rows[0].n).toBe(1);

  // Taken through the audited route: a 303 to a short-lived signed URL.
  const href = await link.getAttribute("href");
  expect(href).toBe(`/api/photos/albums/${sessionId}/download?part=1`);
  const res = await page.request.get(href!, { maxRedirects: 0, headers: { referer: page.url() } });
  expect(res.status()).toBe(303);
  const signed = res.headers()["location"];
  expect(signed).toContain("/storage/v1/object/sign/photo-albums/");
  const zip = Buffer.from(await (await fetch(signed)).arrayBuffer());

  // The zip holds exactly the visible photographs, stored, each byte-for-byte its stripped object.
  const entries = readStoredZip(zip);
  const hashes = entries.map((e) => createHash("sha256").update(e.data).digest("hex"));
  expect(hashes.sort()).toEqual(visible.map((v) => v.sha256).sort());
  expect(hashes).not.toContain(hidden.sha256);
  for (const entry of entries) {
    const text = entry.data.toString("latin1");
    expect(EXIF_MARKERS.some((m) => text.includes(m)), `${entry.name} carries a metadata marker`).toBe(false);
    expect(entry.name).toMatch(/^\d{3}-[0-9a-f]{8}\.jpg$/);
  }

  const audits = await db.query<{ action: string }>(
    `select action from public.audit_log where org_id = $1 and action in ('photo_album.requested', 'photo_album.downloaded') order by action`,
    [orgId],
  );
  expect(audits.rows.map((r) => r.action)).toEqual(["photo_album.downloaded", "photo_album.requested"]);
});

test("a member sees no «تنزيل الكل», and the album's route refuses them back to the page", async ({ context, page }) => {
  const domain = staffEmail.split("@")[1];
  const memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو" } });
  if (error) throw error;
  userIds.push(data.user.id);

  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await openEventPage(page);
  await expect(page.locator("#main").getByRole("button", { name: "تنزيل الكل", exact: true })).toHaveCount(0);

  const res = await page.request.get(`/api/photos/albums/${sessionId}/download?part=1`, { maxRedirects: 0, headers: { referer: page.url() } });
  expect(res.status()).toBe(303);
  expect(new URL(res.headers()["location"]).searchParams.get("download")).toBe("album_failed");
});
