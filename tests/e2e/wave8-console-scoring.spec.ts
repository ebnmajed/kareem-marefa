// SCR-053 · /app/admin/scoring on the M9 system (wave 8, K5) — REQ-PTS-004 …
// 010, REQ-ADM-011, against REAL local Supabase. The fixed catalogue in three
// groups with the deductions closed at 0; a deduction set by its cost and
// stored negative; a rule refused at the field; a manual adjustment chosen by
// member, confirmed by name, and written to the ledger; the history in words;
// the moderator's not-found (REQ-ADM-020, DEC-134).
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-console-scoring-catalogue.png
//   wave8-console-scoring-penalties.png
//   wave8-console-scoring-rule-dialog-error.png
//   wave8-console-scoring-member-picker-open.png
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

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
let memberEmail = "";
let memberId = "";
const userIds: string[] = [];

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w8-scoring-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  memberEmail = `member@${domain}`;
  // The org insert seeds its catalogue (`orgs_seed_scoring`, `0083`).
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة النقاط', $1, 'SC', gen_random_uuid(), $2) returning id`,
    [`w8-scoring-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة النقاط"],
    [modEmail, "منظّم النقاط"],
    [memberEmail, "سارة العتيبي"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  memberId = await provision(memberEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [await provision(modEmail)]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

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

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const group = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const shown = (page: Page, locator: ReturnType<Page["locator"]>) => locator.filter({ visible: true });

test("a moderator gets the streamed not-found page, not the catalogue (REQ-ADM-020, DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/scoring");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "كتالوج النقاط" })).toHaveCount(0);
});

test("SCR-053: the fixed catalogue in three groups, the deductions closed at 0, and no reservation or reaction", async ({ context, page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/scoring");
  await expect(page.getByRole("heading", { name: "للحاضرين" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "للمُقدِّمين" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الخصومات" })).toBeVisible();
  const penalties = group(page, "penalty-heading");
  await expect(shown(page, penalties.getByText("تغيّب بعد الحجز", { exact: true }))).toBeVisible();
  // «يظهر للعضو» appears only where the member's wording differs from the
  // rule's name (the a4d2886 run found «تغيّب بعد الحجز» twice). The seed
  // (`_seed_org_scoring`, 0083) words two deductions differently on purpose —
  // the name is the action, the member reads what happened to them.
  const entry = (name: string) => shown(page, penalties.locator("tr, li").filter({ hasText: name }));
  await expect(entry("تغيّب بعد الحجز")).not.toContainText("يظهر للعضو");
  await expect(entry("إلغاء متأخر")).not.toContainText("يظهر للعضو");
  await expect(entry("حذف تعليق")).toContainText("يظهر للعضو: حُذف تعليق");
  await expect(entry("حذف صورة")).toContainText("يظهر للعضو: حُذفت صورة");
  await expect(shown(page, penalties.getByText("لا خصم", { exact: true })).first()).toBeVisible();
  await expect(shown(page, penalties.getByText("مغلق", { exact: true })).first()).toBeVisible();
  await expect(page.getByText("الحجز", { exact: true })).toHaveCount(0);

  if (testInfo.project.name === "phone") {
    await page.getByRole("heading", { name: "كتالوج النقاط" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/wave8-console-scoring-catalogue.png` });
    await page.getByRole("heading", { name: "الخصومات" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${SHOTS}/wave8-console-scoring-penalties.png` });
  }
});

test("REQ-PTS-008: a deduction is set by its cost, stored negative, and the history names it", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's catalogue");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/scoring");
  await page.getByRole("button", { name: "عدّل: تغيّب بعد الحجز" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل «تغيّب بعد الحجز»" });
  await dialog.getByLabel("مقدار الخصم", { exact: false }).fill("3");
  await dialog.getByRole("button", { name: "احفظ القاعدة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظت القاعدة" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const { rows } = await db.query<{ points: number }>(`select points from public.scoring_rules where org_id = $1 and action_key = 'no_show'`, [orgId]);
  expect(rows[0].points).toBe(-3);
  await expect(shown(page, group(page, "penalty-heading").getByText("خصم 3 نقاط", { exact: true }))).toBeVisible();
  const history = group(page, "history-heading");
  await expect(shown(page, history.getByText("تغيّب بعد الحجز", { exact: true })).first()).toBeVisible();
  await expect(shown(page, history.getByText("مشرفة النقاط", { exact: true })).first()).toBeVisible();
  // `version` changes on every save and is never shown as a change of its own.
  await expect(history.getByText("version", { exact: false })).toHaveCount(0);
});

test("SCR-053 at 390 px: a rule refused at the field, inside its dialog", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/scoring");
  await page.getByRole("button", { name: "عدّل: تعليق" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل «تعليق»" });
  await dialog.getByLabel("النقاط", { exact: false }).first().fill("1500");
  await dialog.getByRole("button", { name: "احفظ القاعدة" }).click();
  await expect(dialog.getByRole("alert")).toContainText("لم تُحفظ القاعدة");
  await expect(dialog.getByText("من صفر إلى ألف.", { exact: true }).last()).toBeVisible();
  const { rows } = await db.query<{ points: number }>(`select points from public.scoring_rules where org_id = $1 and action_key = 'comment'`, [orgId]);
  expect(rows[0].points).toBe(2);
  await page.screenshot({ path: `${SHOTS}/wave8-console-scoring-rule-dialog-error.png` });
});

test("REQ-PTS-009: a manual adjustment — member chosen by name, confirmed by name and amount, written to the ledger", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one project writes this member's ledger; the picker capture is the phone's");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/scoring");
  const manual = group(page, "manual-heading");
  await manual.getByRole("combobox", { name: /العضو/ }).fill("سارة");
  await expect(page.getByRole("option", { name: /سارة العتيبي/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave8-console-scoring-member-picker-open.png` });
  await page.getByRole("option", { name: /سارة العتيبي/ }).click();
  await manual.getByRole("radio", { name: "خصم نقاط" }).check();
  await manual.getByLabel("عدد النقاط", { exact: false }).fill("5");
  await manual.getByLabel("السبب", { exact: false }).fill("تصحيح منحة مكررة");
  await manual.getByRole("button", { name: "نفّذ التعديل" }).click();

  const confirm = page.getByRole("dialog", { name: "خصم 5 نقاط من «سارة العتيبي»؟" });
  await expect(confirm).toContainText("السبب: تصحيح منحة مكررة");
  await confirm.getByRole("button", { name: "أكّد التعديل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "نُفِّذ التعديل" })).toBeVisible();

  const { rows } = await db.query<{ amount: number; reason: string; source: string }>(`select amount, reason, source from public.points_ledger where member_id = $1`, [memberId]);
  expect(rows).toEqual([{ amount: -5, reason: "تصحيح منحة مكررة", source: "manual_adjustment" }]);
});
