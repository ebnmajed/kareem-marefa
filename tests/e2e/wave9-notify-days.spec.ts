// notify (wave 9) — one calendar entry per DAY, and a reschedule notice that
// names the day (REQ-SES-015, REQ-CAL-001 … 005, REQ-SES-009, DEC-119, DEC-151).
//
// Against REAL local Supabase, like `tests/e2e/notify-screens.spec.ts`: a user
// minted through the Auth admin API, provisioned, signed in with a captured
// cookie jar. Skipped when the local service key is absent.
//
// ★ NEEDS `supabase/proposed/notify/0{1,2,3}_*.sql` PROMOTED — the lead does
// that at a sync point. Before promotion `calendar_events.session_day_id` and
// `session_days_changed()` do not exist and every case here fails on the
// fixture.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave9-notify-calendar-three-days.png · wave9-notify-calendar-one-day.png ·
//   wave9-notify-add-to-calendar.png · wave9-notify-notice-day-2.png ·
//   wave9-notify-mail-day-2.png (only with a real worker — see the last case)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
let workshopId = "";
let oneDayId = "";
const workshopTitle = "ورشة ثلاثة أيام";
const oneDayTitle = "جلسة يوم واحد";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // The `desktop` and `phone` projects share one database and start within
  // milliseconds, so the tag carries the worker index AND a uuid fragment.
  const tag = `${testInfo.workerIndex}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const domain = `notify-days-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'ND', gen_random_uuid()) returning id`,
    [`مؤسسة الأيام ${tag}`, `notify-days-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الابتكار', 40) returning id`,
    [orgId],
  );
  const { rows: venue2 } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, capacity) values ($1, 'قاعة التدريب', 40) returning id`,
    [orgId],
  );

  const publish = async (title: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
         values ($1, $2, 'ملخص الورشة', $3, 'introductory', now() + interval '30 days', 120,
                 now() + interval '30 days' + interval '2 hours', $4, 40,
                 now() + interval '29 days', now() + interval '29 days', 'published', now() - interval '1 day')
         returning id`,
        [orgId, title, cat[0].id, venue[0].id],
      )
    ).rows[0].id;

  workshopId = await publish(workshopTitle);
  oneDayId = await publish(oneDayTitle);

  // `0100`'s shim already made day one from the session's own window; days two
  // and three are inserted directly. `position` is DERIVED, so it is never
  // written (contract 1). Day 3 meets in the other room, which is what makes
  // the calendar entries visibly different from one another.
  for (const [offsetDays, room] of [
    [1, venue[0].id],
    [2, venue2[0].id],
  ] as const) {
    await db.query(
      `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
       values ($1, $2,
               (select starts_at from public.sessions where id = $2) + ($3 || ' days')::interval,
               (select starts_at from public.sessions where id = $2) + ($3 || ' days')::interval + interval '2 hours',
               $4)`,
      [orgId, workshopId, String(offsetDays), room],
    );
  }

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الأيام" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
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
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave9-notify-${name}.png`), fullPage: true });
}

/**
 * ★ AN ELEMENT CAPTURE, and the reason it is not a full page.
 *
 * The first cut of this file took `fullPage` twice on the SAME screen under two
 * names, so `calendar-one-day.png` and `calendar-three-days.png` came out
 * byte-identical — and the one-day card, the whole point of the second one, sat
 * exactly where a full-page capture paints the phone's tab bar. A reviewer
 * could not see the thing the file was named after. An element capture is
 * narrower, never crossed by the bar, and cannot silently be the same image as
 * its neighbour.
 */
async function captureOf(page: Page, locator: ReturnType<Page["locator"]>, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: join(SHOTS, `wave9-notify-${name}.png`) });
}

/** A confirmed seat, and a synced calendar entry for every day of the session.
 *  The Google call itself is the worker's and is stubbed, so the rows stand in
 *  for what `calendar_upsert` writes. */
async function seatAndSync(sessionId: string) {
  await db.query(
    `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at) values ($1, $2, $3, 'confirmed', now())`,
    [orgId, sessionId, memberId],
  );
  await db.query(
    `insert into public.calendar_events (org_id, member_id, session_id, session_day_id, provider_event_id, state, last_synced_at)
     select $1, $2, $3, d.id, 'stub_' || d.position, 'synced', now()
       from public.session_days d where d.session_id = $3`,
    [orgId, memberId, sessionId],
  );
}

test("SCR-025 — a three-day workshop is THREE entries, each naming its own day", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context, memberEmail);

  await db.query(
    `insert into public.calendar_connections (org_id, member_id, access_token_encrypted, refresh_token_encrypted, scope)
     values ($1, $2, 'enc-access', 'enc-refresh', 'https://www.googleapis.com/auth/calendar.events')`,
    [orgId, memberId],
  );
  await seatAndSync(workshopId);
  await seatAndSync(oneDayId);

  await page.goto("/ar/app/me/calendar");
  await expect(page.getByRole("heading", { name: "التقويم", level: 1 })).toBeVisible();

  // One entry per DAY — which is what the member's calendar actually holds.
  const entries = page.getByRole("link", { name: workshopTitle });
  await expect(entries).toHaveCount(3);
  for (const label of ["اليوم الأول", "اليوم الثاني", "اليوم الثالث"]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
  await captureOf(page, page.locator('section[aria-labelledby="synced-heading"] ul'), "calendar-three-days");
});

test("★ SCR-025 — the ONE-day session beside it shows no day concept at all", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app/me/calendar");

  // One entry, one title, and nothing that says «اليوم …» anywhere near it.
  const row = page.locator("li", { hasText: oneDayTitle });
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText("اليوم");
  // The card ALONE, so the claim in the file's name is the thing a reviewer
  // sees — and so it can never again be the same image as its neighbour.
  await captureOf(page, row, "calendar-one-day");
});

test("SCR-012 — the add-to-calendar action on a three-day workshop", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions/${workshopId}`);

  const add = page.getByRole("button", { name: "أضِف إلى تقويمك" }).first();
  await expect(add).toBeVisible();
  await add.click();

  // ★ ONE PAIR PER DAY. Google and Outlook take one date each, so a three-day
  // workshop has three pairs — a flat menu of three items would add day 1 and
  // silently drop the rest, which is what the first capture of this showed.
  for (const day of ["اليوم الأول", "اليوم الثاني", "اليوم الثالث"]) {
    await expect(page.getByRole("menuitem", { name: `${day} · تقويم Google` })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: `${day} · تقويم Outlook` })).toBeVisible();
  }
  // And ONE ICS item at every number of days: the file already carries a
  // VEVENT per day, so splitting it would hand the member three overlapping
  // downloads (REQ-CAL-001).
  await expect(page.getByRole("menuitem", { name: "تقويم Apple" })).toHaveCount(1);
  await capture(page, "add-to-calendar");
});

