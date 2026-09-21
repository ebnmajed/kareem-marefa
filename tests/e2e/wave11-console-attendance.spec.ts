// Wave 11 (M13), K2 — the attendance report at 390 px, against real local
// Supabase (REQ-CHK-012, REQ-SES-017, REQ-NFR-007, DEC-166).
//
// Before this wave the report's table carried an inline `min-width` of
// `420 + n × 140` px (560 px at one day), so at 390 px it scrolled sideways at
// EVERY day count. Below `md` the same `<table>` now reflows into stacked
// cards — one line per day, growing downwards — and from `md` up it is the
// table waves 7 and 9 shipped. This file proves both at one, two and three days.
//
// ★ What the phone project's header assertions prove, said plainly (the lead's
// sync-1 ruling): below `md` the header row is VISUALLY HIDDEN, not removed —
// it stays in the accessibility tree so a screen reader still reads a table
// with headers. So on the phone this file asserts `toBeAttached()` on a
// `columnheader`, never `toBeVisible()`: a 1 × 1 clipped box is «visible» to
// Playwright, and a visibility assertion there would claim something about the
// screen that is not true. The pre-existing specs that assert `toBeVisible()` on
// a `columnheader` on the phone project (`wave9-checkin-days`,
// `wave9-checkin-one-day`) still pass, and for that reason prove presence in the
// tree, not on screen.
//
// ★ NO SHARED FIXTURE: its own org, members and three sessions, whose days are
// placed so no member's check-ins overlap across sessions
// (`check_ins_member_id_session_window_excl` compares real day windows).
//
// Captures (`E2E_SHOTS_DIR`, default `.qa-shots/rtl`), phone project, 390 × 844:
//   wave11-console-attendance-1day.png · -2days.png · -3days.png
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-11";
const DAY_LABELS = ["اليوم الأول", "اليوم الثاني", "اليوم الثالث"];

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
const userIds: string[] = [];
const emails = { staff: "", sara: "", khalid: "" };
const members = { staff: "", sara: "", khalid: "" };
/** Day count → the session and its day ids, by position. */
const sessions: Record<number, { id: string; dayIds: string[] }> = {};

// Every page-level locator from `#main` (DEC-145).
const inMain = (page: Page) => page.locator("#main");

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
});

async function signIn(context: BrowserContext, email: string, asAdmin: boolean): Promise<string> {
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

test.beforeAll(async ({ browser }, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave11-att-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الحضور', $1, 'AT', gen_random_uuid()) returning id`,
    [`wave11-att-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'ورش') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);

  // Day windows in hours from now, one list per session. Disjoint across
  // sessions, so one member's check-ins never overlap.
  const plan: Record<number, [number, number][]> = {
    1: [[-120, -118]],
    2: [
      [-100, -98],
      [-80, -78],
    ],
    3: [
      [-60, -58],
      [-40, -38],
      [-20, -18],
    ],
  };
  for (const [count, windows] of Object.entries(plan)) {
    const [first, ...rest] = windows;
    const { rows: sess } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                     venue_id, capacity, state, published_at, allow_walk_ins)
       values ($1, $2, 'ملخص', $3, 'introductory', now() + make_interval(hours => $4), 120, now() + make_interval(hours => $5),
               $6, 40, 'in_progress', now() - interval '10 days', true)
       returning id`,
      [orgId, `جلسة ${count} أيام`, cat[0].id, first[0], first[1], venue[0].id],
    );
    for (const [from, to] of rest) {
      await db.query(
        `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
         values ($1, $2, 1, now() + make_interval(hours => $3), now() + make_interval(hours => $4), $5)`,
        [orgId, sess[0].id, from, to, venue[0].id],
      );
    }
    const { rows: days } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [sess[0].id]);
    expect(days).toHaveLength(Number(count));
    sessions[Number(count)] = { id: sess[0].id, dayIds: days.map((d) => d.id) };
  }

  for (const [who, name] of [
    ["staff", "مشرف الحضور"],
    ["sara", "سارة العتيبي"],
    ["khalid", "خالد الحربي"],
  ] as const) {
    const email = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    emails[who] = email;
    userIds.push(data.user.id);
  }

  // A member row exists only once `provision_member()` has run for them.
  const context = await browser.newContext();
  members.sara = await signIn(context, emails.sara, false);
  await context.clearCookies();
  members.khalid = await signIn(context, emails.khalid, false);
  await context.clearCookies();
  members.staff = await signIn(context, emails.staff, true);
  await context.close();

  // Both hold a confirmed seat everywhere; سارة attends every day, خالد
  // misses the last day of each multi-day session and the one-day session.
  for (const { id, dayIds } of Object.values(sessions)) {
    for (const member of [members.sara, members.khalid]) {
      await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, id, member]);
    }
    for (const [i, day] of dayIds.entries()) {
      const attendees = i < dayIds.length - 1 ? [members.sara, members.khalid] : [members.sara];
      for (const member of attendees) {
        await db.query(
          `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
           values ($1, $2, $3, $4, 'manual', 'حضر', $5)`,
          [orgId, id, day, member, members.staff],
        );
      }
    }
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

for (const count of [1, 2, 3]) {
  test(`the attendance report at ${count} day(s): no sideways scroll on a phone, the table unchanged on a desktop`, async ({ context, page }, testInfo) => {
    const isPhone = testInfo.project.name === "phone";
    const main = inMain(page);
    await signIn(context, emails.staff, true);
    await page.goto(`/ar/app/admin/sessions/${sessions[count].id}/attendance`);
    await expect(main.getByRole("heading", { level: 1 })).toContainText("تقرير الحضور");

    const table = main.getByRole("table");
    const sara = table.getByRole("row", { name: /سارة العتيبي/ });
    const khalid = table.getByRole("row", { name: /خالد الحربي/ });
    await expect(sara).toBeVisible();
    await expect(khalid).toBeVisible();

    const headers = count === 1 ? ["الاسم", "الحالة", "وقت الوصول", "الطريقة"] : ["الاسم", "الحالة", ...DAY_LABELS.slice(0, count), "الأيام"];
    for (const name of headers) {
      const header = table.getByRole("columnheader", { name, exact: true });
      // On the phone the header row is in the tree, not on screen (the header comment).
      if (isPhone) await expect(header).toBeAttached();
      else await expect(header).toBeVisible();
    }

    if (count > 1) {
      await expect(sara.getByRole("cell", { name: `${count} من ${count}` })).toBeVisible();
      await expect(khalid.getByRole("cell", { name: `${count - 1} من ${count}` })).toBeVisible();
    } else {
      await expect(sara.getByRole("cell", { name: "يدوي", exact: true })).toBeVisible();
    }

    if (isPhone) {
      // The page does not scroll sideways, and neither does the list's region.
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - window.innerWidth,
        region: (() => {
          const region = document.querySelector('#main [role="region"][aria-labelledby="list"]') as HTMLElement | null;
          return region ? region.scrollWidth - region.clientWidth : -1;
        })(),
      }));
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.region).toBe(0);

      // Each day is a line of its own card, labelled with the day's name — the
      // card grows downwards with the day count, never sideways.
      if (count > 1) for (const label of DAY_LABELS.slice(0, count)) await expect(khalid.getByText(label, { exact: true })).toBeVisible();

      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `wave11-console-attendance-${count === 1 ? "1day" : `${count}days`}.png`), fullPage: true });
    } else {
      // From `md` up the header row is on screen and is one row of the table.
      await expect(table.getByRole("row").first()).toContainText("الاسم");
    }
  });
}
