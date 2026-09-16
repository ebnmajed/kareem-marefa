// RSV/CHK against REAL local Supabase (STORY-RSV-001..004, STORY-CHK-001..006).
// Same shape as tests/e2e/session.spec.ts: a user minted through the local
// Auth admin API, provisioned through provision_member(), signed in with a
// captured cookie jar handed to the browser. Skipped when the local service
// key isn't provided (`npm run test:e2e:local`) — CI has no Supabase, the
// RLS suite covers the database there.
//
// Needs supabase/proposed/checkin/{01_rsvp,02_check_in}.sql promoted into
// supabase/migrations/ first — these RPCs don't exist until the lead does
// that at a sync point.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// `E2E_SHOTS_DIR` lets a look-only run against a dev server keep its
// pictures out of the directory the review reads (`event-page.spec.ts`'s
// own convention, `wave7-content-me.spec.ts`'s own precedent for this
// exact helper shape). A verification worktree sets this to the MAIN
// checkout's `.qa-shots/rtl`, so a sync build's captures land where
// STATUS.md's row cites them, not inside the worktree that produced them.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

// Same isolation reasoning as session.spec.ts: each worker gets its own org,
// domain, session and users, and specs run serially within the worker.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let publishedSessionId = "";
let attendeeUserId = "";
let attendeeEmail = "";
let staffUserId = "";
let staffEmail = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `checkin-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة تسجيل الحضور', $1, 'CE', gen_random_uuid()) returning id`,
    [`checkin-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة اختبار الحضور', 'ملخص الجلسة', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  // A separate PUBLISHED (not yet started) session for the RsvpPanel slot —
  // the host/check-in session above is already in_progress, past the point
  // reserve_seat() accepts.
  const { rows: publishedRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة اختبار الحجز', 'ملخص الجلسة', $2, 'introductory', now() + interval '48 hours', 60, now() + interval '49 hours',
             $3, 30, now() + interval '47 hours', now() + interval '47 hours', 'published', now() - interval '1 hour')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  publishedSessionId = publishedRows[0].id;

  attendeeEmail = `attendee@${domain}`;
  const { data: attendeeAuth, error: e1 } = await admin.auth.admin.createUser({ email: attendeeEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الحضور" } });
  if (e1) throw e1;
  attendeeUserId = attendeeAuth.user.id;

  staffEmail = `staff@${domain}`;
  const { data: staffAuth, error: e2 } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف الحضور" } });
  if (e2) throw e2;
  staffUserId = staffAuth.user.id;
});

test.afterAll(async () => {
  if (attendeeUserId) await admin.auth.admin.deleteUser(attendeeUserId);
  if (staffUserId) await admin.auth.admin.deleteUser(staffUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs in, provisions through the real RPC, and installs the resulting cookies. Returns the member id. */
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
  if (asAdmin) {
    // Claims were minted before the role change — the custom access token
    // hook re-reads the members row on EVERY token mint, refresh included
    // (not just initial sign-in), so a plain refreshSession() below is
    // enough; no sign-out/re-sign-in needed (and doing that unnecessarily
    // clobbered the cookie jar between the two calls — first version of
    // this test learned that the hard way).
    await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

test("an ordinary member reaches the check-in field one tap away and checks in with the live code", async ({ context, page }) => {
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رمز الحضور");
  const code = await page.locator("p[dir='ltr']").first().textContent();
  expect(code?.trim()).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);

  await context.clearCookies();
  await signIn(context, attendeeEmail, false);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  await expect(page.getByText("أدخل رمز الحضور الذي أعلنه المُقدِّم")).toBeVisible();

  const boxes = page.locator("input[maxlength='1']");
  await expect(boxes).toHaveCount(6);
  for (const [i, ch] of Array.from(code!.trim()).entries()) {
    await boxes.nth(i).fill(ch);
  }
  await page.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(page).toHaveURL(/\?success=1$/);
  await expect(page.getByRole("status")).toHaveText("تم تسجيل حضورك");

  // A second visit and submit is the DISTINCT "already checked in" state, not another success.
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  for (const [i, ch] of Array.from(code!.trim()).entries()) {
    await boxes.nth(i).fill(ch);
  }
  await page.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(page).toHaveURL(/\?already=1$/);
  await expect(page.getByRole("status")).toHaveText("أنت مسجَّل بالفعل");
});

test("a plain member is refused the host view by policy, not merely hidden UI (REQ-CHK-014)", async ({ context, page }) => {
  await signIn(context, attendeeEmail, false);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("هذه الصفحة متاحة لمقدِّمي الجلسة والمشرفين فقط");
});

test("an invalid code is rejected without revealing anything else, and the field is reachable in the RTL layout", async ({ context, page }) => {
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  const boxes = page.locator("input[maxlength='1']");
  for (let i = 0; i < 6; i++) {
    await boxes.nth(i).fill("Z");
  }
  await page.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(page).toHaveURL(/error=invalid_code&code=ZZZZZZ$/);
  // Next's own route announcer also carries role="alert" — scope to the copy, not the role alone.
  await expect(page.getByRole("alert").filter({ hasText: "الرمز غير صحيح" })).toBeVisible();
  // React 19 resets the form on every action, redirect included (DEC-043) — the rejected
  // code should still be there to fix one character, not six empty boxes to retype.
  for (let i = 0; i < 6; i++) {
    await expect(boxes.nth(i)).toHaveValue("Z");
  }
});

test("the RsvpPanel slot renders inside the real event page and reserves a seat, at 390px", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(context, attendeeEmail, false);
  await page.goto(`/ar/app/sessions/${publishedSessionId}`);
  // The first event-page render under the full suite's parallel load can
  // outlast the default 5 s (seen once per project on Launch day); alone,
  // the same case takes 1–3 s. The wait is for the server, not the UI.
  //
  // ★ Scoped to the RSVP region, not the whole page: Next 16's dynamic-route
  // streaming (this page touches cookies() in the DAL, so it's dynamic)
  // transiently duplicates a matching text node elsewhere in the document
  // during hydration on roughly a third of runs — a static DOM snapshot
  // always shows exactly one `<p>`, and this exact region is what Playwright
  // itself names as the unique match in the strict-mode violation this used
  // to throw (`aka getByRole('region', { name: 'الحضور' }).getByRole(
  // 'paragraph')`). Scoping here, not chasing the transient duplicate,
  // matches Playwright's own guidance on strict-mode violations.
  const panel = page.getByRole("region", { name: "الحضور" });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/يتبقى \d+ مقعد/)).toBeVisible();

  await panel.getByRole("button", { name: "احجز مقعدك" }).click();
  await page.waitForLoadState("networkidle");
  await expect(panel.getByText("تم تأكيد حجزك")).toBeVisible();
  await expect(panel.getByRole("button", { name: "إلغاء الحجز" })).toBeVisible();

  const { rows } = await db.query<{ status: string }>(`select status from public.rsvps where session_id = $1 and member_id = (select id from public.members where auth_user_id = $2)`, [
    publishedSessionId,
    attendeeUserId,
  ]);
  expect(rows[0].status).toBe("confirmed");
});

