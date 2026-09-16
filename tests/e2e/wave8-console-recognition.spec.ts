// SCR-054 · /app/admin/recognition on the M9 system (wave 8, K4) — REQ-ADM-012,
// REQ-REC-001 … 008, REQ-CRT-012, against REAL local Supabase. Held
// achievement certificates first, released after a confirmation that counts
// them; a badge created with its rule, and retired after a confirmation; a
// level threshold refused out of order; a badge already held said at the
// member, and no award or audit row written for it; the moderator's not-found.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave8-console-recognition-held.png
//   wave8-console-recognition-release-confirm.png
//   wave8-console-recognition-award-already-held.png
import { randomBytes, randomUUID } from "node:crypto";
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
let reemId = "";
const certIds: string[] = [];
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w8-recognition-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  const reemEmail = `reem@${domain}`;
  // The org insert seeds its badges, levels, streak and perks (`0083`).
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة التكريم', $1, 'RC', gen_random_uuid(), $2) returning id`,
    [`w8-recognition-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة التكريم"],
    [modEmail, "منظّم التكريم"],
    [reemEmail, "ريم القحطاني"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const adminId = await provision(adminEmail);
  reemId = await provision(reemEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [await provision(modEmail)]);

  // Two held achievement certificates for «مُقدِّم مُقيَّم», arranged directly —
  // issuing is `designer`'s, proven there; this screen releases. The template
  // version is read by query, never pinned, since `designer` re-seeds the
  // library this wave (DEC-128).
  const [{ id: badgeId }] = (await db.query<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'rated_presenter'`, [orgId])).rows;
  const [{ id: versionId }] = (
    await db.query<{ id: string }>(
      `select v.id from public.design_template_versions v join public.design_templates t on t.id = v.template_id where t.purpose = 'certificate' order by v.published_at desc nulls last limit 1`,
    )
  ).rows;
  for (const [i, [memberId, name]] of ([
    [reemId, "ريم القحطاني"],
    [adminId, "مشرفة التكريم"],
  ] as const).entries()) {
    const { rows: cert } = await db.query<{ id: string }>(
      `insert into public.certificates (org_id, member_id, kind, badge_id, serial, verification_code, state, template_version_id, recipient_name_snapshot)
       values ($1, $2, 'achievement', $3, $4, $5, 'held', $6, $7) returning id`,
      [orgId, memberId, badgeId, `RC-2026-00000${i + 1}`, randomBytes(18).toString("base64url"), versionId, name],
    );
    certIds.push(cert[0].id);
  }
  // Reem already holds «حاضر دائم».
  await db.query(`insert into public.member_badges (org_id, member_id, badge_id) select $1, $2, id from public.badges where org_id = $1 and key = 'regular'`, [orgId, reemId]);
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

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const group = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);

test("a moderator gets the streamed not-found page (REQ-ADM-020, DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/recognition");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الشارات" })).toHaveCount(0);
});

test("REQ-CRT-012 at 390 px: held certificates first, released after a confirmation that counts them", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one project releases this org's certificates; the captures are the phone's");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/recognition");
  const held = group(page, "held-heading");
  await expect(held.getByRole("heading", { name: /شهادات إنجاز بانتظار الإطلاق/ })).toBeVisible();
  const cards = held.getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("شارة «مُقدِّم مُقيَّم»");
  await held.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-recognition-held.png` });

  for (const card of await cards.all()) await card.getByRole("checkbox").check();
  await held.getByRole("button", { name: "أطلِق المحدَّدة" }).filter({ visible: true }).click();
  const confirm = page.getByRole("dialog", { name: "إطلاق شهادتين؟" });
  await expect(confirm).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave8-console-recognition-release-confirm.png` });
  await confirm.getByRole("button", { name: "أطلِق الشهادات" }).click();
  await expect(page.getByRole("status").filter({ hasText: "أُطلقت شهادتان" })).toBeVisible();

  const { rows } = await db.query<{ state: string }>(`select state from public.certificates where id = any($1::uuid[]) order by serial`, [certIds]);
  expect(rows.map((r) => r.state)).toEqual(["issued", "issued"]);
  await expect(page.getByRole("heading", { name: /شهادات إنجاز بانتظار الإطلاق/ })).toHaveCount(0);
});

