// The event page's own gates, asserted against the REAL rendered output —
// the lead's request at sync 1: everything `checkin` built is asserted at
// the matrix level (tests/unit/session-matrix.test.ts), and nothing yet
// asserted that the EVENT PAGE renders the right set. This is that test: a
// member with no seat sees no calendar button, no tasks heading and no
// check-in link on a live session with walk-ins off; a confirmed member sees
// all three. The one case that fails if someone later "simplifies" a gate
// away in `page.tsx` (16 §5.4.1, DEC-090, DEC-103).
//
// Same shape as checkin.spec.ts and session.spec.ts: a user minted through
// the local Auth admin API, provisioned through provision_member(), signed
// in with a captured cookie jar handed to the browser. Skipped when the
// local service key isn't provided — CI has no Supabase, the RLS suite and
// the unit matrix cover the logic there.
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
let liveSessionId = "";
let bystanderUserId = "";
let bystanderEmail = "";
let confirmedUserId = "";
let confirmedEmail = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `checkin-gating-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة بوابات الحضور', $1, 'CG', gen_random_uuid()) returning id`,
    [`checkin-gating-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة البوابات', 40) returning id`, [orgId]);

  // Live, walk-ins OFF (DEC-065's default) — a bystander must see none of the
  // three gated affordances; a confirmed member must see all three.
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة اختبار البوابات', 'ملخص الجلسة', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', $3, 40, 'in_progress', now() - interval '1 day', false)
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  liveSessionId = sessRows[0].id;

  bystanderEmail = `bystander@${domain}`;
  const { data: bystanderAuth, error: e1 } = await admin.auth.admin.createUser({ email: bystanderEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو بلا حجز" } });
  if (e1) throw e1;
  bystanderUserId = bystanderAuth.user.id;

  confirmedEmail = `confirmed@${domain}`;
  const { data: confirmedAuth, error: e2 } = await admin.auth.admin.createUser({ email: confirmedEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو محجوز" } });
  if (e2) throw e2;
  confirmedUserId = confirmedAuth.user.id;
});

test.afterAll(async () => {
  if (bystanderUserId) await admin.auth.admin.deleteUser(bystanderUserId);
  if (confirmedUserId) await admin.auth.admin.deleteUser(confirmedUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs in, provisions through the real RPC, and installs the resulting cookies. Returns the member id. */
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
  const memberId = (envelope as { member_id: string }).member_id;
  // The token captured by signInWithPassword() was minted BEFORE
  // provision_member() created the member row, so it carries no org claim
  // yet (the custom access token hook re-reads members on every mint,
  // refresh included) — a browser handed that cookie lands on /no-access.
  // Re-mint after provisioning, same as checkin.spec.ts's signIn().
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

test("a member with no seat, on a live session with walk-ins off, sees none of the three gated affordances", async ({ context, page }) => {
  await signIn(context, bystanderEmail);
  await page.goto(`/ar/app/sessions/${liveSessionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جلسة اختبار البوابات");

  // ★ DEC-090's own example: no calendar link for a viewer with no seat.
  // The calendar is ONE button over a menu since wave 6 (sessions, R-L7): no button at all.
  await expect(page.getByRole("button", { name: "أضِف إلى تقويمك" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "تقويم Google" })).toHaveCount(0);
  // §5.4.1a(b): the heading is gated WITH the panel — no empty "مهام ما قبل
  // الجلسة" left behind for a non-attendee.
  await expect(page.getByRole("heading", { name: "مهام ما قبل الجلسة" })).toHaveCount(0);
  // ★★ Bug (e), the worst of the five: no check-in link without a seat when
  // walk-ins are off.
  await expect(page.getByRole("link", { name: "تسجيل الحضور" })).toHaveCount(0);
});

test("a confirmed member sees the calendar, the tasks heading, and the check-in link on the same live session", async ({ context, page }) => {
  const memberId = await signIn(context, confirmedEmail);
  // reserve_seat() itself refuses a live session (16 §5.1's fix for ask 4) —
  // a direct insert is the only way to seed a confirmed RSVP made BEFORE the
  // session went live, exactly like the existing sessions in checkin.spec.ts.
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, liveSessionId, memberId]);

  await page.goto(`/ar/app/sessions/${liveSessionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جلسة اختبار البوابات");

  const calendar = page.getByRole("button", { name: "أضِف إلى تقويمك" });
  await expect(calendar).toBeVisible();
  await calendar.click();
  await expect(page.getByRole("menuitem", { name: "تقويم Google" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "مهام ما قبل الجلسة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "تسجيل الحضور" })).toBeVisible();
});
