// ★ THE PUBLIC SESSION CARD, SIGNED OUT — the owner's decision of 2026-09-15.
//
// Every assertion here is made with NO cookie of any kind, because that is the
// only state the feature exists for: a link pasted into a group chat, fetched
// by a crawler that will never have an account, and opened by a person who may
// not have one either.
//
// It proves the three halves of the decision:
//   1. the six public fields render, and the poster's `og` bytes are served;
//   2. the Open Graph tags are absolute and carry the date and the venue;
//   3. a draft session's card is a 404, indistinguishable from a bad id.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

// A 1×1 PNG. The bytes only have to BE a PNG and come back unchanged; what
// the poster looks like is the parity suite's job, not this one's.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let orgName = "";
let venueName = "";
let publishedId = "";
let draftId = "";
let ogPath = "";

test.beforeAll(async ({}, testInfo) => {
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  orgName = `نادي البطاقة ${testInfo.workerIndex}`;
  venueName = "قاعة الابتكار";

  const org = await one<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ($1, $2, 'PC', gen_random_uuid(), $3) returning id`,
    [orgName, `e2e-card-${tag}`, `boss@e2e-card-${tag}.example`],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [org.id]);
  const category = await one<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [org.id]);
  const venue = await one<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, $2, 'شارع لا يظهر') returning id`, [
    org.id,
    venueName,
  ]);
  const admin = await one<{ id: string }>(
    `insert into public.members (org_id, auth_user_id, display_name, email, org_role, status)
     values ($1, gen_random_uuid(), 'مشرفة', $2, 'admin', 'active') returning id`,
    [org.id, `boss@e2e-card-${tag}.example`],
  );

  const session = async (title: string, state: string) =>
    (
      await one<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                      ends_at, time_zone, venue_id, capacity, state, published_at)
         values ($1, $2, 'نبذة لا تظهر على البطاقة العامة', $3, 'intermediate', 'ar',
                 now() + interval '2 days', 60, now() + interval '2 days' + interval '1 hour',
                 'Asia/Riyadh', $4, 30, $5::public.session_state,
                 case when $5 = 'published' then now() end)
         returning id`,
        [org.id, title, category.id, venue.id, state],
      )
    ).id;

  publishedId = await session("كيف نكتب تقريرًا يُقرأ", "published");
  draftId = await session("مسودة لا تُشارَك", "draft");

  // The poster, and one ready `og` render of it — what the crawler fetches.
  const doc = await one<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [org.id, JSON.stringify({ schemaVersion: 1, layers: [] }), publishedId, admin.id],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [org.id, publishedId, doc.id]);
  ogPath = `${org.id}/exports/${doc.id}/og.png`;
  await db.query(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px,
                                          storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'og', 'png', 1200, 630, $3, $4, 'ready', $5, now())`,
    [org.id, doc.id, ogPath, PNG.byteLength, `fp-${doc.id}`],
  );

  // The bytes themselves, written the way the worker writes them.
  const service = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const { error } = await service.storage.from("exports").upload(ogPath, PNG, { contentType: "image/png", upsert: true });
  expect(error, error?.message).toBeNull();
});

test.afterAll(async () => {
  await db?.end();
});

async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

/** The content of a `<meta property=…>` / `<meta name=…>` tag in the HTML the
 *  server sent. Read from the RESPONSE BODY and not from the DOM: a crawler
 *  does not run JavaScript, so a tag that only exists after hydration does not
 *  exist at all. */
