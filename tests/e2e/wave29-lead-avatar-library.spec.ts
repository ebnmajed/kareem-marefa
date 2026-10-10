// Wave 29, PR A — every member holds a library avatar (DEC-280 §1; REQ-PRF-014, REQ-PRF-015; STORY-PRF-008, 009).
//
// A member who has never chosen a picture signs in and sees their library avatar — not initials — on ملفي and in the
// shell's account menu; the image is the shipped SVG, same-origin; a leaderboard still draws initials. Real local
// Supabase, one org of its own. Captures land at `.qa-shots/rtl/wave29-lead-avatar-<state>-<390|1280>.png`, honouring
// `E2E_SHOTS_DIR`, beside `m10c/png/` and `avatars/png/`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `ava29-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'AVA', gen_random_uuid()) returning id`,
    [`مؤسسة الصور ${tag}`, `ava29-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العضو" } });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: memberEmail, password: PASSWORD });
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
  await page.waitForLoadState("networkidle");
  const width = page.viewportSize()!.width;
  await page.screenshot({ path: join(SHOTS, `wave29-lead-avatar-${state}-${width}.png`), fullPage: width > 400 ? false : true });
}

test("★ a new member is drawn as their library avatar on ملفي and in the shell, never initials", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  const memberId = await signIn(context);
  const { rows } = await db.query<{ avatar_key: string | null; avatar_source: string | null }>(`select avatar_key, avatar_source from public.members where id = $1`, [memberId]);
  const key = rows[0].avatar_key;
  expect(key, "provision_member's row holds a key at once").toMatch(/^(characters|objects)\/[a-z-]+$/);
  expect(rows[0].avatar_source).toBeNull();

  await page.goto("/ar/app/me");
  const main = page.locator("#main");
  // The hub draws a phone card and a desktop band; only one is shown at a width.
  const libraryImgs = main.locator(`img[src="/avatars/${key}.svg"]`).filter({ visible: true });
  await expect(libraryImgs.first()).toBeVisible();
  // The SVG actually loaded — a same-origin shipped file, not a 404 behind the initials.
  const served = await page.request.get(`/avatars/${key}.svg`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("image/svg+xml");
  await expect.poll(() => libraryImgs.first().evaluate((img: HTMLImageElement) => img.complete)).toBe(true);
  await capture(page, "me");

  // The shell's account menu draws the same key (the button is on the desktop bar).
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/me");
  await expect(page.locator(`header img[src="/avatars/${key}.svg"]`).filter({ visible: true }).first()).toBeVisible();
  await capture(page, "shell");
});

test("an anonymised member holds no key, and is initials", async () => {
  const { rows } = await db.query<{ id: string }>(`select id from public.members where org_id = $1 limit 1`, [orgId]);
  await db.query(
    `update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'e2e', anonymised_at = now() where id = $1`,
    [rows[0].id],
  );
  const { rows: after } = await db.query<{ avatar_key: string | null }>(`select avatar_key from public.members where id = $1`, [rows[0].id]);
  expect(after[0].avatar_key).toBeNull();
});
