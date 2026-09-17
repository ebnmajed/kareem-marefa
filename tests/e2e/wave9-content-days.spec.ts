// T2's own captures (docs/plan/notes/content.md, "Wave 9 plan" §11; agent brief, Definition of
// Done) — the grouped materials/tasks/photos slots on a real, real-Supabase three-day session,
// against real local Supabase. Days are seeded directly (session insert + two more session_days
// rows, exactly `tests/rls/session-days.test.ts`'s own `addDay()` shape) rather than through
// `schedule_session()` — every other e2e spec in this track (`materials.spec.ts`, `photos.spec.ts`)
// seeds its session state directly for the same reason: this proves the READ side (grouping, the
// chip, the day-scoped phase gate) against a database in the exact shape `sessions'` own RPC would
// leave it, not the form that produces it.
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as `wave9-content-<state>.png`, phone
// project, 390×844 — this file's own header names itself as the spec that regenerates each one, per
// STATUS.md's row-evidence rule. The comparison baseline for "a one-day session is unchanged" is
// NOT re-captured here: `materials-event-page-390-rtl-phone.png` / `tasks-event-page-…` /
// `photos-event-page-…` already exist from wave 6/7's own specs, proven byte-identical this wave by
// `materials/tasks/photos-schema.test.ts` and `list/panel/gallery.test.tsx` passing unmodified.
import { randomUUID } from "node:crypto";
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
const PHONE = { width: 390, height: 844 };
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let day1Id = "";
let day2Id = "";
let presenterEmail = "";
let memberEmail = "";
const userIds: string[] = [];

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

/** A day written the way a day-aware RPC writes one — `tests/rls/session-days.test.ts`'s own
 *  `addDay()`, against real Postgres rather than a rolled-back transaction. */
