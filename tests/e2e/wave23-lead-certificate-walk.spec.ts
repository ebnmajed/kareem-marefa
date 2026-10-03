// The certificate flows, walked end to end — DEC-236 §5, the owner's definition of done for C1 – C7.
// REQ-UIX-108, REQ-UIX-109, REQ-CRT-004, REQ-CRT-011, REQ-CRT-014, REQ-CRT-015, DEC-178, DEC-237 §4, DEC-238.
//
// An admin designs a certificate template, sets it as its kind's default, puts a session in review mode and completes
// it, releases two certificates, revokes one with a reason — and the member downloads the other. A capture at every
// step, at 1280, for the lead to hold beside `AdminTemplatesCerts.dc.html` and `AdminCertificates.dc.html`.
//
// ★ The two negatives the requirements make explicit are asserted, not drawn: a HELD certificate is invisible to its
// recipient and no mail is queued for it (REQ-CRT-004); the verification page of a REVOKED one says it is revoked and
// never shows the reason (REQ-CRT-011).
//
// ★ What is real and what is a fixture, said plainly. Real: every screen, every Server Action, every policy, the audit
// rows, the one audited download route and its 303. Fixtures, as `certificates.spec.ts` and wave 13's download spec do
// them: the session's attendance and its completion are written in SQL, and the completion fan-out is
// `issue_certificate()` called for each attendee — the worker's job is not running here; the template's version is
// published in SQL, because the studio that publishes it is PR B's and deferred; and the PDF's bytes are a stub object
// with an `export_artifacts` row, because rendering is the worker's.
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
const DESKTOP = { width: 1280, height: 900 };
const TEMPLATE = "ورقي للحضور";
const REASON = "أُصدرت باسم خاطئ";
const NAMES = { a: "سارة القحطاني", b: "فهد العنزي" };

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let templateId = "";
const emails = { admin: "", a: "", b: "" };
const members = { admin: "", a: "", b: "" };
const certs: Record<"a" | "b", { id: string; serial: string; code: string }> = { a: { id: "", serial: "", code: "" }, b: { id: "", serial: "", code: "" } };
const userIds: string[] = [];

const main = (page: Page) => page.locator("#main");
const shot = (page: Page, step: string) => page.screenshot({ path: `${SHOTS}/wave23-lead-walk-${step}-1280.png`, fullPage: true });

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "the studio's walk is checked at 1280 (the designer has no phone form)");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `walk23-${tag}.example`;
  emails.admin = `boss@${domain}`;
  emails.a = `a@${domain}`;
  emails.b = `b@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الجولة', $1, 'WK', gen_random_uuid(), $2) returning id`,
    [`walk23-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [key, name] of [["admin", "مدير الجولة"], ["a", NAMES.a], ["b", NAMES.b]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error: e1 } = await client.auth.signInWithPassword({ email: emails[key], password: PASSWORD });
    if (e1) throw e1;
    const { error: e2 } = await client.rpc("provision_member");
    if (e2) throw e2;
    const { rows } = await db.query<{ id: string }>(`update public.members set display_name = $3 where org_id = $1 and email = $2 returning id`, [orgId, emails[key], name]);
    members[key] = rows[0].id;
  }

  // A session that has ended and is not yet completed — the mode is still writable on SCR-045 (DEC-178).
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'الخط العربي') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, 'الأرقام التي تكذب: قراءة تقارير الأداء', 'نبذة عن الجلسة وأهدافها للحاضرين.', $2, 'introductory', 'ar',
             now() - interval '3 hours', 60, now() - interval '2 hours', 'Asia/Riyadh', 30, 'قاعة الاختبار', 'published', now() - interval '1 day')
     returning id`,
    [orgId, cat[0].id],
  );
  sessionId = s[0].id;
  for (const key of ["a", "b"] as const) {
    await db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'حضر الجلسة', $4, 'empty'::tstzrange)`,
      [orgId, sessionId, members[key], members.admin],
    );
  }
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("1 · a certificate template is designed, from the library's الشهادات tab", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(main(page).getByRole("tablist", { name: "أنواع القوالب" }).getByRole("tab", { name: "الشهادات" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "1a-library");

  await main(page).getByRole("link", { name: "قالب جديد" }).click();
  const dialog = page.getByRole("dialog", { name: "قالب جديد" });
  await dialog.getByLabel("الاسم").fill(TEMPLATE);
  await dialog.getByRole("radiogroup", { name: "النوع" }).getByRole("radio", { name: "حضور" }).check();
  await shot(page, "1b-new-template");
  await dialog.getByRole("button", { name: "أنشئ وافتح" }).click();
  await page.waitForURL(/\/app\/admin\/designer\//);
  await shot(page, "1c-studio");

  const { rows } = await db.query<{ id: string }>(`select id from public.design_templates where org_id = $1 and name = $2`, [orgId, TEMPLATE]);
  templateId = rows[0].id;
  // The studio that publishes is PR B's (deferred); its publish is one row, done here as the studio does it.
  await db.query(`update public.design_template_versions set published_at = now() where template_id = $1 and published_at is null`, [templateId]);
  const { rows: audit } = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'design_template.created' and subject_id = $2 and actor_id = $3`, [orgId, templateId, members.admin]);
  expect(audit, "creating the template is audited, with the admin as actor (0191)").toHaveLength(1);
});

