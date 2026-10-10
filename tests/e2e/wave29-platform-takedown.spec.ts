// Wave 29, PR B — an admin takes a member's photo down from SCR-049, against REAL local Supabase (DEC-280 §4, §8;
// DEC-281; REQ-PRF-019, REQ-ADM-010). With `page.click()` alone: the row's ⋯ offers «أزل الصورة» only while a photo is
// stored, the confirm names the member, the row's avatar becomes the member's LIBRARY avatar (never initials), and the
// audit log holds `member.avatar_taken_down`. A member who holds only a library avatar is offered nothing to take down.
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
const PHOTO_NAME = "عضو بصورة";
const LIBRARY_NAME = "عضو بلا صورة";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let photoId = "";
let libraryId = "";
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
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
  const domain = `takedown-${tag}.example`;
  adminEmail = `boss@${domain}`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الصور', $1, 'TD', gen_random_uuid(), $2) returning id`,
    [`takedown-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const ids: string[] = [];
  for (const [email, name] of [
    [adminEmail, "مشرفة الصور"],
    [`photo@${domain}`, PHOTO_NAME],
    [`library@${domain}`, LIBRARY_NAME],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    ids.push(await provision(email));
  }
  [, photoId, libraryId] = ids;
  await db.query(`update public.members set avatar_key = 'objects/reel', avatar_version = 1790000000500, avatar_source = 'upload' where id = $1`, [photoId]);
  await db.query(`update public.members set avatar_key = 'characters/actor' where id = $1`, [libraryId]);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("★ an admin takes a photo down from the row — the library avatar shows, the log says so (page.click alone)", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "row-scoped interaction — the phone card stack has no role=row to scope by");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/members");

  const row = page.locator("#main").getByRole("row", { name: new RegExp(PHOTO_NAME) });
  await expect(row.locator(`img[src^="/api/avatars/${photoId}"]`)).toHaveCount(1);
  await row.getByRole("button", { name: new RegExp(`مزيد من الإجراءات على ${PHOTO_NAME}`) }).click();
  await page.getByRole("menuitem", { name: "أزل الصورة" }).click();
  await page.getByRole("dialog", { name: new RegExp(PHOTO_NAME) }).getByRole("button", { name: "أزل", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "أُزيلت الصورة" })).toBeVisible();

  await expect(row.locator('img[src="/avatars/objects/reel.svg"]')).toHaveCount(1);
  const { rows } = await db.query<{ avatar_version: string | null; avatar_source: string | null; avatar_key: string }>(
    `select avatar_version, avatar_source, avatar_key from public.members where id = $1`,
    [photoId],
  );
  expect(rows[0]).toEqual({ avatar_version: null, avatar_source: null, avatar_key: "objects/reel" });
  const audit = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'member.avatar_taken_down' and subject_id = $2`, [orgId, photoId]);
  expect(audit.rowCount).toBe(1);
  const reports = await db.query(`select 1 from public.reports where org_id = $1`, [orgId]);
  expect(reports.rowCount).toBe(0); // DEC-280 §8: no queue
});

test("a member who holds only a library avatar is offered nothing to take down", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "row-scoped interaction");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/members");
  const row = page.locator("#main").getByRole("row", { name: new RegExp(LIBRARY_NAME) });
  await row.getByRole("button", { name: new RegExp(`مزيد من الإجراءات على ${LIBRARY_NAME}`) }).click();
  await expect(page.getByRole("menuitem", { name: "عرض الملف الكامل" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "أزل الصورة" })).toHaveCount(0);
});
