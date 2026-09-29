// Wave 12 — check-in says what the member has earned and when it arrives
// (REQ-CHK-018, REQ-PTS-015, DEC-172, DEC-174). Contract 1's four states, each
// on the screen a member would meet it on, at 390 px in Arabic.
//
// ★ THE CLAIM IS «A STATE, NOT A TOAST». So every case that shows a state also
// shows it AGAIN from a fresh navigation — no `?success=1`, nothing carried in
// the URL or in client state — and on the event page, which is a different
// route reading the same DTO. A message fired once would pass the first
// assertion and fail the second.
//
// ★ And the status line stays the page's ONLY status: `checkin.spec.ts` and
// `sessions-screens.spec.ts` assert it exactly, and the award block is a
// `region`, never a live region.
//
// The states are reached the way the data reaches them, not by a flag: a real
// code for «pending at one day»; direct rows for the multi-day and paid cases,
// because a day in the past and a completed session are facts about the clock
// and the worker that this spec should not wait for.
//
// Captures: wave12-checkin-{check-in,event}-{pending,pending-days,incomplete,paid}.png
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

const PASSWORD = "correct-horse-battery-staple-9";
const CODE = "ACDEFG";
const HEADING = "نقاط هذه الجلسة";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let categoryId = "";
let venueId = "";
let staffMemberId = "";
let attendeeEmail = "";
const userIds: string[] = [];
let attendeeMemberId = "";
let rulePoints = 0;

/** DEC-145: every page-level locator from `#main`. */
const inMain = (page: Page) => page.locator("#main");
const awardIn = (page: Page) => inMain(page).getByRole("region", { name: HEADING });

async function shoot(page: Page, name: string, isPhone: boolean) {
  if (!isPhone) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
});

async function makeUser(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  return data.user.id;
}

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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (envelope as { member_id: string }).member_id;
}

/** A session with the given day windows (hours from now). Day 1 comes from `0100`'s shim, the rest are inserted. */
async function makeSession(title: string, windows: [number, number][], opts: { state?: string; requireAllDays?: boolean } = {}) {
  const [first, ...rest] = windows;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins, require_all_days)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + make_interval(secs => $4::double precision * 3600), 120, now() + make_interval(secs => $5::double precision * 3600),
             $6, 40, $7, now() - interval '10 days', true, $8)
     returning id`,
    [orgId, title, categoryId, first[0], first[1], venueId, opts.state ?? "in_progress", opts.requireAllDays ?? true],
  );
  const sessionId = rows[0].id;
  for (const [from, to] of rest) {
    await db.query(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
       values ($1, $2, 1, now() + make_interval(secs => $3::double precision * 3600), now() + make_interval(secs => $4::double precision * 3600), $5)`,
      [orgId, sessionId, from, to, venueId],
    );
  }
  const { rows: days } = await db.query<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [sessionId]);
  expect(days).toHaveLength(windows.length);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, attendeeMemberId]);
  return { sessionId, dayIds: days.map((d) => d.id) };
}

