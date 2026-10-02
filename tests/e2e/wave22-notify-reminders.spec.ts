// SCR-060 — the job, walked (wave 22, `REQ-UIX-097`, `REQ-UIX-091`, `DEC-231` §0.1, `DEC-232` §1.3 and §3). An admin
// reads the reminders the org sends, presses «عدّل», switches the two-hour reminder off, sees one unsaved change, saves,
// and KNOWS IT SAVED: «حُفظ» from the server's receipt, then read mode with the mark — the time and the admin's name —
// read from the history row that save wrote. The custom offset the org already held shows read-only and survives.
//
// Captures (`E2E_SHOTS_DIR`): wave22-notify-060-read-1280.png · wave22-notify-060-edit-1280.png ·
// wave22-notify-060-saved-1280.png (desktop) · wave22-notify-060-read-390.png (phone)
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });
// `globals.css` scrolls smoothly unless motion is reduced, so a viewport
// capture taken after a scroll — ours or Playwright's own before a fill —
// fired mid-animation and showed the top of the page (the lead's sync-2
// finding on the scoring captures). Reduced motion makes every scroll instant.
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w22-reminders-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة التذكيرات 22', $1, 'RM', gen_random_uuid(), $2) returning id`,
    [`w22-reminders-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  // An org already holding a fourth, custom offset (3 days): it must show, read-only, and survive every save.
  await db.query(`insert into public.org_settings (org_id, reminder_offsets_minutes) values ($1, '{10080,1440,120,4320}')`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة التذكيرات"],
    [modEmail, "منظّم التذكيرات"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
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
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  if (email === modEmail) {
    await db.query(`update public.members set org_role = 'moderator' where id = $1`, [(data as { member_id: string }).member_id]);
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Waits out React's streamed Suspense boundaries before strict locators. */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("SCR-060 at 1280: read, «عدّل», one staged change, «احفظ», and the mark from the history row", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "the walk writes this org's schedule once, at desktop width");
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  const main = page.locator("#main");

  const table = main.getByRole("table", { name: "التذكيرات" });
  await expect(table.getByRole("row")).toHaveCount(6); // the header, three fixed rows, the prompt, the custom offset
  await expect(table).toContainText("3 أيام · رسالة عامة");
  await expect(table).toContainText("داخل التطبيق · بريد");
  // Read mode holds no control: «مفعّل» is a word, not a switch (DEC-232 §3.4).
  await expect(main.getByRole("switch")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-060-read-1280.png`, fullPage: true });

  await main.getByRole("link", { name: "عدّل" }).click();
  await expect(main.getByRole("heading", { name: "تعديل التذكيرات" })).toBeVisible();
  await expect(main.getByRole("button", { name: /^احفظ/ })).toBeDisabled();
  await main.getByRole("switch", { name: /مفعّل — التذكير قبل الجلسة بساعتين/ }).click({ force: true });
  await expect(main.getByText("تغيير واحد غير محفوظ")).toBeVisible();
  await expect(main.getByRole("switch", { name: /مفعّل \(معدّل\) — التذكير قبل الجلسة بساعتين/ })).not.toBeChecked();
  // Staged, never written: the database still holds the two-hour offset.
  const before = await db.query<{ o: number[] }>(`select reminder_offsets_minutes as o from public.org_settings where org_id = $1`, [orgId]);
  expect(before.rows[0].o).toEqual([10080, 1440, 120, 4320]);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-060-edit-1280.png`, fullPage: true });

  await main.getByRole("button", { name: /^احفظ/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /^حُفظ$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/reminders$/);
  await expect(main.getByText(/^✓✓ حُفظ · .+ · مشرفة التذكيرات$/)).toBeVisible();
  await expect(main.getByRole("table", { name: "التذكيرات" })).toContainText("متوقف");

  const { rows } = await db.query<{ o: number[] }>(`select reminder_offsets_minutes as o from public.org_settings where org_id = $1`, [orgId]);
  expect(rows[0].o).toEqual([10080, 1440, 4320]);
  // The record: one history row, the old and new arrays, this admin as the actor (REQ-TEN-008, REQ-ADM-023).
  const history = await db.query<{ old_value: number[]; new_value: number[]; display_name: string }>(
    `select h.old_value, h.new_value, m.display_name from public.scoring_config_history h join public.members m on m.id = h.actor_id
      where h.org_id = $1 and h.scope = 'org_settings' and h.field = 'reminder_offsets_minutes'`,
    [orgId],
  );
  expect(history.rows).toEqual([{ old_value: [10080, 1440, 120, 4320], new_value: [10080, 1440, 4320], display_name: "مشرفة التذكيرات" }]);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-060-saved-1280.png`, fullPage: true });
});

test("SCR-060 at 390: the same rows as cards, no sideways scroll", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 capture runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/reminders");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "التذكيرات", level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: "عدّل" })).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide, "SCR-060 must not scroll sideways at 390 px").toBe(false);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-060-read-390.png`, fullPage: true });
});
