// SCR-015 — rate the session and the presenter (REQ-RAT-001 … REQ-RAT-003,
// REQ-RAT-006). Same shape as tests/e2e/session.spec.ts: real local
// Supabase, a service-role admin client plus raw pg to seed a completed,
// checked-in fixture (no UI path to check in yet — checkin's RPC lands
// separately — so the check-in row is inserted directly, the way the
// database's own triggers would produce it), a password sign-in with the
// resulting cookies installed in the browser context.
//
// This route has no dependency on `app/sessions/[id]/page.tsx` (still
// `sessions`'s work in progress) — it is a standalone screen, so this spec
// runs independently of that page landing.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let userId = "";
let email = "";
let completedSessionId = "";
let checkInId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();

  const tag = `rate-${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EE', gen_random_uuid()) returning id`,
    [`e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
  if (error) throw error;
  userId = data.user.id;

  const { rows: sessionRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة مكتملة للاختبار', 'ملخص الجلسة', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour', $3, 30, 'completed', now() - interval '3 days', now() - interval '2 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  completedSessionId = sessionRows[0].id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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
  expect(["provisioned", "member"]).toContain((envelope as { status: string }).status);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test("a member with no check-in cannot rate (REQ-RAT-001)", async ({ context, page }) => {
  await signIn(context);
  await page.goto(`/ar/app/sessions/${completedSessionId}/rate`);
  await expect(page.getByText("التقييم متاح لمن سجّل حضوره فقط")).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
});

test("a checked-in member rates the session and the presenter, and it is immediately reflected", async ({ context, page }) => {
  const { rows } = await db.query<{ id: string }>(`select id from public.members where auth_user_id = $1`, [userId]);
  const { rows: checkInRows } = await db.query<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار آلي', $3, tstzrange(now() - interval '3 days', now() - interval '2 days'))
     returning id`,
    [orgId, completedSessionId, rows[0].id],
  );
  checkInId = checkInRows[0].id;

  await signIn(context);
  await page.goto(`/ar/app/sessions/${completedSessionId}/rate`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("قيّم الجلسة");

  const groups = page.getByRole("radiogroup");
  await expect(groups).toHaveCount(2);
  await groups.nth(0).getByRole("radio", { name: "5" }).click();
  await groups.nth(1).getByRole("radio", { name: "4" }).click();
  await page.getByLabel("ملاحظات (اختياري)").fill("جلسة ممتازة، شكرًا");
  await page.getByRole("button", { name: "إرسال التقييم" }).click();

  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${completedSessionId}\\?rated=1$`));

  const { rows: ratingRows } = await db.query<{ session_stars: number; presenter_stars: number; comment: string; check_in_id: string }>(
    `select session_stars, presenter_stars, comment, check_in_id from public.ratings where session_id = $1`,
    [completedSessionId],
  );
  expect(ratingRows).toHaveLength(1);
  expect(ratingRows[0].session_stars).toBe(5);
  expect(ratingRows[0].presenter_stars).toBe(4);
  expect(ratingRows[0].comment).toBe("جلسة ممتازة، شكرًا");
  expect(ratingRows[0].check_in_id).toBe(checkInId);
});

test("once the rating exists, revisiting the page offers an edit, pre-filled", async ({ context, page }) => {
  await signIn(context);
  await page.goto(`/ar/app/sessions/${completedSessionId}/rate`);
  await expect(page.getByRole("button", { name: "تحديث التقييم" })).toBeVisible();
  const groups = page.getByRole("radiogroup");
  await expect(groups.nth(0).getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("ملاحظات (اختياري)")).toHaveValue("جلسة ممتازة، شكرًا");
});
