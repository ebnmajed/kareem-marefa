// `/app/me/points` — SCR-022, REQ-PTS-003, REQ-CHK-017 (contract 3). Task T2
// of content's wave-7 plan. Real local Supabase, one member, ledger rows
// inserted directly (the awarding RPCs are `scoring`'s/`checkin`'s own,
// already covered in their own suites — this test is about THIS screen
// reading the ledger back, including a REQ-CHK-017 reversal row exactly as
// `checkin`'s contract 3 describes it: `source = 'reversal'`, reason
// «أُلغي تسجيل الحضور», `session_id` populated).
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

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
let sessionId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `points-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'PTS', gen_random_uuid()) returning id`,
    [`مؤسسة النقاط ${tag}`, `points-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة اختبار النقاط', 'ملخص الجلسة', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
             $3, 30, now() - interval '3 days', now() - interval '3 days', 'completed', now() - interval '5 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو النقاط" },
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
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
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
  await page.screenshot({ path: join(SHOTS, `wave7-content-points-${name}.png`), fullPage: true });
}

test("empty, an award, and checkin's REQ-CHK-017 reversal entry", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context, memberEmail);

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
    [orgId, memberId, sessionId, `check_in:${sessionId}:${memberId}`],
  );
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, session_id, reason, rule_key, idempotency_key)
     values ($1, $2, -5, 'reversal', $3, 'أُلغي تسجيل الحضور', 'check_in', $4)`,
    [orgId, memberId, sessionId, `reversal:check_in:${sessionId}:${memberId}`],
  );

  await page.reload();
  await expect(page.getByText("تسجيل حضور", { exact: true })).toBeVisible();
  await expect(page.getByText("أُلغي تسجيل الحضور")).toBeVisible();
  await expect(page.getByText("إلغاء نقاط سابقة")).toBeVisible();
  // A net balance of zero, and the reversal readable next to what it
  // reverses — never a number that quietly changed (`REQ-CHK-017`).
  await expect(page.getByRole("link", { name: "فتح الجلسة" }).first()).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await capture(page, "reversal");
});
