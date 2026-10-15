// ★ The story viewer's «المزيد» menu on a phone, in WebKit with touch (the owner's report on 2026-10-15: «the ⋯ menu
// doesn't show anything when pressed — and I'm not sure it's registering the press even»; REQ-STO-014, REQ-STO-015,
// DEC-093). An attendee opens the story on an iPhone-sized touch screen, TAPS ⋯ on their own video frame, sees «أزلني»
// as the topmost element at its centre (nothing — the viewer, its gestures' layer — over it), the story's clock holds
// while the menu is open, and tapping «أزلني» hides the frame.
//
// A worker option, so set at the top of its own file. Skipped in CI, where WebKit is not installed, unless E2E_WEBKIT=1.
// Run: `npx playwright test tests/e2e/story-media-menu-webkit.spec.ts --project=phone` under `npm run test:e2e:local`.
// Captures: `.qa-shots/rtl/story-menu-webkit-*.png`, honouring `E2E_SHOTS_DIR`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
test.use({ ...iphone, browserName: "webkit", locale: "ar-SA" });
test.skip(!!process.env.CI && process.env.E2E_WEBKIT !== "1", "WebKit is not installed in CI");
test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const TITLE = "قائمة القصة على الهاتف";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let frameId = "";
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
  const domain = `story-menu-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القائمة', $1, 'QA', gen_random_uuid()) returning id`,
    [`story-menu-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الدمام', 40) returning id`, [orgId]);
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
  // The attendee's own visible video frame — the only frame, so the story opens on it. Its poster is a real picture;
  // its video a stand-in (the spec proves the menu, not a codec), and its 12 s is the frame's clock.
  frameId = crypto.randomUUID();
  const prefix = `${orgId}/sessions/${sessionId}/frames/${frameId}`;
  await db.query(
    `insert into public.story_frames (id, org_id, session_id, kind, trigger_key, triggered_at, author_id, caption, video_path, poster_path, duration_ms)
     values ($1::uuid, $2, $3, 'video', $7::text, now() - interval '2 minutes', $4, 'من القاعة', $5, $6, 12000)`,
    [frameId, orgId, sessionId, attendee, `${prefix}/video.mp4`, `${prefix}/poster.webp`, frameId],
  );
  const objects = [
    ["video.mp4", "video/mp4", new Uint8Array([0, 0, 0, 0])],
    ["poster.webp", "image/webp", readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "story-room.webp"))],
  ] as const;
  for (const [name, type, body] of objects) {
    const { error } = await admin.storage.from("story-media").upload(`${prefix}/${name}`, body, { contentType: type, upsert: true });
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

/** Visible, and the element DRAWN on top at its centre. ★ Hit-testing alone lies here: Radix's modal menu sets
 *  `pointer-events: none` on the layers under it, so `elementFromPoint` skips the viewer even when the viewer is drawn
 *  OVER the menu (z-40 under z-50 — the owner's empty ⋯). Pointer events are forced on for the one measurement. */
async function topmost(page: Page, locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible();
  return locator.evaluate((el) => {
    const style = document.createElement("style");
    style.textContent = "* { pointer-events: auto !important; }";
    document.head.append(style);
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    style.remove();
    return !!hit && (el === hit || el.contains(hit));
  });
}

test("★ tapping ⋯ on a phone opens the menu ON TOP, holds the story, and «أزلني» hides the attendee's own frame", async ({ context, page }) => {
  await signIn(context, attendeeEmail);
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.tap('#main ul[aria-label="جلسات اليوم وما حوله"] button[data-state]');
  const viewer = page.locator("[data-story-viewer]");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("[data-frame-id]")).toHaveAttribute("data-frame-id", frameId);

  // By attribute, not role: an open menu hides the rest of the page from the accessibility tree (Radix's modal menu).
  const more = viewer.locator('button[aria-label="المزيد"]');
  expect(await topmost(page, more), "⋯ is the topmost element at its centre").toBe(true);
  await page.tap('[data-story-viewer] button[aria-label="المزيد"]');
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const removeMe = page.getByRole("menuitem", { name: "أزلني" });
  await expect(removeMe).toBeAttached();
  await page.screenshot({ path: join(SHOTS, "story-menu-webkit-open-390.png") });
  expect(await topmost(page, removeMe), "«أزلني» is the topmost element at its centre").toBe(true);
  // The author is not offered «بلّغ» on their own frame.
  await expect(page.getByRole("menuitem", { name: "بلّغ" })).toHaveCount(0);
  // The clock holds while the menu is open — the frame's paused mark is the state.
  await expect(viewer.locator("[data-paused]")).toHaveCount(1);

  await page.tap('[role="menuitem"]:has-text("أزلني")');
  await expect
    .poll(async () => (await db.query(`select count(*)::int as n from public.story_frame_takedowns where frame_id = $1 and requester_id = $2`, [frameId, attendee])).rows[0].n)
    .toBe(1);
});
