// Wave 12 demonstrables D2 and D3 — REQ-PTS-015, REQ-CHK-018, REQ-SES-019,
// DEC-172, DEC-174. Run against a production build AND THE REAL WORKER: every
// award here is written by graphile-worker running the jobs the SQL enqueued,
// never by the spec. Start the worker first (the lead's `run-worker.sh`:
// `node worker/dist/index.js` on the local keys); the spec polls the ledger.
//
// D3 — one day, one member, two sessions:
//   · session 1: the member enters the code and is told what is pending; the
//     ledger has NO row for them; the session completes; the worker writes the
//     row; the screen now says it was added.
//   · session 2: the same member checks in and an admin removes the record
//     BEFORE completion; the session completes; the ledger has no row of any
//     kind for them — no award and no reversal. That is the point of the change.
//
// D2 — a completed session: an admin adds a presenter after completion (the
// worker pays their presenter awards), then removes them (a compensating row
// per award, written at once). Both times `points_balances` equals the sum of
// the ledger — the balance is recomputable (invariant 9).
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
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

const expect = baseExpect.configure({ timeout: 15_000 });
const WORKER = { timeout: 120_000, intervals: [1_000, 2_000, 3_000] };
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let categoryId = "";
let venueId = "";
let adminId = "";
let memberId = "";
let presenterId = "";
let addedId = "";
let attendee2Id = "";
let rulePoints = 0;
const userIds: string[] = [];

async function makeUser(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
}

async function client(email: string): Promise<{ c: SupabaseClient; memberId: string }> {
  const c = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await c.rpc("provision_member");
  if (rpcError) throw rpcError;
  await c.auth.refreshSession();
  return { c, memberId: (data as { member_id: string }).member_id };
}

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const c = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await c.auth.refreshSession();
  await context.addCookies(jar.map((x) => ({ name: x.name, value: x.value, domain: "localhost", path: "/" })));
}

/** A one-day session in progress, check-in open, walk-ins allowed (no RSVP, so no no-show).
 *  A member cannot hold two check-ins whose windows overlap (0087), so each D3 session gets its own window. */
