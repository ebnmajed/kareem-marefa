// `/app/me/certificates` — SCR-023, REQ-CRT-013, REQ-CRT-014. Task T3 of
// content's wave-7 plan. Real local Supabase; the minimal row chain
// `certificates.template_version_id` needs (`design_templates` →
// `design_template_versions`, the same two rows `tests/rls/fixture-m6.ts`
// seeds for the RLS suite, adapted here to a plain `pg.Client` rather than
// its `Tx` wrapper) — `kind = 'presenter'` avoids the extra `check_ins` row
// `kind = 'attendance'` would need (`certificates_attendance_needs_check_in`).
//
// ★ Neither certificate here has a rendered PDF (`export_artifacts` is
// `designer`'s pipeline, out of scope for seeding a display test) — both show
// «الشهادة قيد التجهيز», which the download-available path is already proven
// separately, structurally, in `tests/components/me/certificates-page.test.tsx`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const EMPTY_DOC = JSON.stringify({ schemaVersion: 1, layers: [] });
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `certs-e2e-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'CRT', gen_random_uuid()) returning id`,
    [`مؤسسة الشهادات ${tag}`, `certs-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);
  // ★ Two sessions, not one: `certificates_org_id_session_id_member_id_kind_key`
  // is unique on (org, session, member, kind), and both certificates below
  // are `kind = 'presenter'` — the same session under both would violate it.
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة الشهادات', 'ملخص الجلسة', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
             $3, 30, now() - interval '3 days', now() - interval '3 days', 'completed', now() - interval '5 days')`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة الشهادة الملغاة', 'ملخص الجلسة', $2, 'introductory', now() - interval '4 days', 60, now() - interval '4 days' + interval '1 hour',
             $3, 30, now() - interval '5 days', now() - interval '5 days', 'completed', now() - interval '7 days')`,
    [orgId, catRows[0].id, venueRows[0].id],
  );

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الشهادات" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave7-content-certificates-${name}.png`), fullPage: true });
}

test("empty, then an issued and a revoked certificate, serial and code isolated LTR", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context, memberEmail);

  await page.goto("/ar/app/me/certificates");
  await expect(page.getByRole("heading", { name: "شهاداتي", level: 1 })).toBeVisible();
  await expect(page.getByText("لا شهادات بعد")).toBeVisible();
  await capture(page, "empty");

  const { rows: sessRows } = await db.query<{ id: string; title: string }>(
    `select id, title from public.sessions where org_id = $1 order by starts_at desc`,
    [orgId],
  );
  const sessionId = sessRows.find((r) => r.title === "جلسة الشهادات")!.id;
  const revokedSessionId = sessRows.find((r) => r.title === "جلسة الشهادة الملغاة")!.id;

  const { rows: tplRows } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
     values ($1, 'org', 'certificate', 'presenter', 'شهادة المقدّم', true) returning id`,
    [orgId],
  );
  const { rows: verRows } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (org_id, template_id, version, document, published_at)
     values ($1, $2, 1, $3::jsonb, now()) returning id`,
    [orgId, tplRows[0].id, EMPTY_DOC],
  );
  const templateVersionId = verRows[0].id;

  await db.query(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at)
     values ($1, $2, 'presenter', $3, 'CRT-2026-000001', 'abcdefghijklmnopqrstuvwx', 'issued', $4, 'عضو الشهادات', now())`,
    [orgId, memberId, sessionId, templateVersionId],
  );
  await db.query(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at, revoked_at, revocation_reason)
     values ($1, $2, 'presenter', $3, 'CRT-2026-000002', 'yzabcdefghijklmnopqrstuv', 'revoked', $4, 'عضو الشهادات', now() - interval '1 day', now(), 'إصدار مكرر بالخطأ')`,
    [orgId, memberId, revokedSessionId, templateVersionId],
  );

  await page.reload();
  await expect(page.getByText("جلسة الشهادات").first()).toBeVisible();
  await expect(page.getByText("صالحة")).toBeVisible();
  await expect(page.getByText("ملغاة")).toBeVisible();
  await expect(page.getByText("إصدار مكرر بالخطأ")).toBeVisible();
  // The serial is dir="ltr" inside its own <bdi> (09 SCR-023).
  const serial = page.getByText("CRT-2026-000001");
  await expect(serial).toHaveAttribute("dir", "ltr");
  await capture(page, "issued-and-revoked");
});
