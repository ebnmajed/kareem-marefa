// REQ-SES-017 on a real screen against REAL local Supabase — «partial
// attendance earns nothing, and the member can see why».
//
// Three captures, and the third is the one that matters most: a ONE-DAY
// session's history, to be read beside its wave-7 capture. Everything this
// wave adds has to leave that page alone.
//
// Same shape as tests/e2e/points.spec.ts — a user minted through the local
// Auth admin API, provisioned through provision_member(), signed in with a
// captured cookie jar. Skipped when the local service key is not provided.
//
// Needs 0113 and 0114 (promoted at sync 2): the award at completion and
// missed_attendance_days().
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
// A run in the lead's verification worktree lands its captures in the main
// checkout, which is where the row's path points.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE_R = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let workshopId = "";
let workshopDays: string[] = [];
let oneDayId = "";
let oneDayDay = "";
const userIds: string[] = [];
const emails: Record<"full" | "partial" | "oneday", string> = { full: "", partial: "", oneday: "" };

/** A completed session with `days` days, each an hour long, ending in the
 *  past. Day one is `startsDaysAgo` days ago; 0100's sessions_sync_single_day()
 *  makes the first, session_days_derive() ranks the rest and re-derives the
 *  session's stored window. */
async function makeSession(title: string, days: number, startsDaysAgo: number, categoryId: string, venueId: string): Promise<{ id: string; dayIds: string[] }> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at)
     values ($1, $2, 'ملخص الورشة', $3, 'introductory',
             now() - ($5 || ' days')::interval, 60, now() - ($5 || ' days')::interval + interval '1 hour',
             $4, 40, 'completed', now() - interval '30 days', now() - interval '1 hour')
     returning id`,
    [orgId, title, categoryId, venueId, String(startsDaysAgo)],
  );
  for (let i = 1; i < days; i += 1) {
    await db.query(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() - ($2 || ' days')::interval, now() - ($2 || ' days')::interval + interval '1 hour', $3)`,
      [rows[0].id, String(startsDaysAgo - i), venueId],
    );
  }
  const { rows: dayRows } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [rows[0].id]);
  expect(dayRows).toHaveLength(days);
  return { id: rows[0].id, dayIds: dayRows.map((d) => d.id) };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // Desktop and phone share one database (TEAM.md §5): the worker index is
  // part of the tag, or two workers entering beforeAll in the same
  // millisecond collide on the slug.
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave9-scoring-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الورشة', $1, 'W9', gen_random_uuid()) returning id`,
    [`wave9-scoring-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الورشة', 40) returning id`, [orgId]);

  const workshop = await makeSession("ورشة ثلاثة أيام", 3, 10, catRows[0].id, venueRows[0].id);
  workshopId = workshop.id;
  workshopDays = workshop.dayIds;
  const single = await makeSession("جلسة يوم واحد", 1, 25, catRows[0].id, venueRows[0].id);
  oneDayId = single.id;
  oneDayDay = single.dayIds[0];

  for (const which of ["full", "partial", "oneday"] as const) {
    emails[which] = `${which}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: emails[which],
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `عضو ${which}` },
    });
    if (error) throw error;
    userIds.push(data.user.id);
  }
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

async function attend(sessionId: string, dayId: string, memberId: string): Promise<void> {
  await db.query(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $4)`,
    [orgId, sessionId, dayId, memberId],
  );
}

/** The completion pass, then the award jobs it enqueued — exactly what
 *  worker/src/tasks/{evaluate_no_shows,award_points}.ts run. Seeding through
 *  the real path is the point: a hand-written ledger row would prove the
 *  screen can render an award, never that the engine produces one. */
