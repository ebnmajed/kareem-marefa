// Wave 22, PR B — SCR-053 and SCR-054 rebuilt read-by-default (REQ-UIX-100, REQ-UIX-101, REQ-UIX-091), against REAL
// local Supabase. ★ THE JOB (DEC-231 §0.3): an admin edits the catalogue on SCR-053 and the member app keeps its promise —
// SCR-022 reads the new rule at once, and every row already written keeps what it said. And «it saved» is the server's
// receipt: the saved mark names the time and the author; a save that changed nothing says «لم يتغيّر شيء».
//
// Captures (`E2E_SHOTS_DIR`), at 1280 on the desktop project and 390 on the phone project:
//   wave22-scoring-053-read-<1280|390>.png · wave22-scoring-053-edit-<1280|390>.png · wave22-scoring-053-saved-1280.png
//   wave22-scoring-054-read-<1280|390>.png · wave22-scoring-054-edit-<1280|390>.png
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
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let memberEmail = "";
let memberId = "";
let oldRowId = "";
const userIds: string[] = [];

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w22-scoring-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة النقاط', $1, 'SR', gen_random_uuid(), $2) returning id`,
    [`w22-scoring-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة النقاط"],
    [memberEmail, "سارة العتيبي"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  memberId = await provision(memberEmail);
  // A comment award the member already holds, written under the rule as it stands — the row the edit must not move.
  const [rule] = (await db.query<{ points: number; reason_ar: string; version: number }>(`select points, reason_ar, version from public.scoring_rules where org_id = $1 and action_key = 'comment'`, [orgId]))
    .rows;
  const { rows: ledger } = await db.query<{ id: string }>(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, reason, rule_key, rule_version, idempotency_key)
     values ($1, $2, $3, 'comment', gen_random_uuid(), $4, 'comment', $5, $6) returning id`,
    [orgId, memberId, rule.points, rule.reason_ar, rule.version, `e2e:w22:comment:${tag}`],
  );
  oldRowId = ledger[0].id;
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
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  if (email === adminEmail) {
    await db.query(`update public.members set org_role = 'admin' where id = $1`, [(data as { member_id: string }).member_id]);
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const width = (name: string) => (name === "phone" ? 390 : 1280);

test("★ SCR-053's job: a rule edited here is what SCR-022 reads next, and the row already written does not move", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's catalogue");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/scoring?edit");
  const main = page.locator("#main");
  await main.getByRole("textbox", { name: "القيمة — تعليق" }).fill("7");
  await main.getByRole("textbox", { name: "ما يقرؤه العضو — تعليق" }).fill("تعليق يضيف للنقاش");
  await expect(main.getByText("تغييران غير محفوظين")).toBeVisible();
  await main.getByRole("button", { name: /^احفظ/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ" })).toBeVisible();
  await expect(main.getByText(/✓✓ حُفظ/)).toContainText("مشرفة النقاط");
  await page.screenshot({ path: `${SHOTS}/wave22-scoring-053-saved-1280.png`, fullPage: true });

  // As the member: SCR-022's catalogue reads the rule as it now stands…
  await signIn(context, memberEmail);
  await goto(page, "/ar/app/me/points");
  const catalogue = page.locator("#main section#catalogue");
  await expect(catalogue.getByRole("listitem").filter({ hasText: "تعليق يضيف للنقاش" })).toContainText("7");
  // …and the row already written still says what it said, at the amount it was paid.
  const { rows } = await db.query<{ amount: number; reason: string; rule_version: number }>(`select amount, reason, rule_version from public.points_ledger where id = $1`, [oldRowId]);
  expect(rows[0].reason).not.toBe("تعليق يضيف للنقاش");
  expect(rows[0].amount).not.toBe(7);
});

test("SCR-053: saving an unchanged form writes nothing and says so", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes this org's catalogue");
  await signIn(context, adminEmail);
  const before = (await db.query<{ n: string }>(`select count(*) n from public.scoring_config_history where org_id = $1`, [orgId])).rows[0].n;
  await goto(page, "/ar/app/admin/scoring?edit");
  // Pressed before any change: the server's HTML posts; nothing differs, so the receipt is empty.
  await page.locator("#main").getByRole("button", { name: /^احفظ/ }).evaluate((b: HTMLButtonElement) => b.form?.requestSubmit());
  await expect(page.getByRole("status").filter({ hasText: "لم يتغيّر شيء" })).toBeVisible();
  const after = (await db.query<{ n: string }>(`select count(*) n from public.scoring_config_history where org_id = $1`, [orgId])).rows[0].n;
  expect(after).toBe(before);
});

test("SCR-053 and SCR-054 beside their artboards: read and edit, at 1280 and 390", async ({ context, page }, testInfo) => {
  const w = width(testInfo.project.name);
  await signIn(context, adminEmail);
  for (const [screen, path] of [
    ["053", "/ar/app/admin/scoring"],
    ["054", "/ar/app/admin/recognition"],
  ] as const) {
    await goto(page, path);
    await expect(page.locator("#main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#main").getByRole("switch")).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/wave22-scoring-${screen}-read-${w}.png`, fullPage: true });
    await goto(page, `${path}?edit`);
    await expect(page.locator("#main").getByRole("button", { name: /^احفظ/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/wave22-scoring-${screen}-edit-${w}.png`, fullPage: true });
  }
});
