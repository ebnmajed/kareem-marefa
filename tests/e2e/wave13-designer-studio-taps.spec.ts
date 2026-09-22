// ★ THE SC 2.5.7 GATE — wave 13, REQ-DSG-028's first acceptance, DEC-093, DEC-178.
//
// «A Playwright case that performs EVERY studio operation using `page.click()`
// only — no press-move-release — and asserts the document changed.» Wave 8's
// `wave8-designer-editor.spec.ts` holds it for what wave 8 shipped (align, fit,
// reorder, the numbers, undo). This holds it for everything wave 13 added to the
// canvas — each drag has a tap, and here is the tap:
//
//   · move      → «ضع بنقرة», then ONE click on the canvas at a position;
//   · resize    → «املأ المنطقة الآمنة عرضًا»;
//   · rotate    → «دوّر 15° مع الساعة», and back with «صفّر الدوران»;
//   · reorder   → ▲ on the layer's row;
//   · focal     → one radio of the nine-point grid;
//   · multi     → «تحديد متعدّد», then taps on three rows;
//   · group     → align to the selection's start, then distribute vertically;
//   · D1b       → «أضف» a text, type its words, pick its colour token,
//                 duplicate it, delete it through the named confirm.
//
// ★ There is no pointer-drag API anywhere in this file (no down/move/up, no
// `dragTo`). A tap at a position is `click({ position })`: press and release at
// one point.
//
// Captures: `.qa-shots/rtl/wave13-designer-studio-<state>.png` (desktop, full
// page — the studio is desktop-only by 09; the phone's review is wave 8's).
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
const SESSION_TITLE = "استوديو بلا سحب: كل عملية بنقرة";

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
  const domain = `taps-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاستوديو', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`taps-${tag}`, adminEmail],
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

const panel = (page: Page) => main(page).getByRole("tablist", { name: "لوحات المحرّر" });
const inspector = (page: Page) => main(page).getByRole("region", { name: "الخصائص" });
async function selectInList(page: Page, name: string) {
  await panel(page).getByRole("tab", { name: "الطبقات" }).click();
  await main(page).getByRole("tabpanel").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await panel(page).getByRole("tab", { name: "الخصائص" }).click();
}

test("★ SC 2.5.7 — every operation wave 13 added to the canvas is performed with click() alone, and the stored document changes each time", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (09); the phone's review is asserted by wave 8's spec");
  test.slow();
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await openStudio(page);

  // ── move: «ضع بنقرة», then one click on the canvas ────────────────────────
  await selectInList(page, "المكان");
  const before = await storedLayer("l_where");
  let done = saved(page);
  await inspector(page).getByRole("button", { name: "ضع بنقرة" }).click();
  await main(page).locator("[data-layer-hit-area]").click({ position: { x: 60, y: 60 } });
  await done;
  const placed = await storedLayer("l_where");
  expect(placed.frame.x).not.toBe(before.frame.x);
  expect(placed.frame.y).not.toBe(before.frame.y);
  // Near the top of the page: the tap was 60 screen px from the top.
  expect(placed.frame.y).toBeLessThan(before.frame.y);

  // ── resize: «املأ المنطقة الآمنة عرضًا» ─────────────────────────────────
  done = saved(page);
  await inspector(page).getByRole("button", { name: "املأ المنطقة الآمنة عرضًا" }).click();
  await done;
  expect((await storedLayer("l_where")).frame).toMatchObject({ x: 80, w: 920 });

  // ── rotate: ±15°, and back ────────────────────────────────────────────────
  done = saved(page);
  await inspector(page).getByRole("button", { name: "دوّر 15° مع الساعة" }).click();
  await done;
  expect((await storedLayer("l_where")).frame.rotation).toBe(15);
  done = saved(page);
  await inspector(page).getByRole("button", { name: "صفّر الدوران" }).click();
  await done;
  expect((await storedLayer("l_where")).frame.rotation).toBe(0);

  // ── reorder: ▲ on the row ──────────────────────────────────────────────────
  await panel(page).getByRole("tab", { name: "الطبقات" }).click();
  const order = async () => (await stored()).map((l) => l.id).indexOf("l_where");
  const zBefore = (await storedLayer("l_where")).z;
  const indexBefore = await order();
  done = saved(page);
  await main(page)
    .getByRole("tabpanel")
    .locator("li", { has: page.getByText("المكان", { exact: true }) })
    .getByRole("button", { name: "طبقة إلى الأمام" })
    .click();
  await done;
  const after = await storedLayer("l_where");
  expect(after.z !== zBefore || (await order()) !== indexBefore).toBe(true);

  // ── focal point: the nine-point grid alone (REQ-DSG-030's second acceptance) ──
  await selectInList(page, "الصورة");
  const grid = inspector(page).getByRole("radiogroup", { name: "نقطة التركيز" });
  await expect(grid.getByRole("radio")).toHaveCount(9);
  await expect(grid.getByRole("radio", { name: "الوسط" })).toHaveAttribute("aria-checked", "true");
  done = saved(page);
  await grid.getByRole("radio", { name: "أسفل اليمين" }).click();
  await done;
  expect((await storedLayer("l_photo")).image?.focal).toEqual({ x: 1, y: 1 });

  // ── multi-select without a keyboard or a marquee: «تحديد متعدّد» ─────────
  await panel(page).getByRole("tab", { name: "الطبقات" }).click();
  const list = main(page).getByRole("tabpanel");
  await list.getByRole("button", { name: "تحديد متعدّد" }).click();
  await expect(list.getByRole("button", { name: "تحديد متعدّد" })).toHaveAttribute("aria-pressed", "true");
  for (const name of ["نوع الجلسة", "المكان", "الصورة"]) {
    await list.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  }
  await expect(list.getByText("3 طبقات محدّدة")).toBeVisible();

  // ── group align and distribute ─────────────────────────────────────────────
  await panel(page).getByRole("tab", { name: "الخصائص" }).click();
  const group = inspector(page);
  done = saved(page);
  await group.getByRole("group", { name: "أفقيًا" }).getByRole("button", { name: "البداية" }).click();
  await done;
  const xs = await Promise.all(["l_kicker", "l_where", "l_photo"].map(async (id) => (await storedLayer(id)).frame.x));
  expect(new Set(xs).size).toBe(1);
  done = saved(page);
  await group.getByRole("button", { name: "وزّع رأسيًا" }).click();
  await done;
  const ys = (await Promise.all(["l_kicker", "l_where", "l_photo"].map((id) => storedLayer(id)))).map((l) => ({ y: l.frame.y, h: l.frame.h })).sort((a, b) => a.y - b.y);
  const gaps = [ys[1]!.y - (ys[0]!.y + ys[0]!.h), ys[2]!.y - (ys[1]!.y + ys[1]!.h)];
  expect(Math.abs(gaps[0]! - gaps[1]!)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/wave13-designer-studio-group.png`, fullPage: true });

  // Leave multi-select.
  await panel(page).getByRole("tab", { name: "الطبقات" }).click();
  await list.getByRole("button", { name: "تحديد متعدّد" }).click();

  // ── D1b: add a text, write it, colour it, duplicate it, delete it ─────────
  const count = (await stored()).length;
  done = saved(page);
  await list.getByRole("button", { name: "نص", exact: true }).click();
  await done;
  const layers = await stored();
  expect(layers).toHaveLength(count + 1);
  const added = layers[layers.length - 1]!;
  expect(added.text?.literal).toBe("نص جديد");
  expect(added.color).toBe("{{brand.fgHeading}}");

  done = saved(page);
  await inspector(page).getByLabel("النص", { exact: true }).fill("ملتقى المعرفة");
  await done;
  expect((await storedLayer(added.id)).text?.literal).toBe("ملتقى المعرفة");

  done = saved(page);
  await inspector(page).getByLabel("لون النص", { exact: true }).selectOption("fgMuted");
  await done;
  expect((await storedLayer(added.id)).color).toBe("{{brand.fgMuted}}");

  done = saved(page);
  await inspector(page).getByRole("button", { name: "كرّر الطبقة" }).click();
  await done;
  expect(await stored()).toHaveLength(count + 2);

  await inspector(page).getByRole("button", { name: "احذف الطبقة" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("ملتقى المعرفة");
  done = saved(page);
  await dialog.getByRole("button", { name: "احذف" }).click();
  await done;
  expect(await stored()).toHaveLength(count + 1);
  await page.screenshot({ path: `${SHOTS}/wave13-designer-studio-taps.png`, fullPage: true });

  // And the numbers are still there, demoted, never deleted (DEC-093).
  await selectInList(page, "المكان");
  await expect(inspector(page).getByRole("button", { name: "الموضع والحجم" })).toHaveAttribute("aria-expanded", "false");
});
