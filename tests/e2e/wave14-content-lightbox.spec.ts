// ★ REQ-EVT-016 — the SC 2.5.7 gate (DEC-093's sixth place, DEC-182) — and
// REQ-ADM-021's per-photograph download, against REAL local Supabase.
//
// The lightbox is driven with `.click()` ALONE: no `mouse.down`, `mouse.move`,
// `mouse.up`, no swipe, no key. A single pointer, without dragging, opens a
// photograph, moves forward through every visible one and back, and closes it,
// and each move is proven by the photograph ON SCREEN changing (its
// `data-photo-id`), not by a counter. axe cannot see this; this can.
//
// Seeded through SQL — rows and their objects — never through the worker; the
// strip has its own contract and its own spec (`wave9-content-photo-worker`).
// One of the four photographs is hidden: it never enters the sequence.
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { drawPhotos } from "../unit/photos-fixtures";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let memberEmail = "";
let modEmail = "";
const userIds: string[] = [];
/** Visible photographs, in the order the page shows them (newest first, `photos.ts`). */
let visible: string[] = [];
let hiddenId = "";

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({ browser }, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `lightbox-e2e-${tag}.example`;
  memberEmail = `member@${domain}`;
  modEmail = `moderator@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المعرض', $1, 'LB', gen_random_uuid()) returning id`,
    [`lightbox-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة المعرض', 'ملخص', $2, 'introductory', now() - interval '1 hour', 60, now() + interval '10 minutes', $3, 30, 'in_progress', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const memberId = await provisionMemberId(memberEmail);
  // DEC-266: staff alone download a photograph — a moderator, promoted before they sign in, so the token carries it.
  const mod = await admin.auth.admin.createUser({ email: modEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف" } });
  if (mod.error) throw mod.error;
  userIds.push(mod.data.user.id);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [await provisionMemberId(modEmail)]);

  // Four real photographs a minute apart, landscape and portrait alternating (so the captures show
  // the lightbox's letterbox on both axes and the tile's crop); the second newest is hidden. The page
  // lists newest first.
  const drawer = await browser.newPage();
  const drawn = await drawPhotos(drawer, 4);
  await drawer.close();
  const ids: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const id = randomUUID();
    const path = `${orgId}/sessions/${sessionId}/photos/${id}.jpg`;
    const { bytes, width, height } = drawn[i];
    await uploadObject("photos", path, bytes, "image/jpeg");
    await db.query(
      `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, created_at, hidden_at)
       values ($1, $2, $3, $4, $5, $10, $11, $6, $7, true, now() - ($8 || ' minutes')::interval, $9)`,
      [id, orgId, sessionId, memberId, path, bytes.byteLength, createHash("sha256").update(bytes).digest("hex"), String(10 - i), i === 2 ? new Date() : null, width, height],
    );
    ids.push(id);
  }
  hiddenId = ids[2];
  visible = [ids[3], ids[1], ids[0]];
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ Staff open the page in edit mode (`?edit=1`): their downloads are behind «تعديل» (the owner's ruling,
// `sessions/edit-mode.tsx`); a member's page ignores the flag.
async function openEventPage(page: Page, edit = false) {
  await page.goto(`/ar/app/sessions/${sessionId}${edit ? "?edit=1" : ""}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const onScreen = (page: Page) => page.getByRole("dialog").locator("img[data-photo-id]").getAttribute("data-photo-id");

test("★ SC 2.5.7: every visible photograph, forward and back, and closed — with clicks alone", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await openEventPage(page);

  const main = page.locator("#main");
  // Three tiles open the lightbox; the hidden photograph is not in this member's grid at all.
  await expect(main.getByRole("button", { name: /^افتح الصورة \d+ من 3$/ })).toHaveCount(3);
  const first = main.getByRole("button", { name: "افتح الصورة 1 من 3", exact: true });
  await first.click();

  const dialog = page.getByRole("dialog", { name: "صور الجلسة" });
  await expect(dialog).toBeVisible();
  const next = dialog.getByRole("button", { name: "الصورة التالية", exact: true });
  const previous = dialog.getByRole("button", { name: "الصورة السابقة", exact: true });

  // SC 2.5.8 at 390 px: both targets at least 24 × 24 (they are 44).
  for (const target of [next, previous]) {
    const box = await target.boundingBox();
    expect(box && box.width >= 24 && box.height >= 24).toBe(true);
  }

  const seen = [await onScreen(page)];
  await expect(dialog).toContainText("1 من 3");
  for (let i = 2; i <= visible.length; i += 1) {
    const before = await onScreen(page);
    await next.click();
    await expect.poll(() => onScreen(page)).not.toBe(before);
    await expect(dialog).toContainText(`${i} من 3`);
    seen.push(await onScreen(page));
    if (i === 2) await page.screenshot({ path: join(SHOTS, "wave14-content-lightbox-open.png") });
  }
  expect(seen).toEqual(visible);
  expect(seen).not.toContain(hiddenId);
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.screenshot({ path: join(SHOTS, "wave14-content-lightbox-last.png") });

  for (let i = visible.length - 1; i >= 1; i -= 1) {
    const before = await onScreen(page);
    await previous.click();
    await expect.poll(() => onScreen(page)).not.toBe(before);
    await expect(dialog).toContainText(`${i} من 3`);
  }
  expect(await onScreen(page)).toBe(visible[0]);

  // Closed with a click, and focus is back on the tile that opened it.
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();

  // The photograph is shown whole: its box never exceeds the viewport, and nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Escape closes it too, focus returns to the opening tile, and the letterbox is the backdrop", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await openEventPage(page);
  const main = page.locator("#main");

  const second = main.getByRole("button", { name: "افتح الصورة 2 من 3", exact: true });
  await second.click();
  const dialog = page.getByRole("dialog", { name: "صور الجلسة" });
  await dialog.getByRole("button", { name: "الصورة التالية", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(second).toBeFocused();

  await second.click();
  await expect(dialog).toBeVisible();
  // A point in the stage's corner — the letterbox beside a portrait photograph, not the image.
  await dialog.getByTestId("lightbox-stage").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
});

test("★ DEC-266: a member sees the photograph and is offered no download; the route refuses them and audits nothing", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await openEventPage(page);

  await page.locator("#main").getByRole("button", { name: "افتح الصورة 1 من 3", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: "تنزيل الصورة", exact: true })).toHaveCount(0);

  const res = await page.request.get(`/api/photos/${visible[0]}/download`, { maxRedirects: 0, headers: { referer: page.url() } });
  expect(res.status()).toBe(303);
  expect(new URL(res.headers()["location"]).searchParams.get("download")).toBe("photo_failed");
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.audit_log where action = 'photo.downloaded' and subject_id = $1`,
    [visible[0]],
  );
  expect(rows[0].n).toBe(0);
});

test("★ REQ-ADM-021: staff's lightbox offers a route, which audits and 303s to a short-lived signed URL; a hidden photo's route bounces back", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, modEmail);
  await openEventPage(page, true);

  await page.locator("#main").getByRole("button", { name: "افتح الصورة 1 من 3", exact: true }).click();
  const link = page.getByRole("dialog").getByRole("link", { name: "تنزيل الصورة", exact: true });
  const href = await link.getAttribute("href");
  expect(href).toBe(`/api/photos/${visible[0]}/download`);
  expect(await link.getAttribute("download")).toBeNull();

  const referer = page.url();
  const res = await page.request.get(href!, { maxRedirects: 0, headers: { referer } });
  expect(res.status()).toBe(303);
  const location = res.headers()["location"];
  expect(location).toContain("/storage/v1/object/sign/photos/");
  expect(location).toContain("download=");
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.audit_log where action = 'photo.downloaded' and subject_id = $1`,
    [visible[0]],
  );
  expect(rows[0].n).toBe(1);

  const refused = await page.request.get(`/api/photos/${hiddenId}/download`, { maxRedirects: 0, headers: { referer } });
  expect(refused.status()).toBe(303);
  const back = new URL(refused.headers()["location"]);
  expect(back.searchParams.get("download")).toBe("photo_failed");
  expect(back.hash).toBe("#photos");

  await page.goto(back.toString());
  await expect(page.locator("#main").getByRole("alert").filter({ hasText: "تعذّر تنزيل الصورة." })).toBeVisible();
});