test("REQ-REC-001: an admin creates a badge with its rule, then retires it after a confirmation naming it", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's badges");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/recognition");
  await group(page, "badges-heading").getByRole("button", { name: "أضف شارة" }).first().click();
  const dialog = page.getByRole("dialog", { name: "شارة جديدة" });
  await dialog.getByLabel("اسم الشارة", { exact: false }).fill("حاضر مخلص");
  await dialog.getByLabel("تُمنح بحسب", { exact: false }).selectOption("check_ins_count");
  await dialog.getByLabel("الحد المطلوب", { exact: false }).fill("25");
  await dialog.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "أُضيفت الشارة" })).toBeVisible();

  const { rows } = await db.query<{ key: string; rule: unknown; retired_at: string | null }>(`select key, rule, retired_at from public.badges where org_id = $1 and name = 'حاضر مخلص'`, [orgId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].key).toMatch(/^custom_/);
  expect(rows[0].rule).toEqual({ metric: "check_ins_count", gte: 25 });

  const row = page.getByRole("row", { name: /حاضر مخلص/ });
  await expect(row).toContainText("بعد 25 تسجيل حضور");
  await row.getByRole("button", { name: "أوقف الشارة" }).click();
  const confirm = page.getByRole("dialog", { name: "إيقاف شارة «حاضر مخلص»؟" });
  await confirm.getByRole("button", { name: "أوقف الشارة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "أُوقفت الشارة" })).toBeVisible();
  const { rows: after } = await db.query<{ retired_at: string | null }>(`select retired_at from public.badges where org_id = $1 and name = 'حاضر مخلص'`, [orgId]);
  expect(after[0].retired_at).not.toBeNull();
});

test("REQ-REC-003: a level renamed, and a threshold below the level before it refused at the field", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's levels");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/recognition");
  await page.getByRole("row", { name: /صاحب أثر/ }).getByRole("button", { name: "عدّل: صاحب أثر" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل مستوى «صاحب أثر»" });
  await dialog.getByLabel("النقاط المطلوبة", { exact: false }).fill("50");
  await dialog.getByRole("button", { name: "احفظ" }).click();
  await expect(dialog.getByText("يجب أن يكون الحد أكثر من المستوى الذي قبله وأقل من الذي بعده.").last()).toBeVisible();

  await dialog.getByLabel("اسم المستوى", { exact: false }).fill("صاحبة أثر");
  await dialog.getByLabel("النقاط المطلوبة", { exact: false }).fill("350");
  await dialog.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const { rows } = await db.query<{ name: string; threshold_points: number }>(`select name, threshold_points from public.levels where org_id = $1 and sort_order = 3`, [orgId]);
  expect(rows[0]).toEqual({ name: "صاحبة أثر", threshold_points: 350 });
});

test("REQ-REC-001 at 390 px: a badge the member already holds is said at the member, and nothing is written", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/recognition");
  const award = group(page, "award-heading");
  await award.getByRole("combobox", { name: /العضو/ }).fill("ريم");
  await page.getByRole("option", { name: /ريم القحطاني/ }).click();
  await award.getByLabel("الشارة", { exact: false }).selectOption({ label: "حاضر دائم" });
  await award.getByLabel("السبب", { exact: false }).fill("تكريم الحضور");
  await award.getByRole("button", { name: "امنح الشارة" }).click();
  await page.getByRole("dialog", { name: "منح شارة «حاضر دائم» إلى «ريم القحطاني»؟" }).getByRole("button", { name: "امنح الشارة" }).click();

  await expect(award.getByText(/يحمل هذا العضو الشارة منذ/).last()).toBeVisible();
  const { rows } = await db.query<{ n: string }>(`select count(*) n from public.audit_log where org_id = $1 and action = 'badge.manual_award'`, [orgId]);
  expect(rows[0].n).toBe("0");
  await award.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wave8-console-recognition-award-already-held.png` });
});
