// `/app/me/calendar` — SCR-025, REQ-CAL-003, REQ-CAL-005, REQ-CAL-007. Task
// T5 of content's wave-7 plan. Real local Supabase, one member, a
// `calendar_connections` row and a `calendar_events` row inserted directly
// (the OAuth flow and the worker's own sync are out of scope for a screen
// review — this proves the SCREEN, not the pipeline).
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
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `calendar-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'CAL', gen_random_uuid()) returning id`,
    [`مؤسسة التقويم ${tag}`, `calendar-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة متزامنة', 'ملخص الجلسة', $2, 'introductory', now() + interval '2 days', 60, now() + interval '2 days' + interval '1 hour',
             $3, 30, now() + interval '1 day', now() + interval '1 day', 'published', now() - interval '1 day')`,
    [orgId, catRows[0].id, venueRows[0].id],
  );

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو التقويم" },
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
  await page.screenshot({ path: join(SHOTS, `wave7-content-calendar-${name}.png`), fullPage: true });
}

test("not connected, then connected with a synced session — never a token in sight", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context, memberEmail);

  await page.goto("/ar/app/me/calendar");
  await expect(page.getByRole("heading", { name: "التقويم", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "اربط تقويم Google" })).toHaveAttribute("href", "/api/calendar/connect");
  await capture(page, "not-connected");

  const { rows: sessRows } = await db.query<{ id: string }>(`select id from public.sessions where org_id = $1 limit 1`, [orgId]);
  const sessionId = sessRows[0].id;
  await db.query(
    `insert into public.calendar_connections (org_id, member_id, access_token_encrypted, refresh_token_encrypted, scope)
     values ($1, $2, 'enc-access', 'enc-refresh', 'https://www.googleapis.com/auth/calendar.events')`,
    [orgId, memberId],
  );
  await db.query(
    `insert into public.calendar_events (org_id, member_id, session_id, state, last_synced_at)
     values ($1, $2, $3, 'synced', now())`,
    [orgId, memberId, sessionId],
  );

  await page.reload();
  await expect(page.getByRole("button", { name: "افصل التقويم" })).toBeVisible();
  await expect(page.getByText("جلسة متزامنة")).toBeVisible();
  // The DAL's own grant excludes every token column (0026) — nothing this
  // page could render even by accident. A structural check, not decoration.
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("enc-access");
  expect(bodyText).not.toContain("enc-refresh");
  await capture(page, "connected");
});
