// SCR-026 · /app/me/notifications and SCR-025 · /app/me/calendar against REAL
// local Supabase (STORY-NTF-002, STORY-NTF-004, STORY-CAL-002, STORY-CAL-004).
//
// Same shape as tests/e2e/points.spec.ts: a user minted through the local
// Auth admin API, provisioned through provision_member(), signed in with a
// captured cookie jar handed to the browser. Skipped when the local service
// key is absent (CI has no Supabase; the RLS suite covers the database there).
//
// Needs supabase/proposed/notify/*.sql promoted into supabase/migrations/ —
// the lead does that at a sync point.
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

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let memberUserId = "";
let memberEmail = "";
let memberId = "";
let sessionId = "";
let sessionTitle = "";

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}`;
  domain = `notify-e2e-${tag}.example`;
  sessionTitle = `جلسة الإشعارات ${tag}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الإشعارات', $1, 'NE', gen_random_uuid()) returning id`,
    [`notify-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الإشعارات', 40) returning id`,
    [orgId],
  );

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'ملخص الجلسة', $3, 'introductory', now() + interval '30 days', 60, now() + interval '30 days' + interval '1 hour', $4, 40, 'published', now())
     returning id`,
    [orgId, sessionTitle, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  memberEmail = `member@${domain}`;
  const { data: memberAuth, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الإشعارات" },
  });
  if (error) throw error;
  memberUserId = memberAuth.user.id;
});

test.afterAll(async () => {
  if (memberUserId) await admin.auth.admin.deleteUser(memberUserId);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (envelope as { member_id: string }).member_id;
}

test("SCR-026 — the member reads their inbox, marks one read, and switches a category off (REQ-NTF-003, REQ-NTF-006)", async ({ context, page }) => {
  memberId = await signIn(context, memberEmail);

  // Real notifications, through the real door: public.notify() is the only
  // way anything lands in the inbox, so the screen is read against what the
  // product actually writes rather than against a shaped fixture.
  await db.query(`select public.notify($1, $2, 'my_sessions', jsonb_build_object('session_id', $3::uuid, 'title', $4), 'MSG-rsvp_confirmed')`, [
    orgId,
    memberId,
    sessionId,
    sessionTitle,
  ]);
  await db.query(`select public.notify($1, $2, 'recognition', '{}'::jsonb, 'MSG-badge_earned')`, [orgId, memberId]);

  await page.goto("/ar/app/me/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("الإشعارات");

  const seatRow = page.locator("li", { hasText: "تأكّد مقعدك" });
  await expect(seatRow.getByText(sessionTitle)).toBeVisible();
  await expect(seatRow.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);

  // Marking one read leaves the other unread, and the count the bell reads
  // comes from the database rather than from anything client-side.
  await seatRow.getByRole("button", { name: "تعليم كمقروء" }).click();
  await expect(page.locator("li", { hasText: "تأكّد مقعدك" }).getByRole("button", { name: "تعليم كمقروء" })).toHaveCount(0);
  const { rows: unread } = await db.query<{ n: string }>(`select count(*) n from public.notifications where member_id = $1 and read_at is null`, [memberId]);
  expect(unread[0].n).toBe("1");

  // The preference matrix: switching `reminders` off on email stores exactly
  // one row, on that channel only.
  const remindersEmail = page.getByRole("button", { name: "التذكيرات — البريد الإلكتروني — مُفعّل" });
  await remindersEmail.click();
  await expect(page.getByRole("status")).toContainText("حُفظت تفضيلاتك");
  const { rows: prefs } = await db.query<{ category: string; channel: string; enabled: boolean }>(
    `select category, channel, enabled from public.notification_preferences where member_id = $1`,
    [memberId],
  );
  expect(prefs).toEqual([{ category: "reminders", channel: "email", enabled: false }]);

  // And the send path agrees with the screen: the same preference the member
  // just set is what notification_send_context() reports.
  const { rows: ctx } = await db.query<{ ctx: { email_allowed: boolean; in_app_allowed: boolean } }>(
    `select public.notification_send_context($1, $2, 'MSG-reminder_1d') as ctx`,
    [orgId, memberId],
  );
  expect(ctx[0].ctx.email_allowed).toBe(false);
  expect(ctx[0].ctx.in_app_allowed).toBe(true);
});

test("SCR-026 — the three not-switchable categories render as a statement with a reason, not a dead toggle (08 §2)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/me/notifications");

  for (const [name, why] of [
    ["الشهادات", "شهادة صدرت باسمك"],
    ["إشعارات الإشراف", "ما أُزيل دون علمك"],
    ["الحساب", "تغيّر في حسابك"],
  ] as const) {
    const row = page.locator("li", { hasText: name });
    await expect(row).toContainText("يصلك دائمًا");
    await expect(row).toContainText(why);
    // No toggle at all, rather than one that silently does nothing.
    await expect(row.getByRole("button")).toHaveCount(0);
  }

  // A switchable category that still holds non-optional messages says which.
  await expect(page.locator("li", { hasText: "جلساتي" })).toContainText("بعض إشعارات هذا النوع تصلك مهما كان الإعداد");
});

test("REQ-CAL-001 — the ICS downloads as UTF-8 text/calendar, folded at 75 octets", async ({ context, page }) => {
  await signIn(context, memberEmail);

  const response = await page.request.get(`/api/sessions/${sessionId}/ics`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  expect(response.headers()["content-type"]).toContain("charset=utf-8");
  expect(response.headers()["content-disposition"]).toContain("filename*=UTF-8''");

  const body = await response.text();
  expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(body).toContain("TZID:Asia/Riyadh");
  // The requirement, over the wire: every physical line within 75 OCTETS,
  // and the Arabic title intact once unfolded.
  for (const line of body.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  expect(body.replace(/\r\n /g, "")).toContain(`SUMMARY:${sessionTitle}`);
});

test("SCR-025 — the calendar screen offers a connection and never renders a token (REQ-CAL-003, A33)", async ({ context, page }) => {
  const id = await signIn(context, memberEmail);

  await page.goto("/ar/app/me/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("التقويم");
  await expect(page.getByRole("link", { name: "اربط تقويم Google" })).toHaveAttribute("href", "/api/calendar/connect");
  await expect(page.getByText("لا جلسات متزامنة بعد")).toBeVisible();

  // A connection with real-looking tokens, stored through the same RPC the
  // OAuth callback uses.
  await db.query(
    `insert into public.calendar_connections (org_id, member_id, provider, access_token_encrypted, refresh_token_encrypted, expires_at, scope)
     values ($1, $2, 'google', 'ya29.SECRET-ACCESS-TOKEN', '1//SECRET-REFRESH-TOKEN', now() + interval '1 hour', 'calendar.events')`,
    [orgId, id],
  );
  await db.query(`select public.record_calendar_sync($1, $2, $3, 'failed', 'goog_1', 'rateLimitExceeded')`, [orgId, id, sessionId]);

  await page.goto("/ar/app/me/calendar");
  await expect(page.getByRole("button", { name: "افصل التقويم" })).toBeVisible();
  // REQ-CAL-005: the failure is surfaced to the member, with the reassurance
  // that REQ-CAL-008 makes true.
  const synced = page.locator("li", { hasText: sessionTitle });
  await expect(synced).toContainText("تعذّرت المزامنة");
  await expect(synced).toContainText("حجزك قائم في كل الأحوال");

  // A33 / REQ-CAL-003: no token, anywhere on the page, in any form.
  const html = await page.content();
  expect(html).not.toContain("ya29.SECRET-ACCESS-TOKEN");
  expect(html).not.toContain("SECRET-REFRESH-TOKEN");
  expect(html).not.toContain("access_token");
});

test("REQ-CAL-007 — disconnecting deletes the tokens immediately and tells the member", async ({ context, page }) => {
  const id = await signIn(context, memberEmail);

  await page.goto("/ar/app/me/calendar");
  await page.getByRole("button", { name: "افصل التقويم" }).click();
  await expect(page.getByRole("status")).toContainText("لن تتحدّث بعد الآن");

  // Deleted, not flagged. Outside the retention schedule entirely.
  const { rows } = await db.query(`select id from public.calendar_connections where member_id = $1`, [id]);
  expect(rows).toHaveLength(0);
  const { rows: notices } = await db.query<{ key: string }>(
    `select key from public.notifications where member_id = $1 and key = 'MSG-calendar_disconnected'`,
    [id],
  );
  expect(notices).toHaveLength(1);
});
