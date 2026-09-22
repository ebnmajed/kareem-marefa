// ★ A RENDER, ASSERTED AT LAST — DEC-179's fourth condition, REQ-DSG-020,
// REQ-DSG-030, DEC-178 (D2b).
//
// Until wave 13 an image layer's asset id was drawn as `<img src="<uuid>">`:
// every uploaded poster and every worker-generated logo, broken, in the studio
// and in every export — and `wave8-designer-posters` asserted the upload's mode
// and binding, never what it rendered, so nothing could see it. This uploads a
// poster through the real picker and looks at the PIXELS:
//
//   1. the studio's canvas loads the image (a URL the browser fetched, with a
//      real size) — not a relative uuid;
//   2. with a worker on this database (`E2E_WORKER=1`), the rendered MASTER is
//      the image edge to edge — red at the centre AND at the corner, where the
//      pre-wave-13 `fill` left an 80 px white inset — and the SQUARE variant is
//      really cropped (`scale: 'page'`, D2b): red to its corners too, never
//      letterboxed.
//
// The picker is `sessions'` schedule screen; this spec only drives it.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WORKER = process.env.E2E_WORKER === "1";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1440, height: 1000 };
const TITLE = "ملصق مرفوع يُرى كما رُفع";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let email = "";
const userIds: string[] = [];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}
/** A solid red RGB PNG — a colour no background, placeholder or brand token here is. */
function redPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([220, 20, 30], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `upload-render-${tag}.example`;
  email = `boss@${domain}`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة الملصق المرفوع', $1, 'UR', gen_random_uuid(), $2) returning id`,
    [`upload-render-${tag}`, email],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الملصقات" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at, time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, $2, 'نبذة', $3, 'introductory', 'ar', now() + interval '9 days', 60, now() + interval '9 days 1 hour', 'Asia/Riyadh', 30, 'القاعة', 'published', now()) returning id`,
    [orgId, TITLE, cat[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const onPhone = () => test.info().project.name === "phone";

/** RGB at (x, y) of a PNG the browser loads from `url`, read through a canvas. */
async function pixel(page: Page, url: string, x: number, y: number): Promise<[number, number, number]> {
  return page.evaluate(
    async ({ url, x, y }) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    { url, x, y },
  );
}
const isRed = ([r, g, b]: [number, number, number]) => r > 180 && g < 70 && b < 80;

test("★ an uploaded poster is SEEN — in the studio, and (with a worker) edge to edge in the master and cropped into the square", async ({ context, page }) => {
  test.skip(onPhone(), "the upload is driven on the desktop picker; the phone's captures are wave 8's");
  await signIn(context);
  await page.setViewportSize(DESKTOP);

  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  const upload = main(page).locator('section[aria-labelledby="poster"]').locator("article", { has: page.getByRole("heading", { name: "رفع ملصق جاهز", level: 3, exact: true }) });
  await upload.locator('input[type="file"][name="poster"]').setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: redPng(1200, 1500) });
  await upload.getByRole("button", { name: "ارفع الملصق", exact: true }).click();
  await expect(page.getByText("رُفع الملصق، وتُجهَّز مقاساته الآن.", { exact: true })).toBeVisible({ timeout: 30_000 });

  const { rows } = await db.query<{ document_id: string; schema_version: number; scale: string }>(
    `select p.document_id, (d.document->>'schemaVersion')::int as schema_version,
            d.document#>>'{layers,0,presets,square,scale}' as scale
       from public.session_posters p join public.design_documents d on d.id = p.document_id where p.session_id = $1`,
    [sessionId],
  );
  const documentId = rows[0]!.document_id;
  // D2b: the upload is written with `page`, and says it needs version 2.
  expect(rows[0]).toMatchObject({ schema_version: 2, scale: "page" });

  // ★ 1 · the studio's canvas LOADS the image — a URL with a real size, not a uuid.
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  const img = main(page).frameLocator('iframe[title="لوحة التصميم"]').locator('img[data-layer="uploaded"]');
  await expect(img).toHaveAttribute("src", /^https?:\/\//);
  await expect.poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  if (!WORKER) return;
  test.setTimeout(12 * 60_000);

  // ★ 2 · the worker's own renders.
  const ready = async (preset: string) =>
    (
      await db.query<{ storage_path: string }>(
        `select storage_path from public.export_artifacts where document_id = $1 and preset = $2 and format = 'png' and status = 'ready'`,
        [documentId, preset],
      )
    ).rows[0]?.storage_path;
  await expect.poll(async () => Boolean((await ready("master")) && (await ready("square"))), { timeout: 10 * 60_000, intervals: [5_000] }).toBe(true);

  const signed = async (path: string) => {
    const { data, error } = await admin.storage.from("exports").createSignedUrl(path, 300);
    if (error || !data) throw error ?? new Error("no signed url");
    return data.signedUrl;
  };
  const master = await signed((await ready("master"))!);
  expect(isRed(await pixel(page, master, 540, 675)), "the master's centre is the uploaded image").toBe(true);
  expect(isRed(await pixel(page, master, 4, 4)), "the master is full bleed — no 80 px inset (D2b)").toBe(true);
  const square = await signed((await ready("square"))!);
  expect(isRed(await pixel(page, square, 4, 4)), "the square is cropped to its corners, never letterboxed").toBe(true);
  expect(isRed(await pixel(page, square, 1075, 1075))).toBe(true);
});
