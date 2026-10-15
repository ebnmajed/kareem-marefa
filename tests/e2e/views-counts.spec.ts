// ★ Views, end to end (DEC-297; REQ-VEW-001, 003, 004; views.md §1 and §8). Against real local Supabase (0228):
//
//   1. Two members look at a session's post, an announcement and the session's story frame — the post and the
//      announcement held on screen past a second, the frame shown in the viewer — and leave.
//   2. A third member sees «2» on each and nothing to press (the count is everyone's; the list is not).
//   3. The session's presenter (the post's and the generated frame's owner) and the announcement's author, an admin,
//      press the count and see the two names — and the day, nothing finer.
//   4. An owner's own look is never counted.
//
// Every page-level locator comes from `#main` (DEC-145). Run: `npm run test:e2e:local -- tests/e2e/views-counts.spec.ts
// --project=phone` (the gate lock queues it). Captures: `.qa-shots/rtl/views-*.png`, honouring `E2E_SHOTS_DIR`.
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TITLE = "كم شخصًا رأى المنشور";
const BODY = "إعلان: جلسات الشتاء تبدأ الأحد.";
const NAMES = { presenter: "سارة القحطاني", admin: "عبدالله الحربي", one: "فهد العنزي", two: "ريم الشهري", three: "نورة الدوسري" };

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let announcementId = "";
let frameId = "";
const email: Record<keyof typeof NAMES, string> = { presenter: "", admin: "", one: "", two: "", three: "" };
const ids: Record<keyof typeof NAMES, string> = { presenter: "", admin: "", one: "", two: "", three: "" };
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
  const domain = `views-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المشاهدات', $1, 'QA', gen_random_uuid()) returning id`,
    [`views-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const k of Object.keys(NAMES) as (keyof typeof NAMES)[]) {
    email[k] = `${k}@${domain}`;
    ids[k] = await provision(email[k], NAMES[k]);
  }
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [ids.admin]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الخبر', 40) returning id`, [orgId]);
  // A live session: its post is in the feed and its story has a generated frame (owned by its presenter).
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'جلسة جارية.', $3, 'introductory', now() - interval '20 minutes', 90, now() + interval '70 minutes', $4, 40, 'in_progress', now() - interval '3 days') returning id`,
    [orgId, TITLE, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, ids.presenter]);
  const { rows: f } = await db.query<{ id: string }>(
    `insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at)
     select $1, $2, d.id, 'live', 'views-live', now() - interval '20 minutes' from public.session_days d where d.session_id = $2 order by d.position limit 1
     returning id`,
    [orgId, sessionId],
  );
  frameId = f[0].id;
  const { rows: a } = await db.query<{ id: string }>(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, $3) returning id`, [orgId, ids.admin, BODY]);
  announcementId = a[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, address: string) {
  await context.clearCookies();
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

async function home(page: Page) {
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

const post = (page: Page) => page.locator(`#main [data-view-subject="post"]`).filter({ hasText: TITLE }).first();
const notice = (page: Page) => page.locator(`#main [data-view-subject="announcement"]`).filter({ hasText: BODY }).first();

/** Holds each subject on screen past the second, opens and closes the story — then leaves, which sends the batch. */
async function look(page: Page) {
  await home(page);
  for (const subject of [post(page), notice(page)]) {
    await subject.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1400);
  }
  await page.click('#main ul[aria-label="جلسات اليوم وما حوله"] button[data-state]');
  await expect(page.locator("[data-story-viewer]")).toBeVisible();
  await expect(page.locator("[data-story-viewer] [data-frame-id]")).toHaveAttribute("data-frame-id", frameId);
  await page.click('[data-story-viewer] button[aria-label="إغلاق"]');
  // Leaving the page sends what is queued at once (the beacon).
  await page.goto("/ar/app/me");
}

async function counted(kind: "post" | "announcement" | "frame"): Promise<string[]> {
  const sql =
    kind === "frame"
      ? `select member_id from public.story_views where frame_id = $1`
      : `select member_id from public.content_views where kind = $2::public.view_subject and subject_id = $1`;
  const subject = kind === "post" ? sessionId : kind === "announcement" ? announcementId : frameId;
  const { rows } = await db.query<{ member_id: string }>(sql, kind === "frame" ? [subject] : [subject, kind]);
  return rows.map((r) => r.member_id).sort();
}

test("two members look; the owners' own looks are recorded but never counted", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  for (const who of ["one", "two", "presenter"] as const) {
    await signIn(context, email[who]);
    await look(page);
  }
  const viewers = [ids.one, ids.two].sort();
  await expect.poll(() => counted("post"), { timeout: 15_000 }).toEqual(expect.arrayContaining(viewers));
  await expect.poll(() => counted("announcement"), { timeout: 15_000 }).toEqual(expect.arrayContaining(viewers));
  await expect.poll(() => counted("frame"), { timeout: 15_000 }).toEqual(expect.arrayContaining(viewers));
});

test("a third member sees «2» on the post, the announcement and the frame — and nothing to press", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, email.three);
  await home(page);
  for (const subject of [post(page), notice(page)]) {
    const count = subject.locator("[data-view-count]");
    await expect(count).toHaveAttribute("aria-label", "شاهده عضوان");
    await expect(count.locator("bdi")).toHaveText("2");
    await expect(subject.locator("button[data-view-count]")).toHaveCount(0);
  }
  await page.screenshot({ path: join(SHOTS, "views-member-feed-390.png") });
  await page.click('#main ul[aria-label="جلسات اليوم وما حوله"] button[data-state]');
  const frameCount = page.locator("[data-story-viewer] [data-view-count]");
  await expect(frameCount).toHaveAttribute("aria-label", "شاهده عضوان");
  await expect(page.locator("[data-story-viewer] button[data-view-count]")).toHaveCount(0);
});

test("the presenter sees who viewed the post and the frame; the admin who viewed the announcement — names and the day", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  for (const [who, subject] of [
    ["presenter", post],
    ["admin", notice],
  ] as const) {
    await signIn(context, email[who]);
    await home(page);
    await subject(page).locator("button[data-view-count]").click();
    const sheet = page.getByRole("dialog", { name: "شاهدوه" });
    await expect(sheet.locator("[data-viewer-list] li")).toHaveCount(2);
    await expect(sheet).toContainText(NAMES.one);
    await expect(sheet).toContainText(NAMES.two);
    await expect(sheet).not.toContainText(NAMES.presenter);
    expect(await sheet.textContent()).not.toMatch(/\d{1,2}:\d{2}/);
    await page.screenshot({ path: join(SHOTS, `views-${who}-list-390.png`) });
    await page.keyboard.press("Escape");
  }
  // The generated frame's owner is its session's presenter.
  await signIn(context, email.presenter);
  await home(page);
  await page.click('#main ul[aria-label="جلسات اليوم وما حوله"] button[data-state]');
  await page.click("[data-story-viewer] button[data-view-count]");
  const sheet = page.getByRole("dialog", { name: "شاهدوه" });
  await expect(sheet.locator("[data-viewer-list] li")).toHaveCount(2);
});