async function checkInDirectly(sessionId: string, dayId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5, 'empty'::tstzrange) returning id`,
    [orgId, sessionId, dayId, attendeeMemberId, staffMemberId],
  );
  return rows[0].id;
}

/** The Arabic count phrase for the org's rule, in the catalogue's own six forms. */
function pointsPhrase(n: number): string {
  const r = n % 100;
  if (n === 1) return "نقطة واحدة";
  if (n === 2) return "نقطتان";
  if (r >= 3 && r <= 10) return `${n} نقاط`;
  return `${n} نقطة`;
}

async function ledgerRows(sessionId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.points_ledger where session_id = $1 and member_id = $2`, [sessionId, attendeeMemberId]);
  return rows[0].n;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `wave12-ack-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الإقرار', $1, 'AK', gen_random_uuid()) returning id`,
    [`wave12-ack-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  categoryId = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'لقاءات') returning id`, [orgId])).rows[0].id;
  venueId = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId])).rows[0].id;

  // The number shown is the org's own rule, read here rather than assumed.
  const { rows: rule } = await db.query<{ points: number }>(`select points from public.scoring_rules where org_id = $1 and action_key = 'check_in' and enabled`, [orgId]);
  expect(rule).toHaveLength(1);
  rulePoints = rule[0].points;
  expect(rulePoints).toBeGreaterThan(0);

  await makeUser(`staff@${domain}`, "مشرف اللقاء");
  attendeeEmail = `attendee@${domain}`;
  await makeUser(attendeeEmail, "نورة القحطاني");

  // Provision both members once, so their ids exist before any fixture row names them.
  const provision = async (email: string) => {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    const { data, error: rpcError } = await client.rpc("provision_member");
    if (rpcError) throw rpcError;
    return (data as { member_id: string }).member_id;
  };
  staffMemberId = await provision(`staff@${domain}`);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [staffMemberId]);
  attendeeMemberId = await provision(attendeeEmail);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("★ one day: the code, then «pending» — the same after a fresh visit and on the event page, with no ledger row", async ({ context, page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  const { sessionId, dayIds } = await makeSession("جلسة ليوم واحد", [[-0.25, 1.75]]);
  await db.query(
    `insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
     values ($1, $2, $3, $4, now() - interval '10 minutes', now() + interval '20 minutes')`,
    [orgId, sessionId, dayIds[0], CODE],
  );
  await signIn(context, attendeeEmail);
  const main = inMain(page);

  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  // Before the check-in there is nothing to say.
  await expect(awardIn(page)).toHaveCount(0);

  const boxes = main.locator("input[maxlength='1']");
  const assembled = main.locator('input[type="hidden"][name="code"]');
  await expect(async () => {
    for (const [i, ch] of Array.from(CODE).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(CODE, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await main.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  // ★ Wave 16 (REQ-UIX-046, ledger): moment 2 plays on this screen — the URL
  // carries no `?success=1` — and its status is the three lines. The award is
  // its second line: the same region, the same words.
  await expect(main.locator("[data-moment='check-in']")).toBeVisible({ timeout: 15_000 });
  await expect(main.getByRole("status")).toContainText("أنت هنا!");
  const award = awardIn(page);
  await expect(award).toContainText(`${pointsPhrase(rulePoints)} بانتظارك`);
  await expect(award).toContainText("تُضاف إلى رصيدك عند انتهاء الجلسة.");
  await expect(award).not.toContainText("حضرت");
  // ★ Wave 16 (ledger): once checked in, the static state replaces the form —
  // the award is inside it, and there is no form to lead.
  await expect(main.locator("form")).toHaveCount(0);
  // DEC-197 §1: then back to the event page.
  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${sessionId}$`), { timeout: 15_000 });

  // REQ-PTS-015: nothing is written at check-in.
  expect(await ledgerRows(sessionId)).toBe(0);

  // ★ A fresh navigation — no query string — says the same thing.
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(main.getByRole("status")).toHaveCount(0);
  await expect(awardIn(page)).toContainText(`${pointsPhrase(rulePoints)} بانتظارك`);
  await shoot(page, "wave12-checkin-check-in-pending", phone);

  // ★ And the event page, a different route on the same DTO.
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(main.getByText(`${pointsPhrase(rulePoints)} بانتظارك`)).toBeVisible();
  await shoot(page, "wave12-checkin-event-pending", phone);
});

test("day two of three, not yet checked in today: the form leads, then «1 of 3 days» and «if you attend the rest»", async ({ context, page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  // Day 1 is over (attended), day 2 is running, day 3 is tomorrow.
  const { sessionId, dayIds } = await makeSession("ورشة ثلاثة أيام", [
    [-30, -28],
    [-0.25, 1.75],
    [22, 24],
  ]);
  await checkInDirectly(sessionId, dayIds[0]);
  await signIn(context, attendeeEmail);
  const main = inMain(page);

  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  const award = awardIn(page);
  await expect(award).toContainText(`${pointsPhrase(rulePoints)} بانتظارك`);
  await expect(award).toContainText("حضرت 1 من 3 أيام");
  await expect(award).toContainText("إن حضرت بقية الأيام");
  // DEC-174 Q6: before today's check-in the code form comes first.
  const [awardBox, formBox] = await Promise.all([award.boundingBox(), main.locator("form").boundingBox()]);
  expect(formBox!.y).toBeLessThan(awardBox!.y);
  await shoot(page, "wave12-checkin-check-in-pending-days", phone);

  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(main.getByText("حضرت 1 من 3 أيام")).toBeVisible();
  await shoot(page, "wave12-checkin-event-pending-days", phone);
});

test("a required day missed: «incomplete», naming the day — before the session has ended", async ({ context, page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  // Day 1 is past its ceiling with no check-in; day 2 is over and attended;
  // day 3 is tomorrow, so the session has not ended. ★ The attended day sits
  // clear of every other case's check-in: `check_ins`' exclusion constraint
  // refuses one member in two overlapping windows, whatever the session.
  const { sessionId, dayIds } = await makeSession("ورشة فاتها يوم", [
    [-80, -78],
    [-54, -52],
    [22, 24],
  ]);
  await checkInDirectly(sessionId, dayIds[1]);
  await signIn(context, attendeeEmail);
  const main = inMain(page);

  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  const award = awardIn(page);
  await expect(award).toContainText("لن تُحتسب نقاط الحضور لهذه الجلسة");
  await expect(award).toContainText("فاتك اليوم الأول");
  await expect(award).toContainText("نقاط الحضور تتطلّب حضور جميع أيام الجلسة.");
  await expect(award).not.toContainText("بانتظارك");
  await shoot(page, "wave12-checkin-check-in-incomplete", phone);

  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(main.getByText("فاتك اليوم الأول")).toBeVisible();
  await shoot(page, "wave12-checkin-event-incomplete", phone);
});

test("completed and paid: what was added, beside «حضرت» and the refusal that the window has closed", async ({ context, page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  const { sessionId, dayIds } = await makeSession("جلسة انتهت", [[-6, -4]], { state: "completed" });
  const checkInId = await checkInDirectly(sessionId, dayIds[0]);
  // The completion pass's row, written as the worker writes it: source `check_in`, on the session.
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
     values ($1, $2, $3, 'check_in', $4, $5, 'تسجيل حضور مؤكَّد', 'check_in', $6)`,
    [orgId, attendeeMemberId, rulePoints, checkInId, sessionId, `wave12-ack-paid:${sessionId}`],
  );
  await signIn(context, attendeeEmail);
  const main = inMain(page);

  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  // No form after the ceiling — the reason renders in its place, and the state follows it.
  await expect(main.getByRole("status")).toHaveText("انتهت هذه الجلسة");
  const award = awardIn(page);
  await expect(award).toContainText(`أُضيفت ${pointsPhrase(rulePoints)} إلى رصيدك`);
  await expect(award.getByRole("link", { name: "سجلّ نقاطك" })).toHaveAttribute("href", /\/ar\/app\/me\/points$/);
  await shoot(page, "wave12-checkin-check-in-paid", phone);

  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(main.getByText("حضرت", { exact: true })).toBeVisible();
  await expect(main.getByText(`أُضيفت ${pointsPhrase(rulePoints)} إلى رصيدك`)).toBeVisible();
  await shoot(page, "wave12-checkin-event-paid", phone);
});
