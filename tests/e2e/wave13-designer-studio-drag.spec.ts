// The POINTER path — wave 13, REQ-DSG-028, DEC-077, DEC-096, DEC-178.
//
// `wave13-designer-studio-taps.spec.ts` proves every operation without a drag;
// this proves the drag itself, on a real canvas in a real browser:
//
//   · ★ a drag to the RIGHT on an Arabic poster is a SMALLER `x` — the overlay
//     works in physical pixels and writes back the document's logical offset;
//   · one gesture is ONE undo entry, however many pointer moves it took;
//   · the south-east handle grows the frame and keeps its opposite corner;
//   · the rotation knob writes a whole degree, 15° steps with shift;
//   · the marquee (mouse only) selects every layer it touches;
//   · a locked region neither moves nor shows a handle.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1440, height: 1000 };
const SESSION_TITLE = "استوديو بالسحب: كل إيماءة خطوة تراجع واحدة";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let documentId = "";
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `drag-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاستوديو', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`drag-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الاستوديو" } });
  if (error) throw error;
  userIds.push(data.user.id);
  await provisionMemberId(adminEmail);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الاستوديو') returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, $2, 'نبذة الجلسة', $3, 'introductory', 'ar', now() + interval '7 days', 60, now() + interval '7 days 1 hour',
             'Asia/Riyadh', 40, 'القاعة الكبرى', 'published', now())
     returning id`,
    [orgId, SESSION_TITLE, cat[0].id],
  );
  // The platform's `talk` template, as seeded, plus one PHOTO layer that fills
  // its frame — the focal point's grid shows only for `cover` (REQ-DSG-030).
  const { rows: version } = await db.query<{ id: string; document: { layers: Array<Record<string, unknown>> } }>(
    `select v.id, v.document from public.design_template_versions v
       join public.design_templates t on t.id = v.template_id
      where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk'
      order by v.version desc limit 1`,
  );
  const document = version[0].document;
  document.layers.push({ id: "l_photo", kind: "image", name: "الصورة", z: 1, frame: { x: 300, y: 1060, w: 400, h: 200 }, image: { assetId: "https://example.invalid/photo.png", fit: "cover" } });
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(document), version[0].id, sess[0].id],
  );
  documentId = doc[0].id;
  await db.query(
    `insert into public.session_posters (org_id, session_id, document_id, mode, binding, detached_at)
     values ($1, $2, $3, 'customised', 'detached', now())
     on conflict (session_id) do update set document_id = excluded.document_id, mode = 'customised', binding = 'detached', detached_at = now()`,
    [orgId, sess[0].id, documentId],
  );
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";
/** ★ DEC-145: page content under `/app` is found inside `#main`. */
const main = (page: Page) => page.locator("#main");

type StoredLayer = { id: string; frame: { x: number; y: number; w: number; h: number; rotation?: number }; z?: number; text?: { literal?: string }; color?: string; image?: { focal?: { x: number; y: number } } };

async function stored(): Promise<StoredLayer[]> {
  const { rows } = await db.query<{ layers: StoredLayer[] }>(`select document->'layers' as layers from public.design_documents where id = $1`, [documentId]);
  return rows[0].layers;
}
async function storedLayer(id: string): Promise<StoredLayer> {
  const layer = (await stored()).find((l) => l.id === id);
  if (!layer) throw new Error(`no stored layer ${id}`);
  return layer;
}

function saved(page: Page) {
  return page.waitForResponse((r) => r.url().includes(`/api/designer/${documentId}`) && r.request().method() === "PUT" && r.status() === 200);
}

async function openStudio(page: Page) {
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();
}

/**
 * ★ A drag is dispatched at VIEWPORT coordinates and is NOT scrolled into view
 * the way `click()` is: a box below the fold is a pointerdown on nothing — no
 * gesture, no save (the first run's «no PUT in 90 s» was exactly this; the same
 * canvas drags and saves in Chromium when it is on screen). So every target is
 * centred in the viewport first, and `drag()` refuses a point outside it.
 */
async function onScreen(locator: ReturnType<Page["locator"]>) {
  // ★ INSTANT, then measured once it has stopped. `globals.css` scrolls
  // smoothly, so a plain scrollIntoView animates and the box read straight
  // after it is the box from BEFORE the scroll — the second run's guard caught
  // exactly that (a point at y 1089 after «centring»). The canvas itself fits:
  // a 1080 × 1350 artboard at the studio's ~0.45 is ~607 px tall, well inside
  // 1000; it is the page's header and toolbar above it that push a lower layer
  // below the fold.
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  let last = "";
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const now = JSON.stringify(box);
      const settled = now === last;
      last = now;
      return settled;
    }, { intervals: [50, 100, 100, 200] })
    .toBe(true);
}

const layerBox = async (page: Page, name: string) => {
  const button = main(page).getByRole("button", { name: `اختيار الطبقة ${name}`, exact: true });
  await onScreen(button);
  const box = await button.boundingBox();
  if (!box) throw new Error(`no box for ${name}`);
  return box;
};

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, options: { shift?: boolean } = {}) {
  const view = page.viewportSize() ?? DESKTOP;
  for (const p of [from, to]) {
    if (p.x < 0 || p.y < 0 || p.x > view.width || p.y > view.height) throw new Error(`drag point ${p.x},${p.y} is outside the ${view.width}×${view.height} viewport`);
  }
  if (options.shift) await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several moves: a gesture is ONE undo entry however many moves it took.
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5);
  await page.mouse.up();
  if (options.shift) await page.keyboard.up("Shift");
}

