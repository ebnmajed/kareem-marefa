// The certificate mode on the schedule tab — DEC-256 (wave 27, the owner's ask), amending DEC-178's «SCR-045 only».
//
// What this proves against the real pages:
//   · an admin setting a session up on SCR-043 finds the mode in its «الشهادة» row, changes it with `page.click()`
//     alone — through SCR-045's own preflight — and the save is the mode's own (`set_session_certificate_mode()`);
//   · after a reload the schedule tab and the certificates tab both say the new mode — one writer, two places;
//   · exactly ONE `session.certificate_mode_changed` row is written.
//
// Captures at the project's width: wave27-sessions-schedule-certificate-mode-{1280,390}.png — the row after the save.
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
const REVIEW = /تُجهَّز وتبقى محجوزة حتى تُطلقها/;
const OFF = /لا شهادات لهذه الجلسة/;

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let bossEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave27-certmode-${tag}.example`;
  bossEmail = `boss@${domain}`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الشهادات', $1, 'CM', gen_random_uuid(), $2) returning id`,
    [`wave27-certmode-${tag}`, bossEmail],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'التخطيط') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ', 40) returning id`,
    [orgId],
  );
  const user = await admin.auth.admin.createUser({ email: bossEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف المؤسسة" } });
  if (user.error) throw user.error;
  userIds.push(user.data.user.id);
  await db.query(`insert into public.members (org_id, auth_user_id, email, display_name, org_role) values ($1, $2, $3, 'مشرف المؤسسة', 'admin')`, [orgId, user.data.user.id, bossEmail]);
  // A draft being set up, its certificates explicitly off — the state the owner found it in.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, certificate_mode)
     values ($1, 'جلسة تُجهَّز', 'جلسة عملية.', $2, 'introductory', now() + interval '7 days', 60, now() + interval '7 days 1 hour',
             $3, 30, 'draft', 'off')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const width = (page: Page) => (page.viewportSize()!.width >= 1000 ? 1280 : 390);

async function settle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("an admin sets the certificate mode on the schedule tab, and the certificates tab agrees", async ({ context, page }) => {
  await signIn(context, bossEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await settle(page);

  const group = main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { name: OFF })).toBeChecked();

  await group.getByRole("radio", { name: REVIEW }).click();
  await main(page).getByRole("button", { name: "احفظ الوضع" }).click();
  // SCR-045's preflight, unchanged: turning certificates on is confirmed.
  await page.getByRole("dialog").getByRole("button", { name: "ثبّت الوضع" }).click();
  await expect(page.getByText("حُفظ وضع الإصدار.", { exact: true })).toBeVisible();

  await page.reload();
  await settle(page);
  await expect(main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" }).getByRole("radio", { name: REVIEW })).toBeChecked();
  mkdirSync(SHOTS, { recursive: true });
  await main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, `wave27-sessions-schedule-certificate-mode-${width(page)}.png`) });

  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  await settle(page);
  await expect(main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" }).getByRole("radio", { name: REVIEW })).toBeChecked();

  const { rows } = await db.query<{ n: number; mode: string }>(
    `select (select count(*)::int from public.audit_log where subject_id = $1 and action = 'session.certificate_mode_changed') as n,
            (select certificate_mode::text from public.sessions where id = $1) as mode`,
    [sessionId],
  );
  expect(rows[0]).toEqual({ n: 1, mode: "review" });
});
