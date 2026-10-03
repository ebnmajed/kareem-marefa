// ★★ THE SC 2.5.7 GATE FOR THE EMAIL BUILDER — REQ-UIX-112, REQ-NTF-015, DEC-093, DEC-238 §4.
//
// `AdminEmailAdd.dc.html` draws three drags: a block from the library into the email («سحب إلى المسودة», the dashed
// «أفلت هنا»), a layout from the library, and the row handle bar's ⋮⋮. Each has a path that is NOT a drag, and this
// spec performs every one with `click()`, `fill()` and `selectOption()` alone, then reads the stored document:
//
//   · a block    → a tap on «رمز QR» arms it; a tap on the slot «أضف في آخر البريد» places it;
//   · a layout   → a tap on «عمودان، الثاني أعرض»; a tap on a slot; then a block tapped into EACH column;
//   · reorder    → ▲ «انقل لأعلى» on the handle bar moves a row one step;
//   · a long move → «انقل» arms a block; a tap on another column's slot puts it there;
//   · and ⧉ duplicate, 🗑 delete, and «احفظ وفعّل».
//
// ★ No pointer-drag API, no mouse and no keyboard in this file — `tests/unit/notify-builder-taps-guard.test.ts` fails
// the build if one appears.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1440, height: 1000 };
const KEY = "MSG-reminder_1d";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `mailtaps23-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة البريد', $1, 'MB', gen_random_uuid(), $2) returning id`,
    [`mailtaps23-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة البريد" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
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

/** ★ DEC-145: page content under `/app` is found inside `#main`. */
const main = (page: Page) => page.locator("#main");
/** A canvas target — the select button the overlay lays over a row or a block. */
const target = (page: Page, label: string) => main(page).locator("[data-canvas-target] > button").and(page.getByRole("button", { name: label, exact: true }));
/** The handle bar shown for the selected target. */
const bar = (page: Page) => main(page).locator("[data-handle-bar]").filter({ visible: true });
const slot = (page: Page, name: string) => main(page).locator("[data-canvas-slot]").and(page.getByRole("button", { name, exact: true }));

type Stored = { blocks: Array<{ id: string; type: string }>; rows?: Array<{ id: string; layout: string; columns: string[][] }> };
async function stored(): Promise<Stored | null> {
  const { rows } = await db.query<{ blocks: Stored | null }>(`select blocks from public.notification_templates where org_id = $1 and key = $2`, [orgId, KEY]);
  return rows[0]?.blocks ?? null;
}

test("★ SC 2.5.7 — every drag the builder draws has a tap, and the saved document is what the taps made", async ({ context, page }) => {
  test.skip(test.info().project.name === "phone", "the builder's canvas is a desktop tool; the gallery is checked at 390");
  test.slow();
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/emails/${KEY}`);
  await expect(main(page).getByRole("heading", { level: 1, name: "تذكير قبل الجلسة بيوم" })).toBeVisible();
  // The frame has loaded and been measured: the platform design's rows are targets.
  await expect(main(page).locator("[data-canvas-target]").first()).toBeVisible();
  const rowsBefore = await main(page).locator('[data-canvas-target="row"]').count();

  // ── a BLOCK: tap the tile, tap the slot ───────────────────────────────────────────────────────
  await main(page).getByRole("button", { name: "رمز QR", exact: true }).click();
  await expect(main(page).getByRole("button", { name: "رمز QR", exact: true })).toHaveAttribute("aria-pressed", "true");
  await slot(page, "أضف في آخر البريد").click();
  await expect(target(page, "رمز QR: امسح للفتح")).toBeVisible();
  await expect(main(page).locator('[data-canvas-target="row"]')).toHaveCount(rowsBefore + 1);
  // Placed and selected: الكتلة is open on it. Its alt is mandatory — filled, then committed by leaving the field.
  await main(page).getByLabel("النص البديل").fill("رمز صفحة الجلسة");
  await main(page).getByLabel("النص تحت الرمز").click();

  // ── a LAYOUT: tap the tile, tap the slot, then a block into EACH column ───────────────────────
  await main(page).getByRole("tab", { name: "إضافة", exact: true }).click();
  await main(page).getByRole("button", { name: "عمودان، الثاني أعرض", exact: true }).first().click();
  await slot(page, "أضف في آخر البريد").click();
  await expect(target(page, "تخطيط 1/2")).toBeVisible();
  await main(page).getByRole("tab", { name: "إضافة", exact: true }).click();
  await main(page).getByRole("button", { name: "نص", exact: true }).click();
  await slot(page, "أضف في العمود 1 من «تخطيط 1/2»").click();
  await expect(target(page, "فقرة")).toBeVisible();
  await main(page).getByRole("tab", { name: "إضافة", exact: true }).click();
  await main(page).getByRole("button", { name: "زر", exact: true }).click();
  await slot(page, "أضف في العمود 2 من «تخطيط 1/2»").click();
  await expect(target(page, "زر")).toBeVisible();
  // The button's link is a binding NAME, chosen from what the message offers — never typed (REQ-NTF-012).
  await main(page).getByLabel("الرابط").selectOption("url");

  // ── REORDER: ▲ on the layout row's handle bar moves it above the QR ───────────────────────────
  await target(page, "تخطيط 1/2").click();
  await bar(page).getByRole("button", { name: "انقل لأعلى", exact: true }).click();

  // ── a LONG MOVE: «انقل» the paragraph, then tap the other column's first slot ─────────────────
  await target(page, "فقرة").click();
  await bar(page).getByRole("button", { name: "انقل", exact: true }).click();
  await slot(page, "أضف في العمود 2 من «تخطيط 1/2»").first().click();

  // ── DUPLICATE, then DELETE the copy ───────────────────────────────────────────────────────────
  await target(page, "رمز QR: امسح للفتح").click();
  await bar(page).getByRole("button", { name: "كرّر", exact: true }).click();
  await expect(target(page, "رمز QR: امسح للفتح")).toHaveCount(2);
  await bar(page).getByRole("button", { name: "احذف", exact: true }).click();
  await expect(target(page, "رمز QR: امسح للفتح")).toHaveCount(1);

  // ── SAVE: the stored document is what the taps made ───────────────────────────────────────────
  await main(page).getByRole("button", { name: "احفظ وفعّل", exact: true }).click();
  await expect(main(page).getByRole("status").filter({ hasText: /^محفوظ · / })).toBeVisible();
  const document = await stored();
  expect(document).not.toBeNull();
  const qr = document!.blocks.find((b) => b.type === "qr")!;
  const paragraph = document!.blocks.filter((b) => b.type === "paragraph").at(-1)!;
  const button = document!.blocks.filter((b) => b.type === "button").at(-1)!;
  expect(document!.blocks.filter((b) => b.type === "qr")).toHaveLength(1);
  const rows = document!.rows!;
  const layout = rows.find((r) => r.layout === "1/2")!;
  expect(layout.columns).toEqual([[], [paragraph.id, button.id]]);
  // ▲ put the layout row before the QR's row.
  expect(rows.indexOf(layout)).toBeLessThan(rows.findIndex((r) => r.columns[0]?.[0] === qr.id));
});