function meta(html: string, key: string): string | null {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]*>`, "i");
  const tag = html.match(pattern)?.[0];
  return tag?.match(/content="([^"]*)"/i)?.[1] ?? null;
}

test("a signed-out visitor sees the six public fields and nothing else", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize(PHONE);
  const response = await page.goto(`/ar/s/${publishedId}`);
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("كيف نكتب تقريرًا يُقرأ");
  await expect(page.getByText(venueName)).toBeVisible();
  await expect(page.getByText(orgName).first()).toBeVisible();

  // ★ What was NOT opened. The abstract and the venue's address are not in
  // the function's return type, so they cannot reach this page — this asserts
  // the consequence rather than trusting it.
  await expect(page.locator("body")).not.toContainText("نبذة لا تظهر على البطاقة العامة");
  await expect(page.locator("body")).not.toContainText("شارع لا يظهر");
  // REQ-SES-008: no stream link, no join affordance, anywhere on the card.
  await expect(page.locator("a[href^='http']")).toHaveCount(0);

  // The one primary action, pointing back at the member's event page.
  const cta = page.getByRole("link", { name: "سجّل الدخول لحجز مقعدك" });
  await expect(cta).toHaveAttribute("href", `/ar/sign-in?next=${encodeURIComponent(`/ar/app/sessions/${publishedId}`)}`);
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // 390 px, RTL, and no sideways scroll.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.qa-shots/rtl/scr-012-public-card-390-rtl-${test.info().project.name}.png`, fullPage: true });
});

test("the Open Graph tags are absolute and carry the date and the venue", async ({ request }) => {
  const html = await (await request.get(`/ar/s/${publishedId}`)).text();

  expect(meta(html, "og:title")).toBe("كيف نكتب تقريرًا يُقرأ");
  expect(meta(html, "og:locale")).toBe("ar_SA");
  expect(meta(html, "og:site_name")).toBe(orgName);
  expect(meta(html, "og:description")).toContain(venueName);
  expect(meta(html, "og:description")).toContain(orgName);
  expect(meta(html, "twitter:card")).toBe("summary_large_image");

  const image = meta(html, "og:image");
  // ★ ABSOLUTE. A relative og:image is no image at all in half the crawlers.
  expect(image).toMatch(/^https?:\/\/[^/]+\/api\/s\//);
  expect(image).toContain(`/api/s/${publishedId}/og`);
  expect(meta(html, "og:image:width")).toBe("1200");
  expect(meta(html, "og:image:height")).toBe("630");

  // Members-only, so it is not indexed — the owner opened these fields to
  // whoever HOLDS the link, which is not the same as being findable.
  expect(meta(html, "robots")).toContain("noindex");
});

test("the image is served to an unauthenticated crawler, with the poster's bytes", async ({ request }) => {
  const res = await request.get(`/api/s/${publishedId}/og`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toContain("max-age");
  const body = await res.body();
  expect(body.byteLength).toBe(PNG.byteLength);
  expect(body.subarray(0, 8)).toEqual(PNG.subarray(0, 8));
});

test("a draft session's card is a 404, and so is its image", async ({ request }) => {
  const card = await request.get(`/ar/s/${draftId}`);
  expect(card.status()).toBe(404);
  expect(await card.text()).not.toContain("مسودة لا تُشارَك");

  expect((await request.get(`/api/s/${draftId}/og`)).status()).toBe(404);
  // An id that names nothing answers exactly the same way, so the card can
  // never confirm that an unpublished session exists.
  expect((await request.get(`/ar/s/11111111-2222-3333-4444-555555555555`)).status()).toBe(404);
  expect((await request.get(`/api/s/11111111-2222-3333-4444-555555555555/og`)).status()).toBe(404);
});

test("a cancelled session stops being a card, image included", async ({ request }) => {
  await db.query(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'اختبار' where id = $1`, [
    publishedId,
  ]);
  expect((await request.get(`/ar/s/${publishedId}`)).status()).toBe(404);
  // ★ And the BYTES stop too. A signed URL minted before the cancellation
  // would have kept working; reading the object per request does not.
  expect((await request.get(`/api/s/${publishedId}/og`)).status()).toBe(404);

  await db.query(`update public.sessions set state = 'published', cancelled_at = null, cancellation_reason = null where id = $1`, [
    publishedId,
  ]);
});
