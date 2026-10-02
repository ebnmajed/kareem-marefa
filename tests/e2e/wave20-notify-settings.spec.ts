// Wave 20 — SCR-029, /app/me/settings, built from `Settings.dc.html` (REQ-UIX-077, DEC-218 §2, DEC-219 §1).
//
// ★ The proof that every preference is still written, read back from the DATABASE after a reload: «إشعارات البريد» off
// stores email=false (and in-app on) for every optional category the member may hold and nothing for the three fixed
// ones; on again turns them all back on — the owner's accepted trade (M5); the visibility switch writes the opt-out.
// Captures at 390 px: `.qa-shots/rtl/wave20-notify-settings-<state>-390.png`, honouring `E2E_SHOTS_DIR`.
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
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let memberId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w20-settings-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الإشعارات', $1, 'ST', gen_random_uuid()) returning id`,
    [`w20-settings-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
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

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize()).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave20-notify-settings-${state}-390.png`), fullPage: true });
}

const OPTIONAL = ["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition", "proposals"];

const prefs = async () =>
  (
    await db.query<{ category: string; channel: string; enabled: boolean }>(
      `select category, channel, enabled from public.notification_preferences where member_id = $1 order by category, channel`,
      [memberId],
    )
  ).rows;

/** Flip a switch by its label — the input is the label's, drawn as a track (`ui/switch`). */
const flip = (page: Page, name: string) => page.locator("#main label", { hasText: name }).first().click();

test("default — every switch on, and the page as drawn", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me/settings");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { level: 1, name: "الإعدادات" })).toBeVisible();
  for (const s of await main.getByRole("switch").all()) await expect(s).toBeChecked();
  await expect(main.getByRole("switch", { name: "قائمة عمل المشرف" })).toHaveCount(0);
  await expect(main.getByText(email)).toBeVisible();
  await capture(page, "default");
});

test("★ «إشعارات البريد» off writes every optional category the member may hold — and never a fixed one", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me/settings");
  await flip(page, "إشعارات البريد");
  await expect.poll(async () => (await prefs()).filter((p) => p.channel === "email" && !p.enabled).map((p) => p.category).sort()).toEqual([...OPTIONAL].sort());
  const rows = await prefs();
  expect(rows.filter((p) => p.channel === "in_app").every((p) => p.enabled)).toBe(true);
  expect(rows.some((p) => ["certificates", "moderation", "account", "admin_queue"].includes(p.category))).toBe(false);

  await page.reload();
  const main = page.locator("#main");
  await expect(main.getByRole("switch", { name: "إشعارات البريد" })).not.toBeChecked();
  await expect(main.getByRole("switch", { name: "التذكيرات" })).not.toBeChecked();
  await capture(page, "email-off");
});

test("★ M5 — silencing one, then switching the master on, turns every category back on (the owner's accepted trade)", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me/settings");
  await flip(page, "إشعارات البريد");
  await expect.poll(async () => (await prefs()).filter((p) => p.channel === "email" && p.enabled).length).toBe(OPTIONAL.length);
  const main = page.locator("#main");
  await expect(main.getByRole("switch", { name: "إشعارات البريد" })).toBeChecked();

  await flip(page, "التعليقات والإشارات");
  await expect.poll(async () => (await prefs()).find((p) => p.category === "social" && p.channel === "email")?.enabled).toBe(false);
  await page.reload();
  await expect(main.getByRole("switch", { name: "إشعارات البريد" })).not.toBeChecked();

  await flip(page, "إشعارات البريد");
  await expect.poll(async () => (await prefs()).filter((p) => p.channel === "email" && p.enabled).length).toBe(OPTIONAL.length);
});

test("«الظهور في لوحات الصدارة» writes the opt-out (REQ-LDR-008)", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context);
  await page.goto("/ar/app/me/settings");
  await flip(page, "الظهور في لوحات الصدارة");
  const optOut = async () => (await db.query<{ v: boolean }>(`select leaderboard_opt_out v from public.members where id = $1`, [memberId])).rows[0].v;
  await expect.poll(optOut).toBe(true);
  await flip(page, "الظهور في لوحات الصدارة");
  await expect.poll(optOut).toBe(false);
});