async function addDay(orgIdArg: string, sessionIdArg: string, venueIdArg: string, fromH: number, toH: number): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
     values ($1, $2, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5) returning id`,
    [orgIdArg, sessionIdArg, String(fromH), String(toH), venueIdArg],
  );
  return rows[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `content-days-e2e-${tag}.example`;
  presenterEmail = `presenter@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة ورشة الأيام', $1, 'WD', gen_random_uuid()) returning id`,
    [`content-days-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);
  const venueId = venueRows[0].id;

  // Day 1: yesterday, already ended. Day 2 (added below): begins in 2 hours, ends in 4 — not yet
  // ended, for the before/after «بعد» capture. Day 3: three days out, and deliberately empty.
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'ورشة تصميم الخدمات — ثلاثة أيام', 'ملخص الورشة', $2, 'introductory', now() - interval '26 hours', 120, now() - interval '24 hours',
             $3, 30, 'in_progress', now() - interval '3 days')
     returning id`,
    [orgId, catRows[0].id, venueId],
  );
  sessionId = sessRows[0].id;
  const { rows: day1Rows } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  day1Id = day1Rows[0].id;
  day2Id = await addDay(orgId, sessionId, venueId, 2, 4);
  await addDay(orgId, sessionId, venueId, 74, 76); // day 3 — deliberately empty

  const { data, error } = await admin.auth.admin.createUser({ email: presenterEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "المقدّمة" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const { data: memberData, error: memberError } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو" } });
  if (memberError) throw memberError;
  userIds.push(memberData.user.id);

  const presenterMemberId = await provisionMemberId(presenterEmail);
  const memberMemberId = await provisionMemberId(memberEmail);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterMemberId]);
  // ★ The tasks affordance withholds `tasks` from an UNregistered viewer at every phase but
  // `live`/`ended` (`session-matrix.ts` §5.3 row 1, DEC-090 — pre-existing, unrelated to days):
  // `open.none` has no `tasks: true` at all. The plain member needs a real seat to see the tasks
  // section — the gap this file's first run against a real build found (materials/photos have no
  // such gate; only tasks does), not a multi-day defect.
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, memberMemberId]);

  // Materials: one session-scoped, one on day 1 (already released — day ended), one on day 2
  // («بعد», day 2 not yet ended — the before/after capture's own subject). `external_link` kind's
  // own CHECK requires `external_url` (0037) — every row here carries one. The session-scoped
  // material is «قبل» — the session itself is `in_progress`, not `completed`, and stays that way
  // on purpose (day 2's own test needs the session NOT already released everything early).
  for (const [title, dayId, url, phase] of [
    ["الخطة الدراسية الكاملة", null, "https://example.com/plan", "before"],
    ["شرائح اليوم الأول", day1Id, "https://example.com/day1", "after"],
    // «قبل» — always visible, independent of the day-scoped-after test's own timing below, so
    // day 2's group is never empty for a member regardless of test order in this serial file.
    ["قراءة تحضيرية لليوم الثاني", day2Id, "https://example.com/day2-pre", "before"],
  ] as const) {
    await db.query(
      `insert into public.materials (org_id, session_id, session_day_id, kind, title, phase, external_url, render_status, added_by)
       values ($1, $2, $3, 'external_link', $4, $5, $6, 'not_applicable', $7)`,
      [orgId, sessionId, dayId, title, phase, url, presenterMemberId],
    );
  }
  await db.query(
    `insert into public.materials (org_id, session_id, session_day_id, kind, title, phase, external_url, render_status, added_by)
     values ($1, $2, $3, 'external_link', 'تسجيل اليوم الثاني', 'after', 'https://example.com/day2', 'not_applicable', $4)`,
    [orgId, sessionId, day2Id, presenterMemberId],
  );

  // Tasks: session-scoped and day 1.
  await db.query(`insert into public.session_tasks (org_id, session_id, session_day_id, kind, title) values ($1, $2, null, 'checklist', 'أحضر جهازك المحمول')`, [orgId, sessionId]);
  await db.query(`insert into public.session_tasks (org_id, session_id, session_day_id, kind, title) values ($1, $2, $3, 'checklist', 'اقرأ الملف قبل اليوم الأول')`, [orgId, sessionId, day1Id]);

  // Photos: session-scoped and day 1 — seeded directly (T4 already proves the real worker path).
  for (const dayId of [null, day1Id]) {
    const photoId = randomUUID();
    const photoPath = `${orgId}/sessions/${sessionId}/photos/${photoId}.jpg`;
    await uploadObject("photos", photoPath, TINY_JPEG, "image/jpeg");
    await db.query(
      `insert into public.photos (id, org_id, session_id, session_day_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [photoId, orgId, sessionId, dayId, presenterMemberId, photoPath, TINY_JPEG.byteLength, "c".repeat(64)],
    );
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// See photos.spec.ts's identical helper for the full reasoning.
async function waitForStreamsToSettle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function goToEvent(context: BrowserContext, page: Page, email: string) {
  await page.setViewportSize(PHONE);
  await signIn(context, email);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await waitForStreamsToSettle(page);
}

// ★ Materials, tasks and photos are ALL grouped on this session (each reads the same `days`), so
// every one of them has its OWN «للورشة كاملة»/«اليوم الأول» heading on the SAME page — an
// unscoped `page.getByRole("heading", …)` resolves to three elements and Playwright's strict mode
// refuses it. Every locator below is scoped to its own slot's `id` (`list.tsx`/`panel.tsx`/
// `gallery.tsx`'s own header comments: `id="materials"`/`"tasks"`/`"photos"`, the page's own
// landmark, per the slot contract).

test("wave9-content-materials-member-grouped: a plain member sees the session's own content first, then each day with content, in order", async ({ context, page }) => {
  await goToEvent(context, page, memberEmail);
  const materials = page.locator("#materials");
  await expect(page.getByRole("heading", { name: "المواد", exact: true, level: 2 })).toBeVisible();
  await expect(materials.getByRole("heading", { name: "للورشة كاملة", level: 3 })).toBeVisible();
  await expect(materials.getByRole("heading", { name: /اليوم الأول/, level: 3 })).toBeVisible();
  await expect(materials.getByRole("heading", { name: /اليوم الثاني/, level: 3 })).toBeVisible();
  // Day 3 has no content, and this viewer cannot manage — its heading is not rendered.
  await expect(materials.getByRole("heading", { name: /اليوم الثالث/, level: 3 })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/wave9-content-materials-member-grouped.png`, fullPage: true });
});