async function runCompletion(sessionId: string, memberId: string): Promise<void> {
  await db.query(`select public.evaluate_session_attendance($1)`, [sessionId]);
  const { rows } = await db.query<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } }>(
    `select j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'award_points'
        and j.payload ->> 'member_id' = $1
        and j.payload ->> 'session_id' = $2`,
    [memberId, sessionId],
  );
  for (const { payload } of rows) {
    await db.query(`select public.award_points($1, $2, $3, $4, $5)`, [payload.rule, payload.member_id, payload.source, payload.source_id, payload.session_id]);
  }
}

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE_R);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave9-scoring-${name}.png`), fullPage: true });
}

test("a three-day workshop attended in full pays ONE award, and the history says so", async ({ context, page }) => {
  await page.setViewportSize(PHONE_R);
  const memberId = await signIn(context, emails.full);
  for (const dayId of workshopDays) await attend(workshopId, dayId, memberId);
  await runCompletion(workshopId, memberId);

  await page.goto("/ar/app/me/points");
  await expect(page.getByRole("heading", { name: "نقاطي", level: 1 })).toBeVisible();

  const history = page.locator("#history");
  // ONE row for three days, not three. The catalogue below repeats
  // check_in's own reasonAr, so the locator is scoped to the history.
  await expect(history.locator("li")).toHaveCount(1);
  await expect(history.locator("li", { hasText: "تسجيل حضور مؤكَّد" })).toContainText("+20");
  await expect(history.getByText(/ورشة ثلاثة أيام/)).toBeVisible();
  // …and nothing to explain.
  await expect(history.getByText("لم تُحتسب نقاط الحضور")).toHaveCount(0);
  // The balance reconciles to points_balances through the page's own Stat.
  await expect(page.locator("strong", { hasText: "20" })).toBeVisible();

  await capture(page, "three-day-full");
});

test("★ missing one day earns nothing, and the history NAMES the day rather than showing an absence", async ({ context, page }) => {
  await page.setViewportSize(PHONE_R);
  const memberId = await signIn(context, emails.partial);
  await attend(workshopId, workshopDays[0], memberId);
  await attend(workshopId, workshopDays[2], memberId);
  await runCompletion(workshopId, memberId);

  await page.goto("/ar/app/me/points");
  const history = page.locator("#history");

  // No attendance award: REQ-SES-017's «partial attendance earns nothing».
  await expect(history.locator("li", { hasText: "تسجيل حضور مؤكَّد" })).toHaveCount(0);

  // ★ And the whole point of the requirement — the member can see WHY,
  // without asking anyone. The notice names the day, states the rule, and
  // carries no amount, because no points moved.
  const notice = history.locator("li", { hasText: "لم تُحتسب نقاط الحضور" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("اليوم الثاني");
  await expect(notice).toContainText("نقاط الحضور تُمنح مرة واحدة عند حضور جميع أيام الجلسة.");
  await expect(notice.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${workshopId}`);
  // DEC-124 — Western numerals everywhere, including a day the member missed.
  await expect(notice).not.toContainText(/[٠-٩]/);

  await capture(page, "three-day-missed-day-two");
});

test("★ a ONE-DAY session's history is what it was: an award at check-in, and no notion of a missed day", async ({ context, page }) => {
  await page.setViewportSize(PHONE_R);
  const memberId = await signIn(context, emails.oneday);
  await attend(oneDayId, oneDayDay, memberId);
  // One day pays at check-in, so this is the call check_in() makes — not the
  // completion pass, which is the multi-day path.
  const { rows } = await db.query<{ id: string }>(
    `select id from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null`,
    [oneDayId, memberId],
  );
  await db.query(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [memberId, rows[0].id, oneDayId]);

  await page.goto("/ar/app/me/points");
  const history = page.locator("#history");
  await expect(history.locator("li")).toHaveCount(1);
  await expect(history.locator("li", { hasText: "تسجيل حضور مؤكَّد" })).toContainText("+20");
  await expect(history.getByText(/جلسة يوم واحد/)).toBeVisible();
  // The multi-day machinery is dormant, not hidden: no notice, no day, no
  // group heading. This capture is read beside the wave-7 one.
  await expect(history.getByText("لم تُحتسب نقاط الحضور")).toHaveCount(0);
  await expect(history.getByText(/اليوم /)).toHaveCount(0);

  await capture(page, "one-day-unchanged");
});