test("2 · it is set as the default for its kind — one of three, حضور · تقديم · إنجاز", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await page.goto("/ar/app/admin/templates/certificates");
  const card = main(page).locator("article", { has: page.getByRole("heading", { name: TEMPLATE, exact: true, level: 3 }) });
  await card.getByRole("button", { name: "إجراءات أخرى" }).click();
  await page.getByRole("menuitem", { name: "اجعله الافتراضي" }).click();
  await expect(page.getByText("صار هذا القالب الافتراضي لعائلته.", { exact: true })).toBeVisible();
  await expect(main(page).getByLabel("القوالب الافتراضية")).toContainText(TEMPLATE);
  await expect(card.getByText("افتراضي", { exact: true })).toBeVisible();
  await shot(page, "2-default-set");

  const { rows } = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'design_template.default_set' and subject_id = $2`, [orgId, templateId]);
  expect(rows, "set default writes exactly one row").toHaveLength(1);
});

test("3 · the session is put in review mode on SCR-045 and completed — the certificates are held", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  await main(page).getByRole("radiogroup", { name: "من يستحق شهادة، ومتى" }).getByRole("radio", { name: "تُجهَّز وتبقى محجوزة حتى تُطلقها" }).check();
  await main(page).getByRole("button", { name: "احفظ الوضع", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ثبّت الوضع", exact: true }).click();
  await expect.poll(async () => (await db.query(`select certificate_mode from public.sessions where id = $1`, [sessionId])).rows[0].certificate_mode).toBe("review");
  await shot(page, "3a-review-mode");

  // The completion and its fan-out, as fixtures (the header says why).
  await db.query(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
  for (const key of ["a", "b"] as const) {
    const { rows } = await db.query<{ id: string; serial: string; verification_code: string; state: string }>(
      `select id, serial, verification_code, state from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`,
      [sessionId, members[key]],
    );
    expect(rows[0].state).toBe("held");
    certs[key] = { id: rows[0].id, serial: rows[0].serial, code: rows[0].verification_code };
  }
  const { rows: pinned } = await db.query<{ template_id: string }>(
    `select v.template_id from public.certificates c join public.design_template_versions v on v.id = c.template_version_id where c.id = $1`,
    [certs.a.id],
  );
  expect(pinned[0].template_id, "issued from the kind's default the admin set in step 2").toBe(templateId);

  await page.reload();
  await expect(main(page).getByRole("table", { name: "الشهادات المحجوزة" })).toContainText(NAMES.a);
  await shot(page, "3b-held");
});

test("3 · negative — a held certificate is invisible to its recipient, and no mail is queued (REQ-CRT-004)", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.a);
  await page.goto("/ar/app/me/certificates");
  await expect(main(page)).toBeVisible();
  await expect(page.getByText(certs.a.serial)).toHaveCount(0);
  const { rows } = await db.query(`select 1 from public.notifications where member_id = $1 and key = 'MSG-certificate_issued'`, [members.a]);
  expect(rows).toHaveLength(0);
  await shot(page, "3c-member-sees-nothing");
});

test("4 · two certificates are released together", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  const held = main(page).getByRole("table", { name: "الشهادات المحجوزة" });
  await held.getByRole("checkbox", { name: `تحديد الصف ${NAMES.a}` }).check();
  await held.getByRole("checkbox", { name: `تحديد الصف ${NAMES.b}` }).check();
  await main(page).getByRole("button", { name: "أصدر المحدّد" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "أصدر", exact: true }).click();
  await expect(page.getByText("صدرت شهادتان", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("table", { name: "الشهادات الصادرة" })).toContainText(certs.b.serial);
  await shot(page, "4-released");

  const { rows } = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'certificate.released'`, [orgId]);
  expect(rows, "one release row per certificate").toHaveLength(2);
});

