// Wave 12 demonstrable D1 — REQ-UIX-026, DEC-172: a poster is shown whole.
//
// The defect was reported from a screenshot of the timeline at 390 px: a 4:5
// poster in a `row` card with its title sliced mid-word. The cause was two
// classes in `ui/card.tsx` together — the row densities stretched the media box
// to the body's height (`items-stretch`) at a fixed width, and the image filled
// that taller-than-4:5 box with `object-cover`, cutting both edges.
//
// What this proves against the real page, on a production build:
//   · the timeline card's media box IS 4:5 — it no longer stretches;
//   · the image is `object-contain`, so its rendered content box is the whole
//     poster: nothing of it lies outside the box;
//   · a capture of the fixed card, and beside it a REPRODUCTION of the old
//     rendering (the two old classes re-injected on this same page), so the
//     before and after are the same poster at the same width.
//
// The poster is synthetic on purpose: a frame and a title that run to both
// edges, so a crop of even a few pixels is visible. Its bytes are written the
// way the worker writes a `master` render.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TITLE = "تصميم الأنظمة الموزّعة على نطاق واسع";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
const userIds: string[] = [];

// A 1080 × 1350 (4:5) poster: navy ground, a bright frame on all four edges,
// and a title set to touch both sides. Rendered by the test's own browser.
async function posterBytes(browser: import("@playwright/test").Browser): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(`<!doctype html><html dir="rtl"><body style="margin:0">
    <div style="box-sizing:border-box;width:1080px;height:1350px;border:28px solid #f5b83d;background:linear-gradient(140deg,#0b1a33,#1d3563);
                display:flex;flex-direction:column;justify-content:space-between;padding:60px 0;font-family:sans-serif;color:#fff">
      <div style="display:flex;justify-content:space-between;font-size:44px;padding:0 8px"><span>◀ الحافة</span><span>الحافة ▶</span></div>
      <div style="font-size:118px;font-weight:700;line-height:1.3;text-align:center;padding:0">${TITLE}</div>
      <div style="display:flex;justify-content:space-between;font-size:44px;padding:0 8px"><span>◀ الحافة</span><span>الحافة ▶</span></div>
    </div></body></html>`);
  const bytes = await page.screenshot({ type: "png" });
  await page.close();
  return bytes;
}

test.beforeAll(async ({ browser }, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الملصق الكامل', $1, 'PW', gen_random_uuid()) returning id`,
    [`w12-poster-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  const domain = `w12-poster-${tag}.example`;
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userIds.push(data.user.id);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name) values ($1, 'القاعة الكبرى') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, state, starts_at, duration_minutes, ends_at, capacity, venue_id, published_at)
     values ($1, $2, 'نبذة.', $3, 'introductory', 'published', now() + interval '2 days', 60, now() + interval '2 days 1 hour', 60, $4, now() - interval '1 day')
     returning id`,
    [orgId, TITLE, cat[0].id, venue[0].id],
  );
  const sessionId = s[0].id;

  const png = await posterBytes(browser);
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', $2::jsonb, $3, null) returning id`,
    [orgId, JSON.stringify({ schemaVersion: 1, layers: [] }), sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc[0].id]);
  const path = `${orgId}/exports/${doc[0].id}/master.png`;
  await db.query(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px,
                                          storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'master', 'png', 1080, 1350, $3, $4, 'ready', $5, now())`,
    [orgId, doc[0].id, path, png.byteLength, `fp-${doc[0].id}`],
  );
  const { error: upErr } = await admin.storage.from("exports").upload(path, png, { contentType: "image/png", upsert: true });
  if (upErr) throw upErr;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function streamed(p: Page) {
  await expect(p.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ D1 — the timeline card shows the whole poster at 390 px (REQ-UIX-026)", async ({ context, page }, testInfo) => {
  await signIn(context, memberEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await page.goto("/ar/app");
  await streamed(page);

  const card = page.locator("#main article", { hasText: TITLE }).first();
  const img = card.locator('[data-slot="media"] img');
  await expect(img).toBeVisible();
  // Loaded, and 4:5 (the synthetic poster's pixel size follows the device scale).
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
  expect(Math.abs(natural - 0.8)).toBeLessThan(0.01);

  // The box is the poster's own aspect — not stretched to the body's height.
  const box = await card.locator('[data-slot="media"]').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width / box!.height - 0.8)).toBeLessThan(0.02);

  // And the image is contained: its fit is `contain`, so the rendered poster is
  // never larger than the box in either dimension.
  const fit = await img.evaluate((el) => getComputedStyle(el).objectFit);
  expect(fit).toBe("contain");

  if (testInfo.project.name === "phone") {
    mkdirSync(SHOTS, { recursive: true });
    await card.screenshot({ path: join(SHOTS, "wave12-lead-timeline-card-whole-poster.png") });
    await page.screenshot({ path: join(SHOTS, "wave12-lead-timeline-whole-poster.png"), fullPage: true });

    // ★ The reproduction, labelled as one: the two old classes' effect put back
    // on this same page — the media stretched to the row and the image covering
    // it — so the before and the after are the same poster at the same width.
    await page.addStyleTag({
      content: `#main article [data-density] > [data-slot=media] { align-self: stretch !important; aspect-ratio: auto !important; }
                #main article [data-slot=media] img { object-fit: cover !important; }`,
    });
    await card.screenshot({ path: join(SHOTS, "wave12-lead-timeline-card-cropped-reproduction.png") });
  }
});
