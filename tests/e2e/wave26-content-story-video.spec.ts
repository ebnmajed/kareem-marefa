// ★★ An attendee's video through the REAL routes and the REAL worker (REQ-STO-011, REQ-STO-012, REQ-STO-016,
// DEC-248 §6). The member's own session posts to `/api/stories/video`, PUTs to the signed URL in `story-media`, and
// completes; the worker's `transcode_story_video` — Debian's ffmpeg, in the image — decides from ffprobe and writes the
// rendition. Proven: a 20-second video is refused and its frame is `failed` · `too_long` (its author reads «تعذّر»); a
// 12-second one is `visible` with its length, its rendition carries NO location or device tag in its bytes, the source
// is gone, and no `photos` row and no ledger row was written.
//
// ★ HOW TO RUN (the lead's): the worker image built from this branch's head, running against the local stack —
//   docker build -f worker/Dockerfile -t kareem-worker .
//   docker run --rm --network host \
//     -e DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//     -e SUPABASE_URL=http://127.0.0.1:54321 -e SUPABASE_SERVICE_ROLE_KEY=$E2E_SUPABASE_SERVICE_KEY \
//     kareem-worker node worker/dist/index.js
//   then E2E_WORKER=1 npm run test:e2e:local -- tests/e2e/wave26-content-story-video.spec.ts
// The two fixtures are made BY THAT SAME IMAGE's ffmpeg (`docker run --rm $E2E_WORKER_IMAGE ffmpeg …`), carrying the
// tags an iPhone writes, so this machine needs no ffmpeg of its own.
import { execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WORKER = process.env.E2E_WORKER === "1";
const IMAGE = process.env.E2E_WORKER_IMAGE ?? "kareem-worker";

test.skip(
  !SERVICE_KEY || !PUBLISHABLE_KEY || !WORKER,
  !SERVICE_KEY || !PUBLISHABLE_KEY ? "needs local Supabase: run `npm run test:e2e:local`" : "proves the REAL worker's transcode — run the image and set E2E_WORKER=1",
);
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const LATITUDE = "+24.7136";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let attendeeId = "";
let attendeeEmail = "";
const userIds: string[] = [];

/** A MOV as a phone writes it — location (two keys), make, model, creation time — from the worker image's ffmpeg. */
function phoneVideo(seconds: number): Buffer {
  return execFileSync(
    "docker",
    [
      "run", "--rm", IMAGE, "ffmpeg", "-hide_banner", "-v", "error",
      "-f", "lavfi", "-i", `testsrc=size=720x1280:rate=30:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
      "-metadata", `location=${LATITUDE}+046.6753/`,
      "-metadata", `com.apple.quicktime.location.ISO6709=${LATITUDE}+046.6753+612.000/`,
      "-metadata", "com.apple.quicktime.make=Apple",
      "-metadata", "com.apple.quicktime.model=iPhone 15",
      "-metadata", "creation_time=2026-10-05T18:33:00Z",
      "-movflags", "use_metadata_tags+frag_keyframe+empty_moov",
      "-f", "mov", "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

async function provision(address: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: row, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (row as { member_id: string }).member_id;
}

async function signIn(context: BrowserContext, address: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `video-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الفيديو', $1, 'QV', gen_random_uuid()) returning id`,
    [`video-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);
  const presenter = await provision(`presenter@${domain}`, "سارة القحطاني");
  attendeeEmail = `attendee@${domain}`;
  attendeeId = await provision(attendeeEmail, "فهد العنزي");
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'العرض في 5 شرائح', 'خمس شرائح فقط.', $2, 'introductory', now() - interval '30 minutes', 90, now() + interval '60 minutes', $3, 40, 'in_progress', now() - interval '3 days') returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenter]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window) values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, attendeeId, presenter],
  );
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** The capture's own three requests, as `capture-flow.tsx` sends them, under the attendee's session. */
async function post(context: BrowserContext, bytes: Buffer): Promise<string> {
  const headers = { "content-type": "application/json", "x-locale": "ar" };
  const init = await context.request.post("/api/stories/video", { headers, data: { sessionId, ext: "mov", declaredByteSize: bytes.byteLength } });
  expect(init.status()).toBe(201);
  const { frameId, upload } = (await init.json()) as { frameId: string; upload: { path: string; signedUrl: string; contentType: string } };
  const put = await fetch(upload.signedUrl, { method: "PUT", headers: { "content-type": upload.contentType }, body: new Uint8Array(bytes) });
  expect(put.ok).toBe(true);
  const done = await context.request.post("/api/stories/video/complete", { headers, data: { frameId, sessionId, path: upload.path, byteSize: bytes.byteLength, caption: "من القاعة" } });
  expect(done.status()).toBe(202);
  return frameId;
}

const frame = async (id: string) =>
  (await db.query<{ state: string; failure_reason: string | null; duration_ms: number | null; video_path: string | null; source_path: string | null }>(
    `select state::text, failure_reason, duration_ms, video_path, source_path from public.story_frames where id = $1`,
    [id],
  )).rows[0];

test("★ 20 seconds is refused by ffprobe on the server — the frame is failed · too_long, and its source is gone", async ({ context }) => {
  await signIn(context, attendeeEmail);
  const id = await post(context, phoneVideo(20));
  await expect.poll(async () => (await frame(id))?.state, { timeout: 120_000 }).toBe("failed");
  expect(await frame(id)).toMatchObject({ failure_reason: "too_long", source_path: null });
});

test("★★ 12 seconds becomes ONE visible MP4 with its length and NO location or device tag in its bytes; nothing enters the album or the ledger", async ({ context }) => {
  await signIn(context, attendeeEmail);
  const [{ n: ledgerBefore }] = (await db.query<{ n: number }>(`select count(*)::int as n from public.points_ledger where member_id = $1`, [attendeeId])).rows;
  const id = await post(context, phoneVideo(12));
  await expect.poll(async () => (await frame(id))?.state, { timeout: 180_000 }).toBe("visible");
  const row = await frame(id);
  expect(row.source_path).toBeNull();
  expect(row.duration_ms).toBeGreaterThan(11_500);
  expect(row.duration_ms).toBeLessThanOrEqual(12_500);

  const { data, error } = await admin.storage.from("story-media").download(row.video_path!);
  expect(error).toBeNull();
  const bytes = Buffer.from(await data!.arrayBuffer()).toString("latin1");
  for (const needle of [LATITUDE, "ISO6709", "iPhone", "Apple", "2026-10-05"]) expect(bytes).not.toContain(needle);

  expect((await db.query(`select count(*)::int as n from public.photos where session_id = $1`, [sessionId])).rows[0].n).toBe(0);
  expect((await db.query(`select count(*)::int as n from public.points_ledger where member_id = $1`, [attendeeId])).rows[0].n).toBe(ledgerBefore);
});