test("★ drag, resize and rotate on the canvas — one undo step per gesture, the logical axis written", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (09)");
  test.slow();
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  // DEC-149 §4: no smooth scroll under a pointer measurement.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  await expect(main(page).getByText("اسحب الطبقة لتحريكها", { exact: false })).toBeVisible();

  // ── move: to the right on the screen ──────────────────────────────────────
  const where = await storedLayer("l_where");
  const box = await layerBox(page, "المكان");
  let done = saved(page);
  await drag(page, { x: box.x + 40, y: box.y + box.height / 2 }, { x: box.x + 140, y: box.y + box.height / 2 + 60 });
  await done;
  const moved = await storedLayer("l_where");
  // ★ DEC-096: right on the screen is a SMALLER x on an RTL page.
  expect(moved.frame.x).toBeLessThan(where.frame.x);
  expect(moved.frame.y).toBeGreaterThan(where.frame.y);
  expect(moved.frame.w).toBe(where.frame.w);

  // ★ One gesture, one undo step: a single «تراجع» restores the frame.
  done = saved(page);
  await main(page).getByRole("toolbar").getByRole("button", { name: "تراجع", exact: true }).click();
  await done;
  expect((await storedLayer("l_where")).frame).toEqual(where.frame);

  // ── resize from the south-east handle ─────────────────────────────────────
  await main(page).getByRole("button", { name: "اختيار الطبقة الصورة", exact: true }).click();
  const photo = await storedLayer("l_photo");
  const se = main(page).locator('[data-handle="se"]');
  await expect(se).toBeVisible();
  await onScreen(se);
  const handle = await se.boundingBox();
  if (!handle) throw new Error("no south-east handle");
  done = saved(page);
  await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2 + 40, y: handle.y + handle.height / 2 + 20 });
  await done;
  const resized = await storedLayer("l_photo");
  expect(resized.frame.w).toBeGreaterThan(photo.frame.w);
  expect(resized.frame.h).toBeGreaterThan(photo.frame.h);
  // An image keeps its proportion from a corner.
  expect(resized.frame.w / resized.frame.h).toBeCloseTo(photo.frame.w / photo.frame.h, 1);

  // ── rotate from the knob, with shift's 15° steps ──────────────────────────
  const photoBox = await layerBox(page, "الصورة");
  const knob = await main(page).locator('[data-handle="rotate"]').boundingBox();
  if (!knob) throw new Error("no rotation knob");
  const centre = { x: photoBox.x + photoBox.width / 2, y: photoBox.y + photoBox.height / 2 };
  done = saved(page);
  await drag(page, { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 }, { x: centre.x + 200, y: centre.y }, { shift: true });
  await done;
  const rotated = await storedLayer("l_photo");
  expect(Number.isInteger(rotated.frame.rotation)).toBe(true);
  expect(Math.abs(rotated.frame.rotation ?? 0) % 15).toBe(0);
  expect(rotated.frame.rotation).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/wave13-designer-studio-drag.png`, fullPage: true });
});

test("the marquee selects what it touches, and a locked region neither drags nor shows a handle", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (09)");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);

  // From empty canvas at the page's top-left, down across the kicker (full
  // width) and stopping short of the title and of the logo at the top-right.
  // ★ Measure the STAGE LAST. `layerBox()` centres the kicker, which scrolls the
  // page; a stage box read before that is stale, and the press then lands above
  // the stage — on the page, not the canvas — so no marquee begins (reproduced
  // on the standalone canvas: «press lands on: DIV → selected: null»).
  const kicker = await layerBox(page, "نوع الجلسة");
  // The title is 20 document px below the kicker (280 + 60 → 360): about 9
  // screen px at the studio's ~0.45. The marquee selects what it TOUCHES, so it
  // ends in the MIDDLE of that gap, measured — the first cut ended 10 px below
  // the kicker, 1 px inside the title, and selected it, correctly.
  const title = await main(page).getByRole("button", { name: "اختيار الطبقة عنوان الجلسة", exact: true }).boundingBox();
  if (!title) throw new Error("no title box");
  const gapEnd = (kicker.y + kicker.height + title.y) / 2;
  expect(title.y - (kicker.y + kicker.height), "there is a gap to end the marquee in").toBeGreaterThan(2);
  const stage = await main(page).locator("[data-layer-hit-area]").boundingBox();
  if (!stage) throw new Error("no stage");
  expect(stage.y + 8, "the marquee's start must be on screen").toBeGreaterThanOrEqual(0);
  await drag(page, { x: stage.x + 20, y: stage.y + 8 }, { x: stage.x + stage.width / 2, y: gapEnd });
  await expect(main(page).getByRole("button", { name: "اختيار الطبقة نوع الجلسة", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(main(page).getByRole("button", { name: "اختيار الطبقة عنوان الجلسة", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(main(page).getByRole("button", { name: "اختيار الطبقة شعار المؤسسة", exact: true })).toHaveAttribute("aria-pressed", "false");

  // The QR is locked by the template (REQ-DSG-024): it selects, but no handle
  // appears and a drag writes nothing.
  const qr = main(page).getByRole("button", { name: /اختيار الطبقة رمز الجلسة/ });
  await qr.click();
  await expect(main(page).locator("[data-handle]")).toHaveCount(0);
  const before = await storedLayer("l_qr");
  await onScreen(qr);
  const q = await qr.boundingBox();
  if (!q) throw new Error("no QR box");
  await drag(page, { x: q.x + q.width / 2, y: q.y + q.height / 2 }, { x: q.x + q.width / 2 + 80, y: q.y + q.height / 2 - 80 });
  expect((await storedLayer("l_qr")).frame).toEqual(before.frame);
});
