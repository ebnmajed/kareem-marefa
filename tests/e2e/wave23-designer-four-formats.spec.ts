// ★★ THE FOUR-FORMAT DEMONSTRABLE — wave 23 (DEC-235 §5.7, DEC-176, REQ-UIX-110: «an untouched document exports
// identically in every format: no parity golden moves»).
//
// The sample template — the platform's «جلسة» (`talk`) poster, as seeded — is opened in the rebuilt studio and NOT
// touched; «صدّر» → «اطلب التصدير» requests every variant; the real worker renders them (Tier A runs on every render
// and a mismatch fails the export, REQ-DSG-014). Every artifact must reach `ready` — 16:9, A4, A3 and 9:16 among them —
// and the SHA-256 of each artifact's bytes is written to `wave23-designer-four-formats.json`.
//
// ★ HOW «NO GOLDEN MOVED» IS READ: the lead runs this spec on `main`'s head (the old studio) and on wave-23b's head and
// compares the two files. Everything a render reads is FIXED here so the two runs bind the same data — the org's
// name, the session's id (the QR encodes its URL), title, venue and time. A PDF carries its creation date and a
// document id, so its hash is taken after those two entries are blanked; a PNG or a WebP is hashed as it is.
//
// Needs the worker on this database: `E2E_WORKER=1`.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";


const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
const WORKER = process.env.E2E_WORKER === "1";
const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1280, height: 900 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.skip(!WORKER, "needs the worker on this database: E2E_WORKER=1");
test.describe.configure({ mode: "serial" });

// FIXED, so a run on main and a run on the branch render the same data.
const SLUG = "w23-four-formats";
const DOMAIN = "w23-four-formats.example";
const SESSION_ID = "23230000-0000-4000-8000-000000000023";
const TITLE = "التصميم مرة واحدة لكل المقاسات";
const STARTS_AT = "2030-01-15T16:00:00Z";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let documentId = "";
const adminEmail = `boss@${DOMAIN}`;
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
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
  // A previous run's org, if one was left behind — the fixed slug and session id are reused.
  await db.query(`delete from public.orgs where slug = $1`, [SLUG]);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users.users.filter((u) => u.email === adminEmail)) await admin.auth.admin.deleteUser(u.id);

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المقاسات الأربعة', $1, 'FF', gen_random_uuid(), $2) returning id`,
    [SLUG, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, DOMAIN]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة المقاسات" } });
  if (error) throw error;
  userIds.push(data.user.id);
  await provisionMemberId(adminEmail);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  await db.query(
    `insert into public.sessions (id, org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, $2, $3, 'نبذة', $4, 'introductory', 'ar', $5::timestamptz, 60, $5::timestamptz + interval '1 hour',
             'Asia/Riyadh', 40, 'القاعة الكبرى', 'published', now())`,
    [SESSION_ID, orgId, TITLE, cat[0].id, STARTS_AT],
  );
  // The sample template, as seeded — UNTOUCHED.
  // ★ LEDGER (wave 27, PR D, DEC-254 §3): the org's own seeded template — there is no live platform row to read.
  const { rows: version } = await db.query<{ id: string; document: unknown }>(
    `select v.id, v.document from public.design_template_versions v
       join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.purpose = 'poster' and t.family = 'talk'
      order by t.is_default desc, v.version desc limit 1`,
    [orgId],
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(version[0].document), version[0].id, SESSION_ID],
  );
  documentId = doc[0].id;
  await db.query(
    `insert into public.session_posters (org_id, session_id, document_id, mode, binding, detached_at)
     values ($1, $2, $3, 'customised', 'detached', now())
     on conflict (session_id) do update set document_id = excluded.document_id, mode = 'customised', binding = 'detached', detached_at = now()`,
    [orgId, SESSION_ID, documentId],
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
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");

/** A PDF's bytes without its creation/modification dates and its document id — everything else is the render. */
function normalisedPdf(bytes: Buffer): Buffer {
  return Buffer.from(
    bytes
      .toString("latin1")
      .replace(/\/(CreationDate|ModDate)\s*\(D:[^)]*\)/g, "/$1 ()")
      .replace(/\/ID\s*\[\s*<[0-9A-Fa-f]*>\s*<[0-9A-Fa-f]*>\s*\]/g, "/ID []")
      .replace(/<xmp:(CreateDate|ModifyDate|MetadataDate)>[^<]*</g, "<xmp:$1><"),
    "latin1",
  );
}

test("★★ the sample template, untouched, exports in every format through the rebuilt studio — and each artifact's hash is recorded", async ({ context, page }) => {
  test.skip(test.info().project.name === "phone", "one run is the measure; the desktop project's");
  test.setTimeout(15 * 60_000);
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(main(page).getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();

  // The old studio (main) has «اطلب التصدير» in the page; the rebuilt one behind «صدّر». Either way, one request.
  const open = main(page).getByRole("button", { name: "صدّر", exact: true });
  if (await open.count()) await open.click();
  await page.getByRole("button", { name: "اطلب التصدير" }).first().click();
  await expect(page.getByText("أُضيفت المقاسات إلى قائمة التصدير.", { exact: true })).toBeVisible();

  const settled = async () =>
    Number(
      (await db.query<{ n: string }>(`select count(*)::text as n from public.export_artifacts where document_id = $1 and status in ('ready', 'failed')`, [documentId])).rows[0].n,
    );
  await expect.poll(settled, { timeout: 14 * 60_000, intervals: [5_000] }).toBe(12);
  const { rows } = await db.query<{ preset: string; format: string; status: string; error: string | null; storage_path: string; source_fingerprint: string }>(
    `select preset, format, status, error, storage_path, source_fingerprint from public.export_artifacts where document_id = $1 order by preset, format`,
    [documentId],
  );
  expect(rows.filter((r) => r.status !== "ready"), "every variant renders, Tier A green").toEqual([]);
  // The four the artboard draws — 16:9, A4, A3, 9:16 — are among them.
  for (const preset of ["landscape", "a4", "a3", "story"]) expect(rows.some((r) => r.preset === preset)).toBe(true);

  const hashes: Record<string, { sha256: string; bytes: number; sourceFingerprint: string }> = {};
  for (const row of rows) {
    const { data, error } = await admin.storage.from("exports").download(row.storage_path);
    if (error || !data) throw error ?? new Error(`no bytes for ${row.preset}.${row.format}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    const hashed = row.format === "pdf" ? normalisedPdf(bytes) : bytes;
    hashes[`${row.preset}.${row.format}`] = { sha256: createHash("sha256").update(hashed).digest("hex"), bytes: bytes.length, sourceFingerprint: row.source_fingerprint };
  }
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/wave23-designer-four-formats.json`, `${JSON.stringify(hashes, null, 2)}\n`);
  expect(Object.keys(hashes)).toHaveLength(12);
});