test("5 · one is revoked with a reason — and the verification page says revoked, never why (REQ-CRT-011)", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/certificates`);
  const row = main(page).getByRole("table", { name: "الشهادات الصادرة" }).getByRole("row", { name: new RegExp(certs.a.serial) });
  await row.getByRole("button", { name: /ألغِ/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "ألغِ الشهادة" }).click();
  await expect.poll(async () => (await db.query(`select state from public.certificates where id = $1`, [certs.a.id])).rows[0].state, "no reason, no revocation").toBe("issued");
  await sheet.getByLabel("سبب الإلغاء").fill(REASON);
  await shot(page, "5a-revoke-sheet");
  await sheet.getByRole("button", { name: "ألغِ الشهادة" }).click();
  await expect(page.getByText("أُلغيت الشهادة.", { exact: true })).toBeVisible();
  await shot(page, "5b-revoked");

  const { rows } = await db.query<{ reason: string }>(`select reason from public.audit_log where org_id = $1 and action = 'certificate.revoked' and subject_id = $2`, [orgId, certs.a.id]);
  expect(rows.map((r) => r.reason)).toEqual([REASON]);

  await context.clearCookies();
  await page.goto(`/ar/verify/${certs.a.code}`);
  await expect(page.getByText("ملغاة")).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await shot(page, "5c-verify-revoked");
});

test("6 · the member downloads the other, through the one audited route", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);
  // The PDF's bytes are a stub; the artifact row and the route are real (the header says why).
  const { rows: ver } = await db.query<{ id: string }>(`select template_version_id as id from public.certificates where id = $1`, [certs.b.id]);
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_certificate_id)
     select $1, 'certificate', v.document, v.id, $3 from public.design_template_versions v where v.id = $2 returning id`,
    [orgId, ver[0].id, certs.b.id],
  );
  const path = `${orgId}/exports/${doc[0].id}/cert_landscape.pdf`;
  const { error } = await admin.storage.from("exports").upload(path, Buffer.from("%PDF-1.4\n% a certificate\n%%EOF\n"), { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  await db.query(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'cert_landscape', 'pdf', 3508, 2480, $3, 32, 'ready', 'fp-walk23', now())`,
    [orgId, doc[0].id, path],
  );

  await signIn(context, emails.b);
  await page.goto("/ar/app/me/certificates");
  await expect(main(page).getByText(certs.b.serial)).toBeVisible();
  await shot(page, "6a-member-list");
  const link = main(page).locator('a[href*="/api/designer/downloads/"]').first();
  const href = await link.getAttribute("href");
  expect(href, "the link is the route, never a signed URL").toMatch(/\/api\/designer\/downloads\//);
  const response = await page.request.get(href!, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const { rows } = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'export_artifact.downloaded' and actor_id = $2`, [orgId, members.b]);
  expect(rows, "the member's download is audited, with the member as actor").toHaveLength(1);
});