test("★ REQ-SES-009 — moving DAY 2 tells the member, and the notice names the day", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);

  const snapshot = async () =>
    (
      await db.query<{ days: unknown }>(
        `select coalesce(jsonb_agg(jsonb_build_object(
                  'id', d.id, 'position', d.position, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
                  'venue_label', public.session_venue_label(d.venue_id, d.custom_venue_name))
                order by d.position), '[]'::jsonb) as days
           from public.session_days d where d.session_id = $1`,
        [workshopId],
      )
    ).rows[0].days;

  // Exactly what a day-aware writer does (contract 11): the flag, the day
  // write, then the one call — and `sessions.starts_at` never moves, which is
  // why nothing else in the product would have said a word.
  //
  // ★ ONE EXPLICIT TRANSACTION, and it is not decoration. `kareem.days_writer`
  // is set with `set_config(…, true)` — transaction-LOCAL — and `pg`'s
  // `db.query` is autocommit, so each statement would be its own transaction
  // and the flag would be discarded before the next one. The RLS suite never
  // meets this because `withTx` wraps every case. Without the BEGIN this reads
  // as a day-aware save and is not one, and the day it is extended to move day
  // ONE it would send the double notice the flag exists to prevent.
  const { rows: sessBefore } = await db.query<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [workshopId]);
  await db.query("begin");
  try {
    await db.query(`select set_config('kareem.days_writer', 'on', true)`);
    const before = await snapshot();
    await db.query(
      `update public.session_days set starts_at = starts_at + interval '3 hours', ends_at = ends_at + interval '3 hours'
        where session_id = $1 and position = 2`,
      [workshopId],
    );
    const after = await snapshot();
    await db.query(`select public.session_days_changed($1::uuid, $2::jsonb, $3::jsonb)`, [
      workshopId,
      JSON.stringify(before),
      JSON.stringify(after),
    ]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  const { rows: sessAfter } = await db.query<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [workshopId]);
  expect(new Date(sessAfter[0].starts_at).getTime()).toBe(new Date(sessBefore[0].starts_at).getTime());

  await page.goto("/ar/app/me/notifications");
  const notice = page.locator("li", { hasText: workshopTitle }).first();
  await expect(notice).toBeVisible();

  // ★ THE CARD ITSELF SAYS WHICH DAY AND WHAT MOVED. Asserting only the
  // payload is how the first run of this case went green over a card that read
  // «تغيّرت تفاصيل جلسة حجزت فيها» and nothing else — true, and useless to a
  // member of a three-day workshop (REQ-SES-009, 08 §3.3).
  await expect(notice).toContainText("اليوم الثاني");
  await expect(notice).toContainText("الموعد");
  await captureOf(page, notice, "notice-day-2");

  // And the payload says WHICH day, which is the whole of REQ-SES-009 here.
  const { rows } = await db.query<{ payload: { changes: Array<{ field: string; day?: number; days?: number }> } }>(
    `select payload from public.notifications
      where member_id = $1 and key = 'MSG-session_changed' and payload ->> 'session_id' = $2`,
    [memberId, workshopId],
  );
  expect(rows).toHaveLength(1);
  const moved = rows[0].payload.changes.find((c) => c.field === "starts_at")!;
  expect(moved.day).toBe(2);
  expect(moved.days).toBe(3);
});

test("the notice as MAIL, in Mailpit — needs a real worker", async ({ page }) => {
  // The in-app half is written by `notify()` in the caller's transaction; the
  // email half is `JOB-send_notification`, so this only means anything with a
  // worker draining the queue against the local sink (DEC-046).
  test.skip(process.env.E2E_WORKER !== "1", "set E2E_WORKER=1 with a worker running against local Supabase");

  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(workshopTitle)}`);
        if (!res.ok) return 0;
        return ((await res.json()) as { messages?: unknown[] }).messages?.length ?? 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  await page.setViewportSize(PHONE);
  await page.goto(`${MAILPIT}/`);
  await page.getByText(workshopTitle).first().click();
  await page.screenshot({ path: join(SHOTS, "wave9-notify-mail-day-2.png"), fullPage: true });
});
