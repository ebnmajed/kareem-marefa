// ★ Wave 13's fourth demonstrable (DEC-176): «a staff member downloads a
// session's poster and a session's certificates FROM THE SESSION, at 390 px in
// Arabic, having never opened /app/admin/designer». That was the owner's
// complaint — the studio was the only export surface in the product, and the
// staff who issue certificates could not get the files.
//
// One continuous run as an admin, on the phone project: the hub's own address
// → the poster's «تنزيل الملصق» under the picker → the strip to «الشهادات» →
// the certificate's download. Every download is the ONE audited route
// (`/api/designer/downloads/[artifactId]`, `record_export_download()`, 0152):
// a 303 to a five-minute signed URL whose file really is there, and exactly one
// `export_artifact.downloaded` row each. And not one navigation, anywhere in the
// run, touches the studio.
//
// REQ-DSG-027, REQ-ADM-021, REQ-SES-020 · DEC-176, DEC-177, DEC-178.
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

const PASSWORD = "correct-horse-battery-staple-9";
const TITLE = "ملتقى التنزيل من الجلسة";
const RECIPIENT = "هند صاحبة الشهادة";
const SERIAL = "DM-2026-000001";
// A 1×1 PNG: the master's object must exist for the poster to sign, and for
// the signed URL this spec fetches to answer 200.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n% the certificate\n%%EOF\n");

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let posterArtifact = "";
let certArtifact = "";
const paths: string[] = [];
const userIds: string[] = [];
const emails = { admin: "", holder: "" };

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

async function upload(path: string, bytes: Buffer, contentType: string) {
  const { error } = await admin.storage.from("exports").upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  paths.push(path);
}

test.beforeAll(async ({}, testInfo) => {
  // The demonstrable is a phone at 390 px; the desktop project seeds nothing.
  test.skip(testInfo.project.name !== "phone", "the demonstrable is a phone at 390 px");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `demo-dl-${tag}.example`;
  emails.admin = `boss@${domain}`;
  emails.holder = `holder@${domain}`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة العرض', $1, 'DM', gen_random_uuid(), $2) returning id`,
    [`demo-dl-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await provision(emails.admin, "مشرفة العرض");
  const holder = await provision(emails.holder, RECIPIENT);

  // A COMPLETED session — a certificate exists only after completion.
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at, time_zone, capacity, custom_venue_name, state, published_at, completed_at, certificate_mode)
     values ($1, $2, 'نبذة', $3, 'introductory', 'ar', now() - interval '3 days', 60, now() - interval '3 days' + interval '1 hour', 'Asia/Riyadh', 30, 'القاعة', 'completed', now() - interval '5 days', now() - interval '3 days', 'automatic') returning id`,
    [orgId, TITLE, cat[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, holder]);

  // Its poster: the master rendered, as the worker leaves it.
  const { rows: pdoc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id) values ($1, 'poster', $2::jsonb, $3) returning id`,
    [orgId, JSON.stringify({ schemaVersion: 1, layers: [] }), sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, pdoc[0].id]);
  const posterPath = `${orgId}/exports/${pdoc[0].id}/master.png`;
  await upload(posterPath, PNG, "image/png");
  const { rows: pa } = await db.query<{ id: string }>(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'master', 'png', 1080, 1350, $3, $4, 'ready', $5, now()) returning id`,
    [orgId, pdoc[0].id, posterPath, PNG.length, `fp-${pdoc[0].id}`],
  );
  posterArtifact = pa[0].id;

  // Its certificate: issued to the presenter, its PDF rendered.
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
     values ($1, $2, 'presenter', $3, $4, public.new_verification_code(), 'issued', $5, $6, now()) returning id`,
    [orgId, holder, sessionId, SERIAL, ver[0].id, RECIPIENT],
  );
  const { rows: cdoc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_certificate_id) values ($1, 'certificate', $2::jsonb, $3, $4) returning id`,
    [orgId, empty, ver[0].id, cert[0].id],
  );
  const certPath = `${orgId}/exports/${cdoc[0].id}/cert_landscape.pdf`;
  await upload(certPath, PDF, "application/pdf");
  const { rows: ca } = await db.query<{ id: string }>(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'cert_landscape', 'pdf', 3508, 2480, $3, $4, 'ready', $5, now()) returning id`,
    [orgId, cdoc[0].id, certPath, PDF.length, `fp-${cdoc[0].id}`],
  );
  certArtifact = ca[0].id;
});

test.afterAll(async () => {
  if (!db) return;
  if (paths.length) await admin.storage.from("exports").remove(paths);
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

const audited = async (artifact: string) =>
  Number(
    (await db.query<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1 and action = 'export_artifact.downloaded' and subject_id = $2`, [orgId, artifact])).rows[0]!.n,
  );