test("wave9-content-materials-presenter-grouped: the presenter sees every group, including the empty third day, each with its own «أضف مادة»", async ({ context, page }) => {
  await goToEvent(context, page, presenterEmail);
  const materials = page.locator("#materials");
  await expect(page.getByRole("heading", { name: "المواد", exact: true, level: 2 })).toBeVisible();
  await expect(materials.getByRole("heading", { name: /اليوم الثالث/, level: 3 })).toBeVisible();
  await expect(materials.getByRole("link", { name: /^أضف مادة/ })).toHaveCount(4); // session + three days
  await page.screenshot({ path: `${SHOTS}/wave9-content-materials-presenter-grouped.png`, fullPage: true });
});

test("wave9-content-materials-scope-chip-open: the presenter opens a material's scope chip", async ({ context, page }) => {
  await goToEvent(context, page, presenterEmail);
  const chip = page.locator("#materials details").filter({ hasText: "اليوم الأول" }).first();
  await chip.locator("summary").click();
  await expect(chip.getByRole("button")).toHaveCount(4); // session + three days
  await page.screenshot({ path: `${SHOTS}/wave9-content-materials-scope-chip-open.png`, fullPage: true });
});

test("wave9-content-materials-day-scoped-after-{hidden,visible}: day 2's «بعد» material follows ITS OWN day, not the session", async ({ context, page }) => {
  await goToEvent(context, page, memberEmail);
  const materials = page.locator("#materials");

  // ★ The lead's real-build finding: `toHaveCount(0)` alone never PROVES the section rendered —
  // it also passes vacuously while the section is still a Suspense skeleton (nothing has
  // rendered, so the count of anything is trivially 0), and `waitForStreamsToSettle()` only
  // clears the OTHER streaming artefact (a hidden duplicate copy left behind once revealed), not
  // "has this slot's own data arrived yet" at all. Positive waits first, on an item that is
  // ALWAYS visible regardless of day 2's own state (the whole-workshop «قبل» material, seeded
  // above) — only once that is on screen has the section genuinely settled, and only then does
  // `تسجيل اليوم الثاني`'s own absence mean "correctly withheld" rather than "not loaded yet".
  await expect(page.getByRole("heading", { name: "المواد", exact: true, level: 2 })).toBeVisible();
  await expect(materials.getByText("الخطة الدراسية الكاملة")).toBeVisible();
  await expect(materials.getByText("تسجيل اليوم الثاني")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/wave9-content-materials-day-scoped-after-hidden.png`, fullPage: true });

  // Both ends move — `starts_at` was `now() + 2h`; leaving it there while only `ends_at` moves into
  // the past would violate `check (ends_at > starts_at)`. Clear of day1 (-26h..-24h) and day3
  // (+74h..+76h) alike.
  await db.query(`update public.session_days set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 minute' where id = $1`, [day2Id]);
  await page.reload();
  await waitForStreamsToSettle(page);
  await expect(page.getByRole("heading", { name: "المواد", exact: true, level: 2 })).toBeVisible();
  await expect(materials.getByText("الخطة الدراسية الكاملة")).toBeVisible();
  await expect(materials.getByText("تسجيل اليوم الثاني")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave9-content-materials-day-scoped-after-visible.png`, fullPage: true });
});

test("wave9-content-tasks-grouped: the tasks section groups the same way", async ({ context, page }) => {
  await goToEvent(context, page, memberEmail);
  const tasks = page.locator("#tasks");
  await expect(page.getByRole("heading", { name: "مهام ما قبل الجلسة", exact: true, level: 2 })).toBeVisible();
  await expect(tasks.getByRole("heading", { name: "للورشة كاملة", level: 3 })).toBeVisible();
  await expect(tasks.getByRole("heading", { name: /اليوم الأول/, level: 3 })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave9-content-tasks-grouped.png`, fullPage: true });
});

test("wave9-content-photos-grouped: the gallery groups the same way, display-only, no per-group add control", async ({ context, page }) => {
  await goToEvent(context, page, memberEmail);
  const photos = page.locator("#photos");
  await expect(page.getByRole("heading", { name: "الصور", exact: true, level: 2 })).toBeVisible();
  await expect(photos.getByRole("heading", { name: "للورشة كاملة", level: 3 })).toBeVisible();
  await expect(photos.getByRole("heading", { name: /اليوم الأول/, level: 3 })).toBeVisible();
  // Photos never ask — no «أضف» anywhere in this section, grouped or not.
  await expect(photos.getByRole("link", { name: /^أضف/ })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/wave9-content-photos-grouped.png`, fullPage: true });
});
