// ★★ SCR-010's ring opens the story viewer, and a story is walked END TO END by a single pointer and by the keyboard
// — each ALONE (REQ-STO-007, REQ-STO-009, REQ-STO-010, DEC-093). `SC 2.5.7` is not `SC 2.1.1` and axe never catches
// either, so these are the gates: the first case uses `page.click()` and nothing else — no `mouse.down`, no
// `dispatchEvent`, no key; the second uses `page.keyboard` and nothing else. The gestures (tap thirds, hold, swipe
// down) are the third case's, through `page.mouse`, as the enhancements they are.
//
// Seeded through SQL against real local Supabase: one org, a company with a team colour, a presenter, a member, two
// sessions that ended an hour ago with three frames each. Captures at 390 and 1280 beside `StoryLive.dc.html`.
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
const DESKTOP = { width: 1280, height: 1040 };
const FIRST = "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية";
const SECOND = "لوحة تحكم لا يهجرها أحد بعد أسبوع";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
const email = { member: "", presenter: "" };
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

/** A session that ended an hour ago, with three frames of its own inside their 24 hours (the generator may add more —
 *  the walk counts what it is shown). Not live: a live ring stays «مباشر» whatever was seen, and the walk proves seen. */
async function endedSession(title: string, presenter: string, category: string, venue: string, ageMinutes: number): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'خمس شرائح فقط.', $3, 'introductory', now() - interval '150 minutes', 90, now() - interval '60 minutes', $4, 40, 'completed', now() - interval '3 days')
     returning id`,
    [orgId, title, category, venue],
  );
  const id = rows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, id, presenter]);
  for (const [kind, key, minutes] of [
    ["published", "published", ageMinutes + 120],
    ["live", "e2e-live", ageMinutes + 30],
    ["materials", "e2e-materials", ageMinutes],
  ] as const) {
    await db.query(
      `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, $3::public.story_frame_kind, $4, now() - make_interval(mins => $5::int))
       on conflict (session_id, kind, trigger_key) do nothing`,
      [orgId, id, kind, key, minutes],
    );
  }
  return id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `stories-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القصص', $1, 'QS', gen_random_uuid()) returning id`,
    [`stories-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  email.member = `member@${domain}`;
  email.presenter = `presenter@${domain}`;
  const { rows: co } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);
  const presenterId = await provision(email.presenter, "سارة القحطاني");
  const memberId = await provision(email.member, "ريم الشمري");
  await db.query(`update public.members set company_id = $1 where id = any($2::uuid[])`, [co[0].id, [presenterId, memberId]]);
  await endedSession(FIRST, presenterId, cat[0].id, venue[0].id, 5);
  await endedSession(SECOND, presenterId, cat[0].id, venue[0].id, 10);
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

async function openHome(page: Page) {
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

const rings = (page: Page) => page.locator("#main").getByRole("list", { name: "جلسات اليوم وما حوله" });
const viewer = (page: Page) => page.locator("[data-story-viewer]");
const frameId = (page: Page) => viewer(page).locator("[data-frame-id]").getAttribute("data-frame-id");

test("★★ a story walked end to end with page.click() ALONE — next, previous, pause, react, close, and the ring turns seen", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, email.member);
  await openHome(page);

  const first = rings(page).getByRole("button").first();
  await expect(first).toHaveAttribute("aria-haspopup", "dialog");
  await page.click('#main ul[aria-label="جلسات اليوم وما حوله"] > li:first-child button');
  await expect(viewer(page)).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave26-content-story-open-390.png") });

  // Pause and resume by the button — a hold is never the only way (DEC-093).
  await page.click('[data-story-viewer] button[aria-label="أوقف مؤقتًا"]');
  await expect(viewer(page).getByRole("button", { name: "تابِع" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: join(SHOTS, "wave26-content-story-paused-390.png") });
  await page.click('[data-story-viewer] button[aria-label="تابِع"]');

  // One reaction, by a click.
  await page.click('[data-story-viewer] button[data-kind="clap"]');
  await expect(viewer(page).locator('button[data-kind="clap"]')).toHaveAttribute("aria-pressed", "true");

  // Next, then back, then forward through every frame of both stories until the run closes itself.
  const start = await frameId(page);
  await page.click('[data-story-viewer] button[aria-label="الإطار التالي"]');
  const second = await frameId(page);
  expect(second).not.toBe(start);
  await page.click('[data-story-viewer] button[aria-label="الإطار السابق"]');
  expect(await frameId(page)).toBe(start);

  const seenIds = new Set<string>();
  for (let step = 0; step < 20 && (await viewer(page).count()) > 0; step++) {
    const id = await frameId(page);
    if (id) seenIds.add(id);
    await page.click('[data-story-viewer] button[aria-label="الإطار التالي"]');
  }
  await expect(viewer(page)).toHaveCount(0);
  expect(seenIds.size).toBeGreaterThanOrEqual(6);

  // The views were written: after a reload, on any device, the rings read seen.
  await openHome(page);
  for (const title of [FIRST, SECOND]) await expect(rings(page).getByRole("button", { name: new RegExp(`${title.slice(0, 12)}.*شوهدت`) })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave26-content-story-rings-seen-390.png") });
});

test("★★ the same story walked with the KEYBOARD alone — ← → Home End Space Escape, focus back on the ring", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, email.presenter);
  await openHome(page);

  // Tab until the first ring has focus — no click anywhere.
  const ring = rings(page).getByRole("button").first();
  for (let i = 0; i < 60 && !(await ring.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(ring).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(viewer(page)).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "wave26-content-story-desktop-1280.png") });

  const at = async () => frameId(page);
  const start = await at();
  await page.keyboard.press("ArrowLeft"); // RTL: ← is next
  expect(await at()).not.toBe(start);
  await page.keyboard.press("ArrowRight");
  expect(await at()).toBe(start);
  await page.keyboard.press("End");
  const last = await at();
  await page.keyboard.press("Home");
  expect(await at()).toBe(start);
  expect(last).not.toBe(start);

  await page.keyboard.press("Space");
  await expect(viewer(page).getByRole("button", { name: "تابِع" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(viewer(page).getByRole("button", { name: "أوقف مؤقتًا" })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await expect(ring).toBeFocused();
});

test("the gestures, as enhancements: a tap on the start third goes back, a hold pauses, a swipe down closes", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, email.member);
  await openHome(page);
  await rings(page).getByRole("button").first().click();
  const box = (await viewer(page).locator("[data-story-taps]").boundingBox())!;
  const y = box.y + box.height / 2;

  const start = await frameId(page);
  await page.mouse.click(box.x + box.width * 0.2, y); // RTL: the left is the end — next
  expect(await frameId(page)).not.toBe(start);
  await page.mouse.click(box.x + box.width * 0.9, y); // the start third — previous
  expect(await frameId(page)).toBe(start);

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await expect(viewer(page).getByText("متوقفة")).toBeVisible();
  await page.mouse.up();

  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await expect(viewer(page)).toHaveCount(0);
});
