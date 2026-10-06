// ★ SCR-012's four slots, rebuilt (REQ-UIX-061, STORY-UIX-048, DEC-208, DEC-209) — materials with the audio row,
// photos with the add tile and the takedown in the lightbox, the discussion with the company and «مقدِّم الجلسة»,
// and the tasks as checkboxes — against real local Supabase, with the captures the lead holds beside
// `Event.dc.html`, `EventLive.dc.html`, `EventDone.dc.html` (390) and `EventDesktop.dc.html` (1280).
//
// Seeded through SQL: an open session with a task, a live one with a photograph and a presenter's comment, and an
// ended one with a PDF and an audio recording. Every page-level locator comes from `#main` (DEC-145); captures are
// taken after the streams settle.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 1040 };
// A 1 × 1 PNG. The browser sniffs the bytes, so it draws under a `.jpg` path as the seeded photo row names it.
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
const ids = { open: "", live: "", done: "" };
const emails = { member: "", presenter: "" };
const userIds: string[] = [];

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

async function provision(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  const { data: row, error: e3 } = await client.rpc("provision_member");
  if (e3) throw e3;
  return (row as { member_id: string }).member_id;
}

async function session(title: string, offset: string, minutes: number, state: string, category: string, venue: string, presenter: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'نبذة', $3, 'introductory', now() + $4::interval, $5::int, now() + $4::interval + make_interval(mins => $5::int), $6, 40, $7::public.session_state, now() - interval '3 days')
     returning id`,
    [orgId, title, category, offset, minutes, venue, state],
  );
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, rows[0].id, presenter]);
  return rows[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `slots-e2e-${tag}.example`;
  emails.member = `member@${domain}`;
  emails.presenter = `presenter@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الساحة', $1, 'SL', gen_random_uuid()) returning id`, [`slots-e2e-${tag}`]);
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: co } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);

  const presenterId = await provision(emails.presenter, "سارة القحطاني");
  const memberId = await provision(emails.member, "ريم الشمري");
  await db.query(`update public.members set company_id = $1 where id = any($2::uuid[])`, [co[0].id, [presenterId, memberId]]);

  ids.open = await session("لوحة تحكم لا يهجرها أحد", "2 days", 90, "published", cat[0].id, venue[0].id, presenterId);
  ids.live = await session("العرض في 5 شرائح", "-30 minutes", 90, "in_progress", cat[0].id, venue[0].id, presenterId);
  ids.done = await session("الأرقام التي تكذب", "-5 hours", 120, "completed", cat[0].id, venue[0].id, presenterId);

  // Open: one checklist task — shown to a member who holds a seat (the affordance matrix, §5.3 row 1: tasks are
  // withheld until a reservation), so the member reserves.
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.open, memberId]);
  await db.query(`insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'أحضر جهازك المحمول')`, [orgId, ids.open]);

  // Live: the member checked in; one photograph of theirs; the presenter's comment.
  const { rows: code } = await db.query<{ id: string }>(
    `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until) values ($1, $2, 'ACDEFG', now() - interval '1 minute', now() + interval '10 minutes') returning id`,
    [orgId, ids.live],
  );
  await db.query(`insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`, [orgId, ids.live, memberId, code[0].id]);
  const photoId = randomUUID();
  const photoPath = `${orgId}/sessions/${ids.live}/photos/${photoId}.jpg`;
  await uploadObject("photos", photoPath, TINY_PNG, "image/jpeg");
  await db.query(
    `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped) values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [photoId, orgId, ids.live, memberId, photoPath, TINY_PNG.byteLength, "c".repeat(64)],
  );
  await db.query(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'يكفي أي جدول. سنعمل على Sheets في القاعة.')`, [orgId, ids.live, presenterId]);

  // Ended: a rendered PDF and an audio recording a member may fetch (download on).
  for (const [kind, title, mime, file] of [
    ["pdf", "الشرائح", "application/pdf", "deck.pdf"],
    ["audio", "التسجيل الصوتي", "audio/mpeg", "talk.mp3"],
  ] as const) {
    const { rows: m } = await db.query<{ id: string }>(
      `insert into public.materials (org_id, session_id, kind, title, phase, render_status, allow_download, added_by) values ($1, $2, $3, $4, 'after', 'ready', true, $5) returning id`,
      [orgId, ids.done, kind, title, presenterId],
    );
    const versionId = randomUUID();
    const path = `${orgId}/sessions/${ids.done}/materials/${versionId}/${file}`;
    await uploadObject("materials", path, TINY_PNG, mime);
    await db.query(
      `insert into public.material_versions (id, org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by) values ($1, $2, $3, 1, $4, $5, $6, $7, $8)`,
      [versionId, orgId, m[0].id, path, TINY_PNG.byteLength, mime, "d".repeat(64), presenterId],
    );
    await db.query(`update public.materials set current_version_id = $1 where id = $2`, [versionId, m[0].id]);
  }
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, id: string) {
  await page.goto(`/ar/app/sessions/${id}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

const shot = (page: Page, state: string, width: 390 | 1280) => page.screenshot({ path: join(SHOTS, `wave18-content-event-slots-${state}-${width}.png`), fullPage: true });

/** The slot contract: a section holds the page's ONE `<h2>`, and the slot adds none of its own. */
async function oneHeading(page: Page, sectionId: string) {
  await expect(page.locator(`#main section#${sectionId} h2`)).toHaveCount(1);
}

test("★ open: the task is a checkbox, the discussion's composer keeps a visible «نشر» — 390", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, ids.open);
  const main = page.locator("#main");
  const box = main.getByRole("checkbox", { name: /أحضر جهازك المحمول/ });
  await expect(box).toBeVisible();
  await box.check();
  await expect(box).toBeChecked();
  await expect(main.getByRole("textbox", { name: "اكتب تعليقًا…" })).toBeVisible();
  await expect(main.getByRole("button", { name: "نشر" })).toBeVisible();
  await oneHeading(page, "tasks");
  await oneHeading(page, "discussion");
  await shot(page, "open", 390);
});

