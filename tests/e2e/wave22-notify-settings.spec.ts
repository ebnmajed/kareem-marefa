// SCR-063 — the job, walked (wave 22, `REQ-UIX-102`, `REQ-UIX-091`, `DEC-231` §0.1, `DEC-232` §3 and §5.1). An admin
// reads four titled cards, presses «عدّل», changes the name, adds a domain and raises a file limit, sees three unsaved
// changes, saves, and KNOWS IT SAVED: «حُفظ» from the server's receipt, then read mode with the mark — the time and the
// admin's name — read from the records that save wrote: one history row, `org.renamed`, `domain.added`. Then a stale
// page is refused at its field, never overwriting the other admin's value.
//
// ★ Needs `save_org_settings()` promoted from `supabase/proposed/notify/` and the lead's audit migration applied.
// Captures (`E2E_SHOTS_DIR`): wave22-notify-063-read-1280.png · wave22-notify-063-edit-1280.png ·
// wave22-notify-063-saved-1280.png (desktop) · wave22-notify-063-read-390.png (phone)
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `w22-settings-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الإعدادات 22', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`w22-settings-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الإعدادات"],
    [modEmail, "منظّم الإعدادات"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/**
 * Waits out React's streamed Suspense boundaries. While one streams, a
 * second copy of its content sits in `body > div#S:n[hidden]` for a few
 * hundred ms beside the copy already in `<main>`, and a strict locator
 * counts it. Same helper as `console.spec.ts`'s/`admin-moderation.spec.ts`'s.
 */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
test.use({ reducedMotion: "reduce" });

test("SCR-063 at 1280: four cards, «عدّل», three staged changes, «احفظ», and the mark from the records", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "the walk writes this org's settings once, at desktop width");
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/settings");
  const main = page.locator("#main");
  for (const title of ["المؤسسة", "الجلسات", "الخصوصية", "الربط"]) await expect(main.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  // Read mode holds no control (DEC-232 §3.4), and what nothing stores is absent, never invented.
  await expect(main.getByRole("textbox")).toHaveCount(0);
  await expect(main).not.toContainText("السعة الافتراضية");
  await expect(main).not.toContainText("تُحذف بعد سنتين");
  await page.screenshot({ path: `${SHOTS}/wave22-notify-063-read-1280.png`, fullPage: true });

  await main.getByRole("link", { name: "عدّل" }).click();
  await expect(main.getByRole("heading", { name: "تعديل الإعدادات" })).toBeVisible();
  await main.getByRole("textbox", { name: "الاسم" }).fill("مؤسسة الإعدادات الجديدة");
  await main.getByRole("textbox", { name: "أضف نطاقًا" }).fill("second-w22.example");
  await main.getByRole("spinbutton", { name: "المستندات (ميغابايت)" }).fill("60");
  await expect(main.getByText("3 تغييرات غير محفوظة")).toBeVisible();
  const before = await db.query<{ n: string }>(`select count(*) as n from public.scoring_config_history where org_id = $1`, [orgId]);
  expect(before.rows[0].n).toBe("0");
  await page.screenshot({ path: `${SHOTS}/wave22-notify-063-edit-1280.png`, fullPage: true });

  await main.getByRole("button", { name: /^احفظ/ }).click();
  await expect(page.getByRole("region", { name: /إشعار/ }).getByText("حُفظ", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/settings$/);
  await expect(main.getByText(/^✓✓ حُفظ · .+ · مشرفة الإعدادات$/)).toBeVisible();
  await expect(main).toContainText("second-w22.example");

  const history = await db.query<{ field: string; old_value: number; new_value: number }>(
    `select field, old_value, new_value from public.scoring_config_history where org_id = $1 and scope = 'org_settings'`,
    [orgId],
  );
  expect(history.rows).toEqual([{ field: "limit_document_mb", old_value: 50, new_value: 60 }]);
  const audit = await db.query<{ action: string }>(
    `select action from public.audit_log where org_id = $1 and action in ('org.renamed', 'domain.added') and actor_id is not null order by action`,
    [orgId],
  );
  expect(audit.rows.map((r) => r.action)).toEqual(["domain.added", "org.renamed"]);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-063-saved-1280.png`, fullPage: true });

  // A stale page: another admin changes the co-presenters while this one edits — refused at the field, not overwritten.
  // ★ The edit page must be OPEN before the other admin writes: a write that lands while «عدّل» is still navigating is
  // simply the value the page opens with — and saving over a value you were shown is not stale (it was this spec's red
  // on baec9578: the page opened at 7, the admin changed 7 → 2, correctly).
  await main.getByRole("link", { name: "عدّل" }).click();
  await expect(main.getByRole("spinbutton", { name: "المقدّمون المشاركون" })).toHaveValue("4");
  await db.query(`update public.org_settings set max_co_presenters = 7 where org_id = $1`, [orgId]);
  await main.getByRole("spinbutton", { name: "المقدّمون المشاركون" }).fill("2");
  await main.getByRole("button", { name: /^احفظ/ }).click();
  await expect(main.getByRole("alert").filter({ hasText: "لم تُحفظ الإعدادات" })).toBeVisible();
  await expect(main.getByRole("spinbutton", { name: /المقدّمون المشاركون/ })).toHaveAccessibleDescription("غيّر مشرف آخر هذا الحقل بعد فتحك الصفحة. افتحها من جديد.");
  const { rows } = await db.query<{ n: number }>(`select max_co_presenters as n from public.org_settings where org_id = $1`, [orgId]);
  expect(rows[0].n).toBe(7);
});

test("SCR-063 at 390: one column of cards, no sideways scroll", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 capture runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/settings");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "الإعدادات", level: 1 })).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide, "SCR-063 must not scroll sideways at 390 px").toBe(false);
  await page.screenshot({ path: `${SHOTS}/wave22-notify-063-read-390.png`, fullPage: true });
});
