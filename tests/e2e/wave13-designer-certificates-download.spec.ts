// A certificate downloaded — from SCR-045 by the admin, from /app/me/certificates
// by its own member — through the ONE audited route, and refused to anyone else.
// REQ-DSG-027, REQ-ADM-021, REQ-CRT-013, DEC-176 contract 1/3, DEC-177, DEC-178.
//
// ★ What only a real server shows: the link a screen renders is the ROUTE, not a
// signed URL; following it writes exactly one `export_artifact.downloaded`
// audit row and answers `303` to the signer's five-minute URL with the file's
// name; and a member who forges another member's artifact id is sent back with
// `?download=failed` and writes no row (`record_export_download()`, 0152).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const RECIPIENT = "ريم الحاصلة على الشهادة";
const SERIAL = "DL-2026-000001";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let artifactId = "";
const emails = { admin: "", owner: "", other: "" };
const userIds: string[] = [];

async function provision(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e) throw e;
  const { data: m, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (m as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `cert-dl-${tag}.example`;
  emails.admin = `boss@${domain}`;
  emails.owner = `owner@${domain}`;
  emails.other = `other@${domain}`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة التنزيل', $1, 'DL', gen_random_uuid(), $2) returning id`,
    [`cert-dl-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await provision(emails.admin, "مشرفة التنزيل");
  const ownerId = await provision(emails.owner, RECIPIENT);
  await provision(emails.other, "عضو آخر");

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at, time_zone, capacity, custom_venue_name, state, published_at, completed_at)
     values ($1, 'جلسة التنزيل', 'نبذة', $2, 'introductory', 'ar', now() - interval '3 days', 60, now() - interval '3 days' + interval '1 hour', 'Asia/Riyadh', 30, 'القاعة', 'completed', now() - interval '5 days', now() - interval '3 days') returning id`,
    [orgId, cat[0].id],
  );
  sessionId = s[0].id;

  const empty = JSON.stringify({ schemaVersion: 1, purpose: "certificate", master: { width: 3508, height: 2480, unit: "px" }, direction: "rtl", layers: [] });
  const { rows: tpl } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default) values ($1, 'org', 'certificate', 'presenter', 'شهادة المقدّم', true) returning id`,
    [orgId],
  );
  const { rows: ver } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (org_id, template_id, version, document, published_at) values ($1, $2, 1, $3::jsonb, now()) returning id`,
    [orgId, tpl[0].id, empty],
  );
  const { rows: cert } = await db.query<{ id: string }>(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at)
     values ($1, $2, 'presenter', $3, $4, 'dlcodeabcdefghijklmnopq', 'issued', $5, $6, now()) returning id`,
    [orgId, ownerId, sessionId, SERIAL, ver[0].id, RECIPIENT],
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_certificate_id) values ($1, 'certificate', $2::jsonb, $3, $4) returning id`,
    [orgId, empty, ver[0].id, cert[0].id],
  );
  const path = `${orgId}/exports/${doc[0].id}/cert_landscape.pdf`;
  const { error: upErr } = await admin.storage.from("exports").upload(path, Buffer.from("%PDF-1.4\n% a certificate\n%%EOF\n"), { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;
  const { rows: art } = await db.query<{ id: string }>(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'cert_landscape', 'pdf', 3508, 2480, $3, 32, 'ready', 'fp-dl', now()) returning id`,
    [orgId, doc[0].id, path],
  );
  artifactId = art[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const rowsFor = async () =>
  Number(
    (
      await db.query<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1 and action = 'export_artifact.downloaded' and subject_id = $2`, [orgId, artifactId])
    ).rows[0]!.n,
  );

/** Follows the link WITHOUT following the redirect: the route's own answer. */
async function follow(page: Page, href: string, referer: string) {
  return page.request.get(href, { maxRedirects: 0, headers: { referer } });
}

test("★ the admin downloads an issued certificate from SCR-045 — through the route, audited, named by its serial", async ({ context, page }) => {
  await signIn(context, emails.admin);
  if (test.info().project.name === "phone") await page.setViewportSize(PHONE);
  const screen = `/ar/app/admin/sessions/${sessionId}/certificates`;
  await page.goto(screen);
  const link = main(page).getByRole("link", { name: `نزّل شهادة ${RECIPIENT}`, exact: true });
  await expect(link).toHaveAttribute("href", `/api/designer/downloads/${artifactId}`);
  if (test.info().project.name === "phone") {
    await page.screenshot({ path: `${SHOTS}/wave13-designer-certificates-download.png`, fullPage: true });
  }

  const before = await rowsFor();
  const res = await follow(page, `/api/designer/downloads/${artifactId}`, `http://localhost:3000${screen}`);
  expect(res.status()).toBe(303);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const location = res.headers()["location"] ?? "";
  expect(location).toMatch(/\/storage\/v1\/object\/sign\/exports\//);
  expect(location).toContain(`download=certificate-${SERIAL}`);
  expect(await rowsFor()).toBe(before + 1);
});

test("★ the member downloads their OWN certificate from /app/me/certificates — audited too (DEC-177)", async ({ context, page }) => {
  await signIn(context, emails.owner);
  await page.goto("/ar/app/me/certificates");
  const link = main(page).getByRole("link", { name: "نزّل الشهادة", exact: true });
  await expect(link).toHaveAttribute("href", `/api/designer/downloads/${artifactId}`);
  await expect(link).not.toHaveAttribute("download", /.*/);

  const before = await rowsFor();
  const res = await follow(page, `/api/designer/downloads/${artifactId}`, "http://localhost:3000/ar/app/me/certificates");
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/storage\/v1\/object\/sign\/exports\//);
  expect(await rowsFor()).toBe(before + 1);
});

test("★ another member forging the id is sent back with ?download=failed, and nothing is written", async ({ context, page }) => {
  await signIn(context, emails.other);
  const before = await rowsFor();
  const res = await follow(page, `/api/designer/downloads/${artifactId}`, "http://localhost:3000/ar/app/me/certificates");
  expect(res.status()).toBe(303);
  const location = new URL(res.headers()["location"] ?? "", "http://localhost:3000");
  expect(location.pathname).toBe("/ar/app/me/certificates");
  expect(location.searchParams.get("download")).toBe("failed");
  expect(await rowsFor()).toBe(before);

  // And the page it lands on says so.
  await page.goto(`${location.pathname}${location.search}`);
  await expect(main(page).getByRole("alert")).toContainText("تعذّر تنزيل الملف");
});