/** A viewport capture with the download on screen, clear of the fixed bars. */
async function capture(page: Page, name: string, target: ReturnType<Page["locator"]>) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await target.evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  });
  await page.screenshot({ path: `${SHOTS}/wave13-demo-download-${name}.png` });
}

/** Follow the route as the browser would, and then the file it hands over. */
async function take(page: Page, href: string, referer: string, expectType: string, expectName: string) {
  const res = await page.request.get(href, { maxRedirects: 0, headers: { referer } });
  expect(res.status()).toBe(303);
  const location = res.headers()["location"] ?? "";
  expect(location).toMatch(/\/storage\/v1\/object\/sign\/exports\//);
  expect(location).toContain(`download=${expectName}`);
  const file = await page.request.get(location);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toContain(expectType);
  expect((await file.body()).length).toBeGreaterThan(0);
}

test("★ an admin downloads the session's poster and its certificate FROM THE SESSION, at 390 px, never opening the studio", async ({ context, page }) => {
  // 390 × 844 exactly — the phone project's own device is 412 wide.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  await signIn(context, emails.admin);

  // 1 · The session's own admin address — the hub lands an admin on the schedule.
  await page.goto(`/ar/app/admin/sessions/${sessionId}`);
  await expect(page).toHaveURL(new RegExp(`/ar/app/admin/sessions/${sessionId}/schedule$`));
  const strip = main(page).getByRole("navigation", { name: "إعدادات الجلسة", exact: true });
  await expect(strip.getByRole("link", { name: "الجدولة", exact: true })).toHaveAttribute("aria-current", "page");

  // 2 · The poster, under the picker: one primary «تنزيل الملصق», through the route.
  const poster = main(page).getByRole("link", { name: "تنزيل الملصق", exact: true });
  await expect(poster).toHaveCount(1);
  await expect(poster).toHaveAttribute("href", `/api/designer/downloads/${posterArtifact}`);
  await capture(page, "poster", poster);
  expect(await audited(posterArtifact)).toBe(0);
  await take(page, `/api/designer/downloads/${posterArtifact}`, page.url(), "image/png", "poster-master.png");
  expect(await audited(posterArtifact)).toBe(1);

  // 3 · The strip to «الشهادات», and the certificate's own download there.
  await strip.getByRole("link", { name: "الشهادات", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/app/admin/sessions/${sessionId}/certificates$`));
  // wave 23: the visible word is the board's «PDF», and the name begins with it (SC 2.5.3).
  const cert = main(page).getByRole("link", { name: `PDF — نزّل شهادة ${RECIPIENT}`, exact: true });
  await expect(cert).toHaveAttribute("href", `/api/designer/downloads/${certArtifact}`);
  // SC 2.5.8: the download a staff member taps on a phone is a target, not a word.
  const box = await cert.boundingBox();
  if (!box) throw new Error("the certificate's download has no box");
  expect(Math.min(box.width, box.height), "SC 2.5.8 — the target is at least 24 × 24 px").toBeGreaterThanOrEqual(24);
  await capture(page, "certificate", cert);
  await take(page, `/api/designer/downloads/${certArtifact}`, page.url(), "application/pdf", `certificate-${SERIAL}.pdf`);
  expect(await audited(certArtifact)).toBe(1);

  // 4 · ★ The owner's complaint, closed: the studio was never on the way.
  expect(visited.length).toBeGreaterThanOrEqual(2);
  expect(visited.filter((p) => p.includes("/app/admin/designer"))).toEqual([]);
});
