// Wave 27 · REQ-CHK-019 (DEC-254 §6, DEC-255) — the check-in code stays fixed for the day, against real local
// Supabase. An org whose rotation is «لا يتغيّر» (null): the host view (SCR-016), SCR-044's code card and the member's
// check-in screen (SCR-014) show the one code and NO countdown, NO period and no sentence in their place; the code read
// again is the same code; a member checks in with it.
//
// ★ Needs the lead's migration (`drop not null` + the new `_issue_check_in_code()`, one file) — before it, the
// `update … set check_in_rotation_seconds = null` below is refused by the column's `not null`.
//
// Captures (`E2E_SHOTS_DIR`, default `.qa-shots/rtl`): wave27-checkin-{host,attendance,check-in}-rotation-off-{390,1280}.png
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
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
const emails: Record<"boss" | "reem", string> = { boss: "", reem: "" };
const userIds: string[] = [];

const main = (page: Page) => page.locator("#main");

async function memberClient(email: string) {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  await client.rpc("provision_member");
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// The width is the PROJECT's, never read back (wave 21's lesson: the phone project is 412 CSS px wide).
async function shoot(page: Page, surface: string) {
  const phone = test.info().project.name === "phone";
  await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 880 });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave27-checkin-${surface}-rotation-off-${phone ? 390 : 1280}.png`), fullPage: true });
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const tag = Math.random().toString(36).slice(2, 8);
  const domain = `wave27-fixed-${tag}.example`;
  emails.boss = `boss@${domain}`;
  emails.reem = `reem@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الرمز الثابت', $1, 'FX', gen_random_uuid(), $2) returning id`,
    [`wave27-fixed-${tag}`, emails.boss],
  );
  orgId = org[0].id;
  // ★ «لا يتغيّر» — REQ-CHK-019.
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`update public.org_settings set check_in_rotation_seconds = null where org_id = $1`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);

  for (const [who, name] of [
    ["boss", "عبدالله المشرف"],
    ["reem", "ريم الشهري"],
  ] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[who], password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const client = await memberClient(emails[who]);
    const { error: e } = await client.rpc("provision_member");
    if (e) throw e;
  }

  // Live now: began 20 minutes ago, ends in 40; walk-ins allowed, so the rules line has its one remaining sentence.
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'رمز اليوم الواحد', 'ملخص', $2, 'introductory', now() - interval '20 minutes', 60, now() + interval '40 minutes', $3, 30, 'in_progress', now() - interval '2 days', true)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

const ceilingOf = async () =>
  (await db.query<{ c: Date }>(`select public.check_in_ceiling(d.id) as c from public.session_days d where d.session_id = $1`, [sessionId])).rows[0].c;

test("SCR-016: one code, valid to the ceiling, and no countdown — the same code on a second read", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  const code = main(page).locator('p[dir="ltr"]').first();
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  const first = (await code.textContent())!;
  await expect(main(page).locator("[data-host-clock]")).toHaveCount(0);
  await expect(main(page)).not.toContainText("يتغيّر");
  await expect(main(page)).not.toContainText("الرمز السابق");
  await shoot(page, "host");

  const { rows } = await db.query<{ valid_until: Date }>(`select valid_until from public.check_in_codes where session_id = $1 and code = $2`, [sessionId, first]);
  expect(rows[0].valid_until.getTime()).toBe((await ceilingOf()).getTime());

  await page.reload();
  await expect(code).toHaveText(first);
  expect((await db.query(`select 1 from public.check_in_codes where session_id = $1`, [sessionId])).rowCount).toBe(1);
});

test("SCR-044's code card: the same code, no clock, no «يتغيّر بعد»", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  const card = main(page).getByRole("region", { name: "رمز الحضور" });
  const issued = (await db.query<{ code: string }>(`select code from public.check_in_codes where session_id = $1`, [sessionId])).rows[0].code;
  await expect(card.locator('p[dir="ltr"]')).toHaveText(issued);
  await expect(card.locator("[data-host-clock]")).toHaveCount(0);
  await expect(card).not.toContainText("يتغيّر بعد");
  await shoot(page, "attendance");
});

test("SCR-014: no period on the rules line; the member checks in with the day's code", async ({ context, page }) => {
  await signIn(context, emails.reem);
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(main(page)).toContainText("لا حاجة لحجز مسبق.");
  await expect(main(page)).not.toContainText("يتغيّر");
  await shoot(page, "check-in");

  const issued = (await db.query<{ code: string }>(`select code from public.check_in_codes where session_id = $1`, [sessionId])).rows[0].code;
  const reem = await memberClient(emails.reem);
  const { data, error } = await reem.rpc("check_in", { p_session: sessionId, p_code: issued });
  expect(error).toBeNull();
  expect((data as { status: string }).status).toBe("ok");
});
