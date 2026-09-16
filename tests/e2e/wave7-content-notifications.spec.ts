// `/app/me/notifications` — SCR-026, REQ-NTF-001, REQ-NTF-003, REQ-NTF-006.
// Task T6 of content's wave-7 plan. Real local Supabase, one member, one
// `notifications` row inserted directly. The default preference matrix
// (`getPreferenceMatrix`'s own rule: "absence means on") is what a member
// with no `notification_preferences` rows sees, so the matrix half needs no
// extra seeding — this proves the page's real defaults, not a fixture's.
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
  const domain = `notify-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'NTF', gen_random_uuid()) returning id`,
    [`مؤسسة الإشعارات ${tag}`, `notify-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الإشعارات" },
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
  await page.screenshot({ path: join(SHOTS, `wave7-content-notifications-${name}.png`), fullPage: true });
}

test("the inbox, an unread notification marked read, and the preference matrix's real defaults", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context, memberEmail);

  await db.query(
    `insert into public.notifications (org_id, member_id, key, payload) values ($1, $2, 'MSG-session_published', '{}'::jsonb)`,
    [orgId, memberId],
  );

  await page.goto("/ar/app/me/notifications");
  await expect(page.getByRole("heading", { name: "الإشعارات", level: 1 })).toBeVisible();
  await expect(page.getByText("جلسة جديدة")).toBeVisible();
  await expect(page.getByText("غير مقروء")).toBeVisible();
  await capture(page, "unread");

  await page.getByRole("button", { name: "تعليم كمقروء" }).click();
  await expect(page.getByText("غير مقروء")).toHaveCount(0);

  // «absence means on» — a member with no rows in notification_preferences
  // sees every switchable channel already enabled, straight from the DAL's
  // own default, not a seeded row.
  await page.locator("#preferences").scrollIntoViewIfNeeded();
  await expect(page.getByText("يصلك دائمًا")).toBeVisible();
  const onToggles = page.getByRole("button", { name: /مُفعّل$/ });
  await expect(onToggles.first()).toBeVisible();
  await capture(page, "preferences");
});
