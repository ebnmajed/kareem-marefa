// ★ The attendee half of session stories, against real local Supabase (REQ-STO-011 … 017, DEC-251 §4).
//
//   1. «أضف» exists for a checked-in attendee and for nobody else; a photograph picked from the gallery goes through
//      the album's own door with its caption, and the attendee is told it is processing — never that it was posted.
//      With the REAL worker (E2E_WORKER=1) it becomes a photo frame with its caption, and an album photograph.
//   2. A member reports an attendee's video frame: it is gone from the story at once, and SCR-051 lists it and PLAYS it.
//   3. SCR-044's «قصص الحضور»: staff remove a frame with a reason; the frame is gone, `story_frame.removed` is written,
//      and no ledger row (a video earned nothing).
// The video's transcode — 20 seconds refused by ffprobe, 12 seconds made visible with no tag left — is proven against
// ffmpeg itself by `tests/unit/story-video-strip.test.ts`, inside the worker image (REQUIRE_FFMPEG=1).
//
// Every page-level locator comes from `#main` (DEC-145). Captures at 390 and 1280 beside `StoryAdd`, `StoryAttendee`
// and `AdminAttendance`.
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const WORKER = process.env.E2E_WORKER === "1";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 1060 };
const TITLE = "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية";
const CAPTION = "الشريحة الثالثة";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let videoFrame = "";
const email = { attendee: "", member: "", staff: "", presenter: "" };
const ids = { attendee: "", member: "", staff: "" };
const userIds: string[] = [];

