// SCR-062 · /app/admin/audit — against REAL local Supabase (REQ-ADM-018).
// Proves the real page renders entries, an admin sees the whole org's log
// while a moderator sees only their own actions, and the action filter
// narrows the list.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
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
  domain = `admin-audit-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة السجل', $1, 'AU', gen_random_uuid(), $2) returning id`,
    [`admin-audit-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة السجل"],
    [modEmail, "منظّم السجل"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const adminMemberId = await provisionMemberId(adminEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  // One admin-attributed action, one moderator-attributed action — arranged
  // directly (this track's own DAL only reads `audit_log`; every write
  // path is proven elsewhere, in the RLS suite and the bundle-3/4/5 e2e).
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, reason) values ($1, $2, 'admin', 'member.role_changed', 'member', 'ترقية عضو')`,
    [orgId, adminMemberId],
  );
  await db.query(
    `insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, reason) values ($1, $2, 'moderator', 'comment.removed', 'comment', 'محتوى مسيء')`,
    [orgId, modMemberId],
  );
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

test("REQ-ADM-018: an admin sees the whole org's log, including the moderator's own action", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/audit");
  await expect(page.getByRole("heading", { name: "سجل التدقيق", level: 1 })).toBeVisible();
  await expect(page.getByText("ترقية عضو")).toBeVisible();
  await expect(page.getByText("محتوى مسيء")).toBeVisible();
});

test("03 §5.10a: a moderator sees only their own action, never the admin's", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/audit");
  await expect(page.getByText("محتوى مسيء")).toBeVisible();
  await expect(page.getByText("ترقية عضو")).toHaveCount(0);
});

test("the action filter narrows the list", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/audit");
  await page.getByLabel("الإجراء").selectOption("comment.removed");
  await page.getByRole("button", { name: "طبّق" }).click();
  await expect(page).toHaveURL(/action=comment\.removed/);
  await expect(page.getByText("محتوى مسيء")).toBeVisible();
  await expect(page.getByText("ترقية عضو")).toHaveCount(0);
});

test("SCR-062 at 390 px RTL: the audit log reads down the page, never sideways", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/audit");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await page.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > limit + 1 || box.left < -1) offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, "the audit log must not scroll sideways at 390 px").toEqual([]);
  await page.screenshot({ path: `.qa-shots/rtl/scr-062-audit-390-rtl-${test.info().project.name}.png`, fullPage: true });
});
