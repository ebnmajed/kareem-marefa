// ★★ THE SC 2.5.7 GATE FOR WAVE 23 — REQ-UIX-110, REQ-DSG-028, DEC-093, DEC-237, DEC-238.
//
// The rebuilt studio draws three new drags — العناصر → the canvas («سحب رمز QR»), الحقول → the canvas («اسحب حقلًا
// إلى اللوحة») and الملفات → the canvas — and the layer list's reorder. Each has a path that is NOT a drag, and this
// spec performs every one with `click()`, `fill()` and `selectOption()` alone, reading the stored document after each:
//
//   · العناصر  → a tap on «رمز QR» adds a QR on the event page's URL; one tap on the canvas places it; «دائرة» and «خط»;
//   · الحقول   → a tap on {المكان} adds a field bound to the venue;
//   · الملفات  → a tap on an uploaded image adds an image layer of that asset;
//   · الطبقات  → ▲ on a row moves it one step forward;
//   · and the numbers survive, closed in «الموضع والحجم», and a typed width is saved.
//
// ★ No pointer-drag API, no mouse and no keyboard in this file — `tests/unit/designer-taps-guard.test.ts` fails the
// build if one appears. A tap at a position is `click({ position })`: press and release at one point.
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
const SESSION_TITLE = "استوديو الموجة 23: كل سحب له نقرة";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let documentId = "";
let assetId = "";
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
  const domain = `taps23-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاستوديو', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`taps23-${tag}`, adminEmail],
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
  // ★ LEDGER (wave 27, PR D, DEC-254 §3): the org's own seeded template — there is no live platform row to read.
  const { rows: version } = await db.query<{ id: string; document: { layers: Array<Record<string, unknown>> } }>(
    `select v.id, v.document from public.design_template_versions v
       join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.purpose = 'poster' and t.family = 'talk'
      order by t.is_default desc, v.version desc limit 1`,
    [orgId],
  );
  const document = version[0].document;
  document.layers.push({ id: "l_photo", kind: "image", name: "الصورة", z: 1, frame: { x: 300, y: 1060, w: 400, h: 200 }, image: { assetId: "https://example.invalid/photo.png", fit: "cover" } });
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(document), version[0].id, sess[0].id],
  );
  documentId = doc[0].id;
  // One uploaded image for الملفات — its bytes are never fetched by this spec; the tile is what is tapped.
  const { rows: asset } = await db.query<{ id: string }>(
    `insert into public.design_assets (org_id, storage_path, sniffed_mime, width, height, byte_size)
     values ($1, $2, 'image/png', 400, 200, 1000) returning id`,
    [orgId, `${orgId}/design-assets/wave23-taps.png`],
  );
  assetId = asset[0].id;
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

type StoredLayer = { id: string; kind?: string; qr?: { binding: string }; field?: { binding: string }; shape?: { type: string }; frame: { x: number; y: number; w: number; h: number; rotation?: number }; z?: number; text?: { literal?: string }; color?: string; image?: { focal?: { x: number; y: number } } };

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


const panel = (page: Page) => main(page).getByRole("tablist", { name: "لوحات المحرّر", exact: true });
const railPanel = (page: Page) => main(page).getByRole("tabpanel").first();
const inspector = (page: Page) => main(page).getByRole("region", { name: "الخصائص", exact: true });
async function rail(page: Page, name: string) {
  // الفحوصات is the one rail item that carries a count, and its accessible name carries the count's words.
  await panel(page).getByRole("tab", name === "الفحوصات" ? { name: /^الفحوصات/ } : { name, exact: true }).click();
}

test("★ SC 2.5.7 — every drag wave 23 drew has a tap, and the stored document changes each time", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (06 §2); the phone is view and approve");
  test.slow();
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await openStudio(page);
  const count = async () => (await stored()).length;

  // ── العناصر → the canvas: a tap adds the QR, a tap on the canvas places it ──────────────────
  let before = await count();
  let done = saved(page);
  await rail(page, "العناصر");
  await railPanel(page).getByRole("button", { name: "رمز QR", exact: true }).click();
  await done;
  let layers = await stored();
  expect(layers).toHaveLength(before + 1);
  const qr = layers[layers.length - 1]!;
  expect(qr.kind).toBe("qr");
  expect(qr.qr?.binding).toBe("session.eventUrl");
  await expect(main(page).getByText("انقر على اللوحة حيث تريد أن يقع مركز الطبقة.", { exact: true })).toBeVisible();
  done = saved(page);
  await main(page).locator("[data-layer-hit-area]").click({ position: { x: 80, y: 80 } });
  await done;
  expect((await storedLayer(qr.id)).frame).not.toEqual(qr.frame);
  await page.screenshot({ path: `${SHOTS}/wave23-designer-poster-elements-1280.png` });

  for (const [tile, type] of [["دائرة", "ellipse"], ["خط", "line"]] as const) {
    before = await count();
    done = saved(page);
    await rail(page, "العناصر");
    await railPanel(page).getByRole("button", { name: tile, exact: true }).click();
    await done;
    layers = await stored();
    expect(layers).toHaveLength(before + 1);
    expect(layers[layers.length - 1]!.shape?.type).toBe(type);
  }

  // ── الحقول → the canvas: a tap adds the bound field ─────────────────────────────────────────
  before = await count();
  done = saved(page);
  await rail(page, "الحقول");
  await railPanel(page).getByRole("button", { name: /^\{المكان\}/ }).click();
  await done;
  layers = await stored();
  expect(layers).toHaveLength(before + 1);
  expect(layers[layers.length - 1]!.field?.binding).toBe("session.venueName");

  // ── الملفات → the canvas: a tap on an uploaded image adds it ─────────────────────────────────
  before = await count();
  done = saved(page);
  await rail(page, "الملفات");
  await railPanel(page).getByRole("button", { name: /400 × 200/ }).click();
  await done;
  layers = await stored();
  expect(layers).toHaveLength(before + 1);
  expect((layers[layers.length - 1] as StoredLayer & { image?: { assetId?: string } }).image?.assetId).toBe(assetId);

  // ── الطبقات: ▲ on a row moves it one step forward ──────────────────────────────────────────
  await rail(page, "الطبقات");
  const index = async () => (await stored()).map((l) => l.id).indexOf("l_where");
  const zBefore = (await storedLayer("l_where")).z;
  const indexBefore = await index();
  done = saved(page);
  await railPanel(page)
    .locator("li", { has: page.getByText("المكان", { exact: true }) })
    .getByRole("button", { name: "طبقة إلى الأمام", exact: true })
    .click();
  await done;
  expect((await storedLayer("l_where")).z !== zBefore || (await index()) !== indexBefore).toBe(true);

  // ── the numbers: closed under الموضع, never deleted, and a typed width is saved (DEC-093) ──────
  await railPanel(page).getByRole("button", { name: /^المكان/ }).first().click();
  await rail(page, "الطبقة");
  await inspector(page).getByRole("tab", { name: "الموضع", exact: true }).click();
  const numbers = inspector(page).getByRole("button", { name: "الموضع والحجم", exact: true });
  await expect(numbers).toHaveAttribute("aria-expanded", "false");
  await numbers.click();
  done = saved(page);
  await inspector(page).getByLabel("العرض", { exact: true }).fill("640");
  await done;
  expect((await storedLayer("l_where")).frame.w).toBe(640);
  await page.screenshot({ path: `${SHOTS}/wave23-designer-poster-layer-1280.png` });

  // ── checks are a rail item with a count, never a modal ────────────────────────────────────────
  await rail(page, "الفحوصات");
  await expect(railPanel(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