function jpeg(): Buffer {
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const bytes = (...parts: (number[] | string | Buffer)[]) =>
    Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.isBuffer(p) ? p : Buffer.from(p))));
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])]);
  return bytes(
    [0xff, 0xd8],
    bytes([0xff, 0xe0], u16(16), "JFIF\0", [1, 1, 0], u16(1), u16(1), [0, 0]),
    bytes([0xff, 0xe1], u16(2 + exif.length), exif),
    bytes([0xff, 0xc0], u16(17), [8], u16(1), u16(1), [3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
    bytes([0xff, 0xda], u16(12), [3, 1, 0, 2, 17, 3, 17, 0, 63, 0]),
    bytes([0xaa, 0xbb, 0xcc]),
    [0xff, 0xd9],
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

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `attendee-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القاعة', $1, 'QA', gen_random_uuid()) returning id`,
    [`attendee-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const k of Object.keys(email) as (keyof typeof email)[]) email[k] = `${k}@${domain}`;
  const { rows: co } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#9b7cff') returning id`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);
  const presenter = await provision(email.presenter, "سارة القحطاني");
  ids.attendee = await provision(email.attendee, "فهد العنزي");
  ids.member = await provision(email.member, "ريم الشهري");
  ids.staff = await provision(email.staff, "عبدالله الحربي");
  await db.query(`update public.members set company_id = $1 where id = any($2::uuid[])`, [co[0].id, [presenter, ids.attendee, ids.member, ids.staff]]);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [ids.staff]);

  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'خمس شرائح فقط.', $3, 'introductory', now() - interval '30 minutes', 90, now() + interval '60 minutes', $4, 40, 'in_progress', now() - interval '3 days') returning id`,
    [orgId, TITLE, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenter]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window) values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, ids.attendee, ids.staff],
  );
  // A `live` frame is a day's (DEC-251 §4.4): it names the session's day, or the read model draws nothing for it.
  await db.query(
    `insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at)
     select $1, $2, d.id, 'live', 'e2e-live', now() - interval '30 minutes' from public.session_days d where d.session_id = $2 order by d.position limit 1
     on conflict do nothing`,
    [orgId, sessionId],
  );
  // An attendee's visible video frame — the rows only; its objects are the worker's, and a missing rendition is a
  // poster-less <video> that still renders its controls.
  // ★ Its paths are the one builder's shape for THIS frame — `story_media_read` reads segment 5 as the frame — and its
  // two objects exist, so the queue's detail can sign them (a stand-in's bytes: the spec proves the player, not a codec).
  videoFrame = crypto.randomUUID();
  const prefix = `${orgId}/sessions/${sessionId}/frames/${videoFrame}`;
  await db.query(
    `insert into public.story_frames (id, org_id, session_id, kind, trigger_key, triggered_at, author_id, caption, video_path, poster_path, duration_ms)
     values ($1::uuid, $2, $3, 'video', $8::text, now() - interval '5 minutes', $4, $5, $6, $7, 12000)`,
    // The id twice, as two parameters: one parameter cannot be deduced as both a uuid and a text.
    [videoFrame, orgId, sessionId, ids.attendee, CAPTION, `${prefix}/video.mp4`, `${prefix}/poster.webp`, videoFrame],
  );
  for (const [name, type] of [["video.mp4", "video/mp4"], ["poster.webp", "image/webp"]] as const) {
    const { error } = await admin.storage.from("story-media").upload(`${prefix}/${name}`, new Uint8Array([0, 0, 0, 0]), { contentType: type, upsert: true });
    if (error) throw error;
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

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

async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

async function openStory(page: Page) {
  await settle(page, "/ar/app");
  await page.click('#main ul[aria-label="جلسات اليوم وما حوله"] > li:first-child button');
  await expect(page.locator("[data-story-viewer]")).toBeVisible();
}

test("«أضف» is the checked-in attendee's alone; a gallery photograph goes through the album's door with its caption", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, email.member);
  await openStory(page);
  await expect(page.locator("[data-story-viewer]").getByRole("button", { name: "أضف" })).toHaveCount(0);

  await context.clearCookies();
  await signIn(context, email.attendee);
  await openStory(page);
  await page.click('[data-story-viewer] button:has-text("أضف")');
  const capture = page.locator("[data-story-capture]");
  await expect(capture).toBeVisible();
  await expect(capture.getByRole("radio", { name: "فيديو" })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave26-content-capture-photo-390.png") });

  await capture.getByLabel("من الاستوديو").setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  await capture.getByLabel("تعليق").fill(CAPTION);
  await page.screenshot({ path: join(SHOTS, "wave26-content-capture-review-390.png") });
  await page.click('[data-story-capture] button:has-text("انشر")');
  await expect(capture.getByRole("status")).toHaveText("جارٍ التجهيز");

  if (WORKER) {
    await expect
      .poll(async () => (await db.query(`select caption from public.photos where session_id = $1 and uploader_id = $2`, [sessionId, ids.attendee])).rows[0]?.caption, { timeout: 60_000 })
      .toBe(CAPTION);
    await expect
      .poll(async () => (await db.query(`select count(*)::int as n from public.story_frames f join public.photos p on p.id = f.photo_id where p.session_id = $1 and f.kind = 'photo'`, [sessionId])).rows[0].n, { timeout: 60_000 })
      .toBe(1);
  }
});

test("★★ a video recorded and stopped by TAPS alone — page.click() on the mode and on the shutter, never a hold (DEC-093)", async ({ context, page }) => {
  // playwright.config.ts launches Chromium with a fake camera and microphone; the permission is this context's.
  await context.grantPermissions(["camera", "microphone"]);
  await page.setViewportSize(PHONE);
  await signIn(context, email.attendee);
  await openStory(page);
  await page.click('[data-story-viewer] button:has-text("أضف")');
  const capture = page.locator("[data-story-capture]");
  await expect(capture).toBeVisible();

  await page.click('[data-story-capture] [role="radio"]:has-text("فيديو")');
  await expect(capture.getByRole("radio", { name: "فيديو" })).toHaveAttribute("aria-checked", "true");
  await page.click('[data-story-capture] button[aria-label="ابدأ التسجيل"]');
  await expect(capture.getByRole("button", { name: "أوقف التسجيل" })).toHaveAttribute("aria-pressed", "true");
  await expect(capture).toHaveAttribute("data-state", "recording");
  await expect(capture.locator('[data-slot="elapsed"]')).toContainText("0:02", { timeout: 5_000 });
  await page.screenshot({ path: join(SHOTS, "wave26-content-capture-recording-390.png") });
  await page.click('[data-story-capture] button[aria-label="أوقف التسجيل"]');

  await expect(capture).toHaveAttribute("data-state", "review");
  await expect(capture.locator("video[controls]")).toBeVisible();
  await page.click('[data-story-capture] button:has-text("انشر")');
  await expect(capture.getByRole("status")).toHaveText("جارٍ التجهيز", { timeout: 30_000 });
  // The recorded clip's own frame exists — processing until the worker decides (visible at once if one is running).
  await expect
    .poll(async () => (await db.query(`select count(*)::int as n from public.story_frames where session_id = $1 and kind = 'video' and author_id = $2 and id <> $3`, [sessionId, ids.attendee, videoFrame])).rows[0].n)
    .toBe(1);
});

test("a report hides a video frame at once, and SCR-051 lists it and plays it", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, email.member);
  await openStory(page);
  const viewer = page.locator("[data-story-viewer]");
  for (let i = 0; i < 10 && (await viewer.locator("[data-frame-id]").getAttribute("data-frame-id")) !== videoFrame; i++) {
    await page.click('[data-story-viewer] button[aria-label="الإطار التالي"]');
  }
  await expect(viewer.locator("[data-frame-id]")).toHaveAttribute("data-frame-id", videoFrame);
  await page.screenshot({ path: join(SHOTS, "wave26-content-story-attendee-video-390.png") });
  await page.click('[data-story-viewer] button[aria-label="المزيد"]');
  await page.getByRole("menuitem", { name: "بلّغ" }).click();
  await page.getByRole("dialog", { name: "بلّغ" }).getByRole("textbox").fill("ليست من الجلسة");
  await page.getByRole("dialog", { name: "بلّغ" }).getByRole("button", { name: "بلّغ" }).click();
  await expect.poll(async () => (await db.query(`select hidden_reason from public.story_frames where id = $1`, [videoFrame])).rows[0].hidden_reason).toBe("reported");

  await context.clearCookies();
  await signIn(context, email.staff);
  await page.setViewportSize(DESKTOP);
  await settle(page, "/ar/app/admin/moderation/photos?kind=reports");
  await page.click(`#main a[href*="frame-${videoFrame}"]`);
  const player = page.locator("#main video[controls]");
  await expect(player).toBeVisible();
  // A signed URL into `story-media` — the rendition, never the source, and never a public bucket.
  await expect(player).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/story-media\/.*\/video\.mp4\?token=/);
  await page.screenshot({ path: join(SHOTS, "wave26-content-moderation-video-1280.png") });
});

