// A watched story can be watched again — DEC-291 (REQ-STO-005, REQ-STO-007, REQ-STO-010).
//
// The owner: «if a user watched a story they can't watch it again». The viewer's clock kept a finished frame's elapsed
// time across a close, and reopening on the same frame kept the same clock key, so the first tick read «done»: a
// one-frame story shut the moment it opened. These cases let a story run out, or close it mid-way, and open it again —
// with no reload and after one — and require it to STAY open. Setup as `wave29-lead-moves`: its own org, a published
// session with a poster and one generated frame. Captures land at `.qa-shots/rtl/story-rewatch-<state>-390.png`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

// A 1×1 PNG — the bytes only have to be a PNG; the card and the hero draw it whole.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let memberEmail = "";
let adminEmail = "";
const userIds: string[] = [];


test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `trn29-e2e-${tag}.example`;
  const one = async <T,>(sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] as T;

  orgId = (await one<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'TRN', gen_random_uuid()) returning id`, [`مؤسسة الحركة ${tag}`, `trn29-e2e-${tag}`])).id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = await one<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إنتاج') returning id`, [orgId]);
  const venue = await one<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'الاستوديو', 40) returning id`, [orgId]);
  sessionId = (
    await one<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
       values ($1, 'الإضاءة في الليل', 'ملخص', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour', $3, 30, now() + interval '2 days', now() + interval '2 days', 'published', now() - interval '1 day')
       returning id`,
      [orgId, category.id, venue.id],
    )
  ).id;
  const doc = await one<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by) values ($1, 'poster', $2::jsonb, $3, null) returning id`,
    [orgId, JSON.stringify({ schemaVersion: 1, layers: [] }), sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc.id]);
  const path = `${orgId}/exports/${doc.id}/master.png`;
  await db.query(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'master', 'png', 800, 1000, $3, $4, 'ready', $5, now())`,
    [orgId, doc.id, path, PNG.byteLength, `fp-${doc.id}`],
  );
  const { error: up } = await admin.storage.from("exports").upload(path, PNG, { contentType: "image/png", upsert: true });
  if (up) throw up;

  // One generated frame, inside the 24 hours, so the home's ring row has a ring to zoom out of (REQ-STO-001).
  await db.query(
    `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, 'published', 'published', now() - interval '30 minutes')`,
    [orgId, sessionId],
  );

  memberEmail = `member@${domain}`;
  adminEmail = `admin@${domain}`;
  for (const [email, name] of [[memberEmail, "عضو الحركة"], [adminEmail, "مدير الحركة"]]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

const viewer = (page: Page) => page.locator("[data-story-viewer]");
const ring = (page: Page) => page.locator('button[data-state][aria-haspopup="dialog"]').filter({ visible: true }).first();

/** Opens the ring and requires the story to stay open past the point a stale clock shut it (it shut at once). */
async function opensAndStays(page: Page) {
  await ring(page).click();
  await expect(viewer(page)).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(viewer(page), "the story closed by itself on reopening").toBeVisible();
}

test("★ a story that ran to its end opens again and plays — without a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await opensAndStays(page);
  // The one generated frame runs 6 s, then the run's end closes the viewer.
  await expect(viewer(page)).toHaveCount(0, { timeout: 12_000 });
  await expect(ring(page)).toHaveAttribute("data-state", "seen");
  await opensAndStays(page);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "story-rewatch-reopened-390.png") });
  // And it plays to its end again.
  await expect(viewer(page)).toHaveCount(0, { timeout: 12_000 });
});

test("★ a story that ran to its end opens again — after a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await opensAndStays(page);
  await expect(viewer(page)).toHaveCount(0, { timeout: 12_000 });
  // The view is written in a batch on close; give it its moment, then read the page fresh.
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(ring(page)).toHaveAttribute("data-state", "seen");
  await opensAndStays(page);
});

test("a story closed mid-way opens again", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await opensAndStays(page);
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await opensAndStays(page);
});