// ★ DEC-141/REQ-CHK-015 — the manual switch, last in the file: closes and
// reopens `sessionId`'s check-in (the same session tests 1–2 already used),
// which every earlier test in this file has already finished asserting
// against by the time this runs (serial mode). Captures named for the
// lead's sync build: wave7-checkin-host-{open,closed}.png — phone PROJECT
// only, same reasoning as `admin-attendance.spec.ts`'s own capture guard.
test("REQ-CHK-015/016: the check-in switch closes and reopens, staying at 390px", async ({ context, page }) => {
  const isPhone = test.info().project.name === "phone";
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(context, staffEmail, true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);

  await expect(page.getByText("تسجيل الحضور مفتوح الآن")).toBeVisible();
  if (isPhone) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, "wave7-checkin-host-open.png"), fullPage: true });
  }

  await page.getByRole("button", { name: "أغلق تسجيل الحضور" }).click();
  await expect(page).toHaveURL(/\?switch=closed$/);
  await expect(page.getByText("تم إغلاق تسجيل الحضور")).toBeVisible();
  await expect(page.getByText("تسجيل الحضور مغلق الآن")).toBeVisible();
  // DEC-115: closing revokes nothing already recorded — the hint says so,
  // and the code above (still valid the whole time — 0084's own comment:
  // the switch never gates issuance) still shows, unrevoked.
  await expect(page.getByText("لن يُقبل أي رمز جديد")).toBeVisible();
  if (isPhone) await page.screenshot({ path: join(SHOTS, "wave7-checkin-host-closed.png"), fullPage: true });

  const { rows: closedRows } = await db.query<{ check_in_open: boolean }>(`select check_in_open from public.sessions where id = $1`, [sessionId]);
  expect(closedRows[0].check_in_open).toBe(false);

  // Reopen it, leaving the session as every earlier test in this file found it.
  await page.getByRole("button", { name: "افتح تسجيل الحضور" }).click();
  await expect(page).toHaveURL(/\?switch=opened$/);
  await expect(page.getByText("تسجيل الحضور مفتوح الآن")).toBeVisible();
  const { rows: reopenedRows } = await db.query<{ check_in_open: boolean }>(`select check_in_open from public.sessions where id = $1`, [sessionId]);
  expect(reopenedRows[0].check_in_open).toBe(true);
});
