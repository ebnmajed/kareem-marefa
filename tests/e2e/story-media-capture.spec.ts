// ★ The story capture, made robust (the owner's report of 2026-10-14; docs/plan/notes/story-media.md; REQ-STO-011,
// REQ-STO-016, DEC-093, DEC-248 §5 – §6). Against real local Supabase, with Chromium's FAKE camera and microphone
// (playwright.config.ts) — every control reached with page.click() alone:
//
//   1. A photograph from the shutter: published, the capture CLOSES and says «جارٍ التجهيز», and the page never shows
//      its error boundary (the owner saw one) nor throws in the browser.
//   2. A video recorded by taps: the upload's progress is drawn, the frame exists as `processing`, the review never
//      shows an empty box; with the real worker (E2E_WORKER=1) it turns visible and the capture closes on its own.
//   3. The connection drops during the PUT: the take is KEPT, «لا اتصال» and «أعد المحاولة»; the retry resumes and
//      no second upload slot is asked for.
//
// Every page-level locator comes from `#main` (DEC-145). Run: `npx playwright test tests/e2e/story-media-capture.spec.ts
// --project=phone` under `npm run test:e2e:local` (the lead's — the gate lock queues it).
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
const TITLE = "قصة القاعة: التقط وسجّل";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let attendee = "";
let attendeeEmail = "";
const userIds: string[] = [];

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
  const domain = `story-media-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القصة', $1, 'QA', gen_random_uuid()) returning id`,
    [`story-media-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة جدة', 40) returning id`, [orgId]);
  const presenter = await provision(`presenter@${domain}`, "سارة القحطاني");
  attendeeEmail = `attendee@${domain}`;
  attendee = await provision(attendeeEmail, "فهد العنزي");
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'جلسة جارية.', $3, 'introductory', now() - interval '30 minutes', 90, now() + interval '60 minutes', $4, 40, 'in_progress', now() - interval '3 days') returning id`,
    [orgId, TITLE, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenter]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window) values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, attendee, presenter],
  );
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

/** The event page's «أضف إلى القصة» (DEC-269) — the door that does not need a story to exist yet. */
async function openCapture(page: Page) {
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.click('#main button:has-text("أضف إلى القصة")');
  const capture = page.locator("[data-story-capture]");
  await expect(capture).toBeVisible();
  return capture;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function recordByTaps(page: Page, seconds: number) {
  const capture = page.locator("[data-story-capture]");
  await page.click('[data-story-capture] [role="radio"]:has-text("فيديو")');
  await page.click('[data-story-capture] button[aria-label="ابدأ التسجيل"]');
  await expect(capture).toHaveAttribute("data-state", "recording");
  await expect(capture.locator('[data-slot="elapsed"]')).toContainText(`0:0${seconds}`, { timeout: (seconds + 3) * 1000 });
  await page.click('[data-story-capture] button[aria-label="أوقف التسجيل"]');
  await expect(capture).toHaveAttribute("data-state", "review");
}

test("★ a photograph from the shutter: published, the capture closes and says so — no error page, nothing thrown", async ({ context, page }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await signIn(context, attendeeEmail);
  const capture = await openCapture(page);
  // The fake camera's first frame must be on the element before the shutter can draw it.
  await expect.poll(() => capture.locator("video").first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.click('[data-story-capture] button[aria-label="التقط صورة"]');
  await expect(capture).toHaveAttribute("data-state", "review");
  await capture.getByLabel("تعليق").fill("من القاعة");
  await page.click('[data-story-capture] button:has-text("انشر")');
  await expect(capture).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("جارٍ التجهيز", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('#main [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "story-media-photo-published-390.png") });
  if (WORKER) {
    // The worker strips the photograph, and only then is there a `photos` row (REQ-EVT-011, DEC-139).
    await expect
      .poll(async () => (await db.query(`select caption from public.photos where session_id = $1 and uploader_id = $2`, [sessionId, attendee])).rows[0]?.caption, {
        timeout: 60_000,
      })
      .toBe("من القاعة");
  } else {
    // Before the worker, what exists is the album's `process_photo` job, carrying the caption (`initiate_story_photo()`).
    const { rows } = await db.query<{ caption: string | null }>(
      `select j.payload->>'caption' as caption from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'process_photo' and j.payload->>'session_id' = $1 and j.payload->>'uploader_id' = $2`,
      [sessionId, attendee],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].caption).toBe("من القاعة");
  }
});

test("★★ a video recorded by taps: progress, then processing over the take's own still — and visible when the worker is running", async ({ context, page }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await signIn(context, attendeeEmail);
  const capture = await openCapture(page);
  await recordByTaps(page, 3);
  await page.screenshot({ path: join(SHOTS, "story-media-video-review-390.png") });
  // Slow the PUT so the progress bar can be seen.
  await page.route("**/storage/v1/object/upload/sign/story-media/**", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.click('[data-story-capture] button:has-text("انشر")');
  await expect(capture.getByRole("progressbar")).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "story-media-video-uploading-390.png") });
  await expect
    .poll(async () => (await db.query(`select state from public.story_frames where session_id = $1 and kind = 'video' and author_id = $2`, [sessionId, attendee])).rows[0]?.state, {
      timeout: 30_000,
    })
    .toBeTruthy();
  if (WORKER) {
    // The author is followed: visible closes the capture.
    await expect(capture).toBeHidden({ timeout: 90_000 });
    const { rows } = await db.query(`select state, duration_ms from public.story_frames where session_id = $1 and kind = 'video' and author_id = $2`, [sessionId, attendee]);
    expect(rows[0].state).toBe("visible");
    expect(rows[0].duration_ms).toBeGreaterThan(2000);
  } else {
    await expect(capture).toHaveAttribute("data-state", "processing");
    await expect(capture.getByRole("status")).toHaveText("جارٍ التجهيز");
    await page.screenshot({ path: join(SHOTS, "story-media-video-processing-390.png") });
  }
  expect(errors).toEqual([]);
});

test("the connection drops during the PUT: the take is kept, «أعد المحاولة» resumes — one upload slot, one frame", async ({ context, page }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.setViewportSize(PHONE);
  await signIn(context, attendeeEmail);
  await db.query(`delete from public.story_frames where session_id = $1 and kind = 'video'`, [sessionId]);
  const capture = await openCapture(page);
  await recordByTaps(page, 2);
  let inits = 0;
  await page.route("**/api/stories/video", async (route) => {
    inits += 1;
    await route.continue();
  });
  await page.route("**/storage/v1/object/upload/sign/story-media/**", (route) => route.abort("internetdisconnected"));
  await page.click('[data-story-capture] button:has-text("انشر")');
  await expect(capture).toHaveAttribute("data-state", "error", { timeout: 30_000 });
  await expect(capture.getByRole("status")).toHaveText("لا اتصال");
  await page.screenshot({ path: join(SHOTS, "story-media-video-offline-390.png") });
  await page.unroute("**/storage/v1/object/upload/sign/story-media/**");
  await page.click('[data-story-capture] button:has-text("أعد المحاولة")');
  await expect(capture).not.toHaveAttribute("data-state", "error", { timeout: 30_000 });
  await expect
    .poll(async () => (await db.query(`select count(*)::int as n from public.story_frames where session_id = $1 and kind = 'video'`, [sessionId])).rows[0].n, { timeout: 30_000 })
    .toBe(1);
  expect(inits).toBe(1);
});
