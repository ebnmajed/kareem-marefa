// DEC-284 — the next screen is fetched before the tap lands (`src/lib/ui/intent-prefetch.ts`, `next.config.ts`).
//
// What «snappy» means here, measured rather than felt: once the shell has been idle, a tab the member taps is served
// from what was already fetched — NO page request leaves when they tap it; a press-down on a session card fetches its
// FULL page before the click lands; and returning to a tab within the freshness window asks the server nothing.
// Page requests are counted by Next's own header (`rsc: 1`) and by `next-router-prefetch` for prefetches.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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
  const domain = `fast-e2e-${tag}.example`;
  const one = async <T,>(sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] as T;

  orgId = (await one<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'FST', gen_random_uuid()) returning id`, [`مؤسسة السرعة ${tag}`, `fast-e2e-${tag}`])).id;
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


type Req = { url: string; prefetch: boolean; at: number };
function watch(page: Page): Req[] {
  const seen: Req[] = [];
  page.on("request", (r) => {
    const h = r.headers();
    if (h["rsc"] === "1") seen.push({ url: new URL(r.url()).pathname, prefetch: h["next-router-prefetch"] === "1", at: Date.now() });
  });
  return seen;
}
const navigations = (seen: Req[], path: string, after: number) => seen.filter((r) => r.url.endsWith(path) && !r.prefetch && r.at >= after);
const prefetches = (seen: Req[], path: string) => seen.filter((r) => r.url.endsWith(path) && r.prefetch);

test("★ after the shell is idle, a tapped tab is already here — no page request leaves on the tap", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  const seen = watch(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => prefetches(seen, "/ar/app/leaderboards").length, { timeout: 10_000 }).toBeGreaterThan(0);

  const before = Date.now();
  await page.locator('nav[data-tab-bar] a[href$="/app/leaderboards"]').click();
  await page.waitForURL(/\/app\/leaderboards$/);
  await expect(page.locator("#main h1").first()).toBeVisible();
  expect(navigations(seen, "/ar/app/leaderboards", before), "a page request left on the tap").toEqual([]);
});

test("★ a press-down on a session card fetches its full page before the click lands", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  const seen = watch(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  const card = page.locator(`#main a[href$="/app/sessions/${sessionId}"]`).first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => prefetches(seen, `/ar/app/sessions/${sessionId}`).length, { timeout: 5_000 }).toBeGreaterThan(0);
  const before = Date.now();
  await page.mouse.up();
  await page.waitForURL(new RegExp(`/app/sessions/${sessionId}$`));
  await expect(page.locator("#main h1").first()).toBeVisible();
  expect(navigations(seen, `/ar/app/sessions/${sessionId}`, before), "the click asked again").toEqual([]);
});

test("returning to a tab inside the window asks the server nothing", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  const seen = watch(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await page.locator('nav[data-tab-bar] a[href$="/app/sessions"]').click();
  await page.waitForURL(/\/app\/sessions$/);
  await page.waitForLoadState("networkidle");
  const before = Date.now();
  await page.locator('nav[data-tab-bar] a[href$="/ar/app"]').click();
  await page.waitForURL(/\/ar\/app$/);
  await expect(page.locator("#main").first()).toBeVisible();
  expect(navigations(seen, "/ar/app", before), "the return asked again").toEqual([]);
});