test("SCR-044's «قصص الحضور»: staff remove a frame with its reason — gone, audited, and no ledger row", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, email.staff);
  await settle(page, `/ar/app/admin/sessions/${sessionId}/attendance`);
  const strip = page.locator("#main").getByRole("region", { name: /قصص الحضور/ });
  await expect(strip).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave26-content-044-strip-1280.png") });

  const before = (await db.query(`select count(*)::int as n from public.points_ledger where member_id = $1`, [ids.attendee])).rows[0].n;
  await page.click(`#main li[data-frame-id="${videoFrame}"] button`);
  const sheet = page.getByRole("dialog", { name: "أزل" });
  await sheet.getByRole("textbox").fill("خارج موضوع الجلسة");
  await sheet.getByRole("button", { name: "أزل" }).click();
  // ★ Wait on the UI's own acknowledgement — never on the strip's count: while the sheet is open the page behind it is
  // aria-hidden, so a ROLE locator finds no region and «0 tiles» passes before anything is written (the first run's
  // false pass). The sheet closes and «سُجّل القرار» is said only when the database answered `removed`.
  await expect(sheet).toBeHidden();
  await expect(page.getByText("سُجّل القرار", { exact: true })).toBeVisible();
  await expect(page.locator(`#main li[data-frame-id="${videoFrame}"]`)).toHaveCount(0);

  const { rows } = await db.query(`select removed_by, removal_reason from public.story_frames where id = $1`, [videoFrame]);
  expect(rows[0]).toEqual({ removed_by: ids.staff, removal_reason: "خارج موضوع الجلسة" });
  expect((await db.query(`select count(*)::int as n from public.audit_log where action = 'story_frame.removed' and subject_id = $1`, [videoFrame])).rows[0].n).toBe(1);
  expect((await db.query(`select count(*)::int as n from public.points_ledger where member_id = $1`, [ids.attendee])).rows[0].n).toBe(before);
});
