// SCR-022 · /app/me/points against REAL local Supabase (STORY-PTS ledger
// stories, REQ-PTS-003). Same shape as tests/e2e/checkin.spec.ts: a user
// minted through the local Auth admin API, provisioned through
// provision_member(), signed in with a captured cookie jar handed to the
// browser. Skipped when the local service key isn't provided (CI has no
// Supabase; the RLS suite covers the database there).
//
// Needs supabase/proposed/scoring/*.sql promoted into supabase/migrations/
// first — the lead does that at a sync point.
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let memberUserId = "";
let memberEmail = "";
let memberId = "";
let sessionId = "";
let sessionTitle = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // desktop and phone share one database (TEAM.md §5's trap) — a tag by
  // time alone can collide when both workers hit beforeAll in the same
  // millisecond, which is exactly what happened once here.
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `points-e2e-${tag}.example`;
  sessionTitle = `جلسة النقاط ${tag}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة نقاط الاختبار', $1, 'PE', gen_random_uuid()) returning id`,
    [`points-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  // No numeral setting exists (DEC-124): the amounts below are Western digits
  // although the locale is `ar`, whose CLDR default would be Arabic-Indic.
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
     values ($1, $2, 'ملخص الجلسة', $3, 'introductory', now() - interval '3 hours', 60, now() - interval '2 hours', $4, 40, 'completed', now() - interval '1 day', now() - interval '2 hours')
     returning id`,
    [orgId, sessionTitle, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  memberEmail = `member@${domain}`;
  const { data: memberAuth, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو النقاط" } });
  if (error) throw error;
  memberUserId = memberAuth.user.id;
});

test.afterAll(async () => {
  if (memberUserId) await admin.auth.admin.deleteUser(memberUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Same shape as checkin.spec.ts's signIn: role changes happen BEFORE the
 * final refreshSession(), because the custom access token hook re-reads
 * `members` on every mint including a refresh — so the cookies handed to
 * the browser already carry the right role. Returns the client too, so a
 * caller can make one more authenticated RPC call before addCookies. */
async function signIn(context: BrowserContext, email: string, asAdmin: boolean): Promise<{ memberId: string; client: ReturnType<typeof createServerClient> }> {
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
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [id]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return { memberId: id, client };
}

test("a member reads their whole points history and can explain every point without asking anyone (REQ-PTS-003)", async ({ context, page }) => {
  // asAdmin: harmless for what this test checks (any member reads their own
  // history the same way) and lets the same signed-in client call the
  // admin-gated adjust_points_manually() RPC on itself before the browser's
  // cookies are minted (assert_fresh_admin() reads the JWT's own org_role
  // claim, not a fresh table lookup — the client-side session must already
  // carry it).
  const signedIn = await signIn(context, memberEmail, true);
  memberId = signedIn.memberId;

  // A real check-in row, then exactly what worker/src/tasks/award_points.ts
  // would run for it — this proves the SCREEN reads the real schema, not a
  // fixture shaped to match it.
  const { rows: checkInRows } = await db.query<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $3, 'empty'::tstzrange) returning id`,
    [orgId, sessionId, memberId],
  );
  await db.query(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [memberId, checkInRows[0].id, sessionId]);

  // A manual adjustment with its own admin-written reason.
  const { error: adjustError } = await signedIn.client.rpc("adjust_points_manually", {
    p_member: memberId,
    p_amount: 5,
    p_reason: "مكافأة تشجيعية للاختبار",
  });
  if (adjustError) throw adjustError;

  await page.goto("/ar/app/me/points");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("نقاطي");

  // Scoped to the history list, not the catalogue below it — the catalogue
  // repeats check_in's own reasonAr as its "what earns points" row, which
  // would otherwise match the same text.
  const history = page.locator("#history");

  // The check-in award: reason, amount, and a link to the session it came from.
  const checkInRow = history.locator("li", { hasText: "تسجيل حضور مؤكَّد" });
  await expect(checkInRow).toContainText("+20");
  await expect(checkInRow.getByText(sessionTitle)).toBeVisible();
  await expect(checkInRow.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);

  // The manual adjustment: its own admin-written reason, tagged as manual.
  const manualRow = history.locator("li", { hasText: "مكافأة تشجيعية للاختبار" });
  await expect(manualRow).toContainText("+5");
  await expect(manualRow).toContainText("تعديل يدوي من الإدارة");

  // The running balance reconciles to points_balances (25 = 20 + 5).
  await expect(page.getByText(/رصيدك/)).toContainText("25");

  // "What earns what" is read live from scoring_rules — check_in's default appears.
  await expect(page.getByRole("heading", { name: "ماذا يمنحك نقاطًا؟" })).toBeVisible();
  const catalogueRow = page.locator("#catalogue").locator("li", { hasText: "تسجيل حضور مؤكَّد" });
  await expect(catalogueRow).toContainText("نقطة");
});

test("filtering by session narrows the history to that session's rows", async ({ context, page }) => {
  await signIn(context, memberEmail, false);
  await page.goto(`/ar/app/me/points?session=${sessionId}`);
  await expect(page.locator("li")).not.toHaveCount(0);
  await expect(page.getByRole("link", { name: "مسح التصفية" })).toBeVisible();
});

// wave-7, task T2 (`docs/plan/notes/content.md`): the M9 restyle, an empty
// state, and `checkin`'s REQ-CHK-017 reversal entry — its own org/session/
// member, isolated from the fixture above by `describe`'s own scope, so
// this reads only what it seeds. `capture()`'s naming (`wave7-content-*`)
// is the wave-7 measure's own convention, distinct from the file's older
// `review()` helper above.
test.describe("M9 restyle: empty state and the reversal entry", () => {
  const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
  const PHONE_R = { width: 390, height: 844 };

  let rOrgId = "";
  let rMemberEmail = "";
  let rMemberId = "";
  let rSessionId = "";
  const rUserIds: string[] = [];

  test.beforeAll(async ({}, testInfo) => {
    const tag = `${testInfo.workerIndex}-${Date.now()}-r`;
    const rDomain = `points-reversal-e2e-${tag}.example`;

    const { rows: orgRows } = await db.query<{ id: string }>(
      `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'PTR', gen_random_uuid()) returning id`,
      [`مؤسسة النقاط ٢ ${tag}`, `points-reversal-e2e-${tag}`],
    );
    rOrgId = orgRows[0].id;
    await db.query(`insert into public.org_settings (org_id) values ($1)`, [rOrgId]);
    await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rOrgId, rDomain]);
    const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [rOrgId]);
    const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [rOrgId]);
    const { rows: sessRows } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
       values ($1, 'جلسة اختبار الإلغاء', 'ملخص الجلسة', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
               $3, 30, now() - interval '3 days', now() - interval '3 days', 'completed', now() - interval '5 days')
       returning id`,
      [rOrgId, catRows[0].id, venueRows[0].id],
    );
    rSessionId = sessRows[0].id;

    rMemberEmail = `member@${rDomain}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: rMemberEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "عضو الإلغاء" },
    });
    if (error) throw error;
    rUserIds.push(data.user.id);
  });

  test.afterAll(async () => {
    for (const id of rUserIds) await admin.auth.admin.deleteUser(id);
    if (rOrgId) await db.query(`delete from public.orgs where id = $1`, [rOrgId]);
  });

  async function capture(page: Page, name: string) {
    mkdirSync(SHOTS, { recursive: true });
    expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE_R);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: join(SHOTS, `wave7-content-points-${name}.png`), fullPage: true });
  }

  test("empty, then an award and checkin's REQ-CHK-017 reversal entry, contract 3 exactly", async ({ context, page }) => {
    await page.setViewportSize(PHONE_R);
    const signedIn = await signIn(context, rMemberEmail, false);
    rMemberId = signedIn.memberId;

    await page.goto("/ar/app/me/points");
    await expect(page.getByRole("heading", { name: "نقاطي", level: 1 })).toBeVisible();
    await expect(page.getByText("لا نقاط بعد")).toBeVisible();
    await capture(page, "empty");

    // The award, then checkin's REQ-CHK-017 reversal of it — exactly the
    // shape contract 3 describes: `source = 'reversal'`, the fixed reason,
    // `session_id` populated so the "open session" link still works on it.
    await db.query(
      `insert into public.points_ledger (org_id, member_id, amount, source, session_id, reason, rule_key, idempotency_key)
       values ($1, $2, 5, 'check_in', $3, 'تسجيل حضور', 'check_in', $4)`,
      [rOrgId, rMemberId, rSessionId, `check_in:${rSessionId}:${rMemberId}`],
    );
    await db.query(
      `insert into public.points_ledger (org_id, member_id, amount, source, session_id, reason, rule_key, idempotency_key)
       values ($1, $2, -5, 'reversal', $3, 'أُلغي تسجيل الحضور', 'check_in', $4)`,
      [rOrgId, rMemberId, rSessionId, `reversal:check_in:${rSessionId}:${rMemberId}`],
    );

    await page.reload();
    await expect(page.getByText("تسجيل حضور", { exact: true })).toBeVisible();
    await expect(page.getByText("أُلغي تسجيل الحضور")).toBeVisible();
    await expect(page.getByText("إلغاء نقاط سابقة")).toBeVisible();
    // The reversal readable next to what it reverses — never a number that
    // quietly changed (`REQ-CHK-017`).
    await expect(page.getByRole("link", { name: "فتح الجلسة" }).first()).toHaveAttribute("href", `/ar/app/sessions/${rSessionId}`);
    await capture(page, "reversal");
  });
});