async function runningSession(title: string, code: string, window: [string, string] = ["-15 minutes", "105 minutes"]) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + $5::interval, 120, now() + $6::interval,
             $4, 40, 'in_progress', now() - interval '10 days', true) returning id`,
    [orgId, title, categoryId, venueId, window[0], window[1]],
  );
  const sessionId = rows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  const { rows: day } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  await db.query(
    `insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
     values ($1, $2, $3, $4, now() - interval '10 minutes', now() + interval '20 minutes')`,
    [orgId, sessionId, day[0].id, code],
  );
  return sessionId;
}

/** The session ends, the way the clock ends it: the state moves and 0031's fan-out enqueues the pass. */
async function complete(sessionId: string) {
  await db.query(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
}

async function checkInWithCode(page: Page, sessionId: string, code: string) {
  const main = page.locator("#main");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  const boxes = main.locator("input[maxlength='1']");
  const assembled = main.locator('input[type="hidden"][name="code"]');
  await expect(async () => {
    for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(code, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await main.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(page).toHaveURL(/\?success=1$/, { timeout: 15_000 });
}

const rows = (sessionId: string, member: string) =>
  db
    .query<{ source: string; amount: number; rule_key: string | null }>(
      `select source::text, amount, rule_key from public.points_ledger where session_id = $1 and member_id = $2 order by occurred_at, id`,
      [sessionId, member],
    )
    .then((r) => r.rows);

async function balanceMatchesLedger(member: string) {
  const { rows: r } = await db.query<{ cached: number | null; summed: number }>(
    `select (select total_points from public.points_balances where member_id = $1) as cached,
            (select coalesce(sum(amount), 0)::int from public.points_ledger where member_id = $1) as summed`,
    [member],
  );
  expect(r[0].cached ?? 0, "points_balances equals the sum of the ledger").toBe(r[0].summed);
  return r[0].summed;
}

async function shoot(page: Page, name: string, isPhone: boolean) {
  if (!isPhone) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${Date.now()}`;
  domain = `w12-awards-${tag}.example`;
  const { rows: o } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المكافآت', $1, 'AW', gen_random_uuid()) returning id`,
    [`w12-awards-${tag}`],
  );
  orgId = o[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  categoryId = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'لقاءات') returning id`, [orgId])).rows[0].id;
  venueId = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId])).rows[0].id;
  rulePoints = (await db.query<{ points: number }>(`select points from public.scoring_rules where org_id = $1 and action_key = 'check_in' and enabled`, [orgId])).rows[0].points;

  for (const [who, name] of [["admin", "مشرفة المؤسسة"], ["member", "نورة القحطاني"], ["presenter", "سعد الحربي"], ["added", "ريم العتيبي"], ["attendee2", "خالد الدوسري"]] as const) {
    await makeUser(`${who}@${domain}`, name);
  }
  adminId = (await client(`admin@${domain}`)).memberId;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminId]);
  memberId = (await client(`member@${domain}`)).memberId;
  presenterId = (await client(`presenter@${domain}`)).memberId;
  addedId = (await client(`added@${domain}`)).memberId;
  attendee2Id = (await client(`attendee2@${domain}`)).memberId;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("★ D3 — one day: checked in and told what is pending, NO ledger row; completion writes it", async ({ context, page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  if (phone) await page.setViewportSize(PHONE);
  // Ended an hour ago — still inside the `ends_at + 2 h` ceiling, and clear of the next session's window.
  const sessionId = await runningSession("جلسة المكافأة المؤجلة", "ACDFGH", ["-3 hours", "-1 hour"]);
  await signIn(context, `member@${domain}`);

  await checkInWithCode(page, sessionId, "ACDFGH");
  const award = page.locator("#main").getByRole("region", { name: "نقاط هذه الجلسة" });
  await expect(award).toContainText("بانتظارك");
  await expect(award).toContainText("تُضاف إلى رصيدك عند انتهاء الجلسة.");
  await shoot(page, "wave12-demo-d3-checked-in-pending", phone);

  // The worker is running and has had its chance: still nothing is written.
  await page.waitForTimeout(5_000);
  expect(await rows(sessionId, memberId)).toEqual([]);

  await complete(sessionId);
  await expect.poll(() => rows(sessionId, memberId), WORKER).toEqual([{ source: "check_in", amount: rulePoints, rule_key: "check_in" }]);
  await balanceMatchesLedger(memberId);

  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(award).not.toContainText("بانتظارك");
  await shoot(page, "wave12-demo-d3-completed-paid", phone);
});

test("★ D3 — the same member removed BEFORE completion: no award, no reversal, no row of any kind", async ({ context, page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  const sessionId = await runningSession("جلسة أُزيل منها الحضور", "CDFGHJ");
  await signIn(context, `member@${domain}`);
  await checkInWithCode(page, sessionId, "CDFGHJ");

  const { c: adminClient } = await client(`admin@${domain}`);
  const { error } = await adminClient.rpc("remove_check_in", { p_session: sessionId, p_member: memberId, p_reason: "سُجّل خطأً", p_day: null });
  expect(error, error?.message).toBeNull();
  expect(await rows(sessionId, memberId)).toEqual([]);

  await complete(sessionId);
  // Wait for the completion pass itself to have run (it pays the presenter), then look.
  await expect.poll(async () => (await rows(sessionId, presenterId)).some((r) => r.source === "session_delivered"), WORKER).toBe(true);
  expect(await rows(sessionId, memberId), "no award, no reversal, no no-show").toEqual([]);
  const { rows: reversals } = await db.query(`select 1 from public.points_ledger where member_id = $1 and source = 'reversal'`, [memberId]);
  expect(reversals).toHaveLength(0);
});

test("★ D2 — a presenter added AFTER completion is paid; removed, each award is compensated; the balance recomputes", async () => {
  // A completed session with one presenter and one qualifying attendee, paid by the worker.
  const sessionId = await runningSession("جلسة اكتملت ثم تغيّر مقدّموها", "DFGHJK");
  const { rows: day } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  // Its own attendee: D3's member already holds a check-in in this window.
  const { c: memberClient } = await client(`attendee2@${domain}`);
  // The attendee checks in with the code, through check_in() — the path the screen's action calls.
  const { error: ciErr } = await memberClient.rpc("check_in", { p_session: sessionId, p_code: "DFGHJK", p_day: day[0].id });
  expect(ciErr, ciErr?.message).toBeNull();
  await complete(sessionId);
  await expect.poll(async () => (await rows(sessionId, presenterId)).map((r) => r.source).sort(), WORKER).toEqual(["attendee_bonus", "session_delivered"]);
  await expect.poll(async () => (await rows(sessionId, attendee2Id)).map((r) => r.source), WORKER).toEqual(["check_in"]);

  // Added after completion, through the admin's RPC — the Server Action's path.
  const { c: adminClient } = await client(`admin@${domain}`);
  const add = await adminClient.rpc("add_session_presenter", { p_session: sessionId, p_member: addedId });
  expect(add.error, add.error?.message).toBeNull();
  await expect.poll(async () => (await rows(sessionId, addedId)).map((r) => r.source).sort(), WORKER).toEqual(["attendee_bonus", "session_delivered"]);
  const paid = await balanceMatchesLedger(addedId);
  expect(paid).toBeGreaterThan(0);

  // Removed after completion: one compensating row per award, written by the trigger at once.
  const remove = await adminClient.rpc("remove_session_presenter", { p_session: sessionId, p_member: addedId });
  expect(remove.error, remove.error?.message).toBeNull();
  const after = await rows(sessionId, addedId);
  expect(after.filter((r) => r.source === "reversal")).toHaveLength(2);
  expect(after.reduce((n, r) => n + r.amount, 0)).toBe(0);
  expect(await balanceMatchesLedger(addedId)).toBe(0);

  // The original presenter is untouched.
  expect((await rows(sessionId, presenterId)).some((r) => r.source === "reversal")).toBe(false);
});