test("★ live: the add tile first in the grid, the takedown in the lightbox, the presenter's company and role — 390", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, ids.live);
  const main = page.locator("#main");
  const grid = main.locator("section#photos ul").first();
  await expect(grid.locator("li").first().getByLabel("إضافة صورة")).toBeAttached();
  await expect(main.getByText(/ستظهر هذه الصور لجميع أعضاء المؤسسة/)).toBeVisible();

  const discussion = main.locator("section#discussion");
  await expect(discussion.getByText("مقدِّم الجلسة", { exact: false })).toBeVisible();
  await expect(discussion.getByText("مواهب")).toBeVisible();
  await oneHeading(page, "photos");
  await shot(page, "live", 390);

  await grid.getByRole("button", { name: /^افتح الصورة 1 من / }).click();
  const dialog = page.getByRole("dialog", { name: "صور الجلسة" });
  await expect(dialog.getByRole("button", { name: "احذف الصور التي أظهر فيها" })).toBeVisible();
  // DEC-266: a member sees the photograph and is offered no download.
  await expect(dialog.getByRole("link", { name: "تنزيل الصورة" })).toHaveCount(0);
  await shot(page, "live-lightbox", 390);
});

test("★ ended: a PDF row is one link to the viewer; the audio row plays in the page (REQ-MAT-007) — 390 and 1280", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, ids.done);
  const materials = page.locator("#main section#materials");
  await expect(materials.getByRole("link", { name: /الشرائح/ })).toHaveAttribute("href", /\/materials\//);
  const play = materials.getByRole("button", { name: "تشغيل التسجيل الصوتي" });
  await expect(play).toBeVisible();
  await expect(materials.getByRole("slider", { name: "موضع التشغيل" })).toBeAttached();
  await expect(materials.locator("audio")).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/materials\//);
  await oneHeading(page, "materials");
  await shot(page, "done", 390);

  await page.setViewportSize(DESKTOP);
  await open(page, ids.done);
  await shot(page, "done", 1280);
});
