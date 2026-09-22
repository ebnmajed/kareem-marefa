// REQ-NFR-007 — the accessibility pass over EVERY screen, WCAG 2.2 AA (M13, STATUS row L6).
//
// `a11y.spec.ts` scans fourteen key screens and fails on the first serious finding. This sweep visits
// every `page.tsx` under `src/app/[locale]` — 64 of them, each as the role that can open it, with the
// entity it needs seeded here from empty — and COLLECTS rather than stops: every finding lands in
// `.qa-shots/a11y/wave11-sweep-<project>.jsonl` — one line per route, appended, because a soft
// failure restarts the worker and an end-of-run write would keep only the last worker's routes — with its rule, impact, selectors and route, so the lead
// can route each one to the file's owner as a written row. A route is a soft failure when it has a
// `serious` or `critical` finding; `moderate` and `minor` are recorded and do not fail — axe is the
// floor, not the standard (`13` §2).
//
// Two routes are not scanned here, deliberately: `/ui` (the dev gallery — it is the design system's
// own regression net, not a screen a person meets) and `[...rest]` (the 404, which `frozen-routes`
// and the loading model already cover). `verify/[code]` is scanned on an unknown code, which is the
// state an outsider typing a code by hand most often meets.
import AxeBuilder from "@axe-core/playwright";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OUT = join(process.cwd(), ".qa-shots", "a11y");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Not serial: a soft failure on one role must not skip the others. One worker keeps the order.
test.describe.configure({ mode: "default" });
test.setTimeout(20 * 60_000);


let admin: ReturnType<typeof createClient>;
let db: pg.Client;
const userIds: string[] = [];
let orgId = "";
const ids: Record<string, string> = {};
const emails: Record<"member" | "admin" | "platform", string> = { member: "", admin: "", platform: "" };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const domain = `a11y-sweep-${tag}.example`;
  emails.member = `member@${domain}`;
  emails.admin = `admin@${domain}`;
  emails.platform = `super@platform-sweep-${tag}.example`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المسح الشامل', $1, 'SW', gen_random_uuid(), $2) returning id`,
    [`a11y-sweep-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة المسح', 40) returning id`, [orgId]);
  ids.category = cat[0].id;

  for (const [key, email, name] of [["member", emails.member, "عضو المسح"], ["admin", emails.admin, "مسؤولة المسح"], ["platform", emails.platform, "مدير المنصة"]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    ids[`${key}Auth`] = data.user.id;
  }
  await db.query(`insert into public.platform_admins (auth_user_id) values ($1)`, [ids.platformAuth]);

  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة المسح الشامل', 'جلسة يُفحص فيها كل شيء بلوحة المفاتيح وقارئ الشاشة.', $2, 'introductory',
             now() + interval '3 days', 60, now() + interval '3 days 1 hour', $3, 40, 'published', now())
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  ids.session = sess[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string, provision: boolean) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  if (provision) {
    const { error: rpcError } = await client.rpc("provision_member");
    if (rpcError) throw rpcError;
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function scan(page: Page, route: string, role: string, exclude?: string) {
  await page.goto(route);
  await expect(page.locator("main, [role=main]").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (exclude) builder.exclude(exclude);
  const results = await builder.analyze();
  mkdirSync(OUT, { recursive: true });
  const line = {
    project: test.info().project.name,
    role,
    route,
    findings: results.violations.map((v) => ({ rule: v.id, impact: v.impact ?? "unknown", help: v.help, targets: v.nodes.slice(0, 8).map((n) => n.target.join(" ")) })),
  };
  appendFileSync(join(OUT, `wave11-sweep-${line.project}.jsonl`), JSON.stringify(line) + "\n");
  // SWEEP_SHOTS=1: a 390 px capture of every route the sweep visits, for the lead to open in bands.
  if (process.env.SWEEP_SHOTS && line.project === "phone") {
    const slug = route.replace(/^\/ar\/?/, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "id").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "landing";
    const dir = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
    await page.screenshot({ path: join(dir, `wave11-sweep-${role}-${slug}.png`), fullPage: true });
  }
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(blocking.map((v) => `${v.id} ×${v.nodes.length}`), `${role} ${route}`).toEqual([]);
}

test("public — no session", async ({ page }) => {
  for (const route of ["/ar", "/en", "/ar/register", "/ar/sign-in", "/ar/legal/privacy", "/ar/legal/terms", `/ar/s/${ids.session}`, "/ar/verify/SW-0000-XXXX", "/ar/no-access"]) {
    await scan(page, route, "anon");
  }
});

test("member", async ({ context, page }) => {
  await signIn(context, emails.member, true);
  const { rows: m } = await db.query<{ id: string }>(`select id from public.members where auth_user_id = $1`, [ids.memberAuth]);
  ids.member = m[0].id;
  const { rows: p } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level)
     values ($1, $2, 'مقترح المسح', 'نبذة المقترح', $3, 'introductory') returning id`,
    [orgId, ids.member, ids.category],
  );
  ids.proposal = p[0].id;
  // A converted document with one page, so the viewer renders its real frame rather than a gate.
  const { rows: mat } = await db.query<{ id: string }>(
    // phase 'before': the session is three days away, and an 'after' material (the default) is hidden
    // from members until it ends — the viewer would answer 404 and the sweep would scan the wrong page.
    `insert into public.materials (org_id, session_id, kind, title, phase, render_status, added_by)
     values ($1, $2, 'pdf', 'شرائح المسح', 'before', 'ready', $3) returning id`,
    [orgId, ids.session, ids.member],
  );
  ids.material = mat[0].id;
  const { rows: ver } = await db.query<{ id: string }>(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, $3, 1024, 'application/pdf', repeat('a', 64), $4) returning id`,
    [orgId, ids.material, `${orgId}/materials/${ids.material}/v1.pdf`, ids.member],
  );
  await db.query(`update public.materials set current_version_id = $1 where id = $2`, [ver[0].id, ids.material]);
  await db.query(
    `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height)
     values ($1, $2, 1, $3, $4, 1600, 900)`,
    [orgId, ver[0].id, `${orgId}/pages/${ver[0].id}/1.webp`, `${orgId}/pages/${ver[0].id}/1-thumb.webp`],
  );

  const s = ids.session;
  for (const route of [
    "/ar/app", "/ar/app/sessions", `/ar/app/sessions/${s}`, `/ar/app/sessions/${s}/check-in`, `/ar/app/sessions/${s}/rate`,
    `/ar/app/sessions/${s}/materials/${ids.material}`,
    "/ar/app/me", "/ar/app/me/points", "/ar/app/me/certificates", "/ar/app/me/bookmarks", "/ar/app/me/calendar",
    "/ar/app/me/notifications", "/ar/app/me/privacy", "/ar/app/leaderboards", "/ar/app/propose",
    `/ar/app/propose/${ids.proposal}`, `/ar/app/propose/${ids.proposal}/edit`,
  ]) {
    await scan(page, route, "member");
  }
});

test("admin", async ({ context, page }) => {
  await signIn(context, emails.admin, true);
  const { rows: m } = await db.query<{ id: string }>(`select id from public.members where auth_user_id = $1`, [ids.adminAuth]);
  ids.admin = m[0].id;
  const { rows: tpl } = await db.query<{ id: string }>(
    `insert into public.survey_templates (org_id, title) values ($1, 'استبانة المسح') returning id`,
    [orgId],
  );
  ids.surveyTemplate = tpl[0].id;
  const { rows: version } = await db.query<{ id: string; document: unknown }>(
    `select v.id, v.document from public.design_template_versions v join public.design_templates t on t.id = v.template_id
      where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk' order by v.version desc limit 1`,
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(version[0].document), version[0].id, ids.session],
  );
  ids.document = doc[0].id;

  const s = ids.session;
  for (const route of [
    "/ar/app/admin", "/ar/app/admin/proposals", "/ar/app/admin/sessions", `/ar/app/admin/sessions/${s}/schedule`,
    `/ar/app/admin/sessions/${s}/attendance`, `/ar/app/admin/sessions/${s}/certificates`, `/ar/app/admin/sessions/${s}/survey`,
    "/ar/app/admin/members", "/ar/app/admin/moderation/reports", "/ar/app/admin/moderation/comments", "/ar/app/admin/moderation/photos",
    "/ar/app/admin/venues", "/ar/app/admin/categories", "/ar/app/admin/companies", "/ar/app/admin/settings",
    "/ar/app/admin/audit", "/ar/app/admin/exports", "/ar/app/admin/reminders", "/ar/app/admin/recognition", "/ar/app/admin/scoring",
    "/ar/app/admin/emails", "/ar/app/admin/branding", "/ar/app/admin/surveys", `/ar/app/admin/surveys/${ids.surveyTemplate}`,
    "/ar/app/admin/templates/posters", "/ar/app/admin/templates/certificates",
    `/ar/app/sessions/${s}/host`, `/ar/app/members/${ids.admin}`,
  ]) {
    await scan(page, route, "admin");
  }
  // The studio last, and without its canvas frame: the frame is the rendered poster — artwork named by its
  // `title` (4.1.2), not interface — and axe walking a full-bleed render inside it outran the test's budget.
  // …and without its per-layer hit boxes: each is sized to its layer, so a small layer is under SC 2.5.8's
  // 24 px, and the criterion's «equivalent» exception applies — the Layers panel selects the same layer
  // with a 44 px row (`layer-list.tsx`). Excluded by the attribute canvas.tsx names it with.
  await scan(page, `/ar/app/admin/designer/${ids.document}`, "admin", "iframe, [data-layer-hit-area]");
});

test("platform admin", async ({ context, page }) => {
  await signIn(context, emails.platform, false);
  for (const route of [
    "/ar/app/platform", "/ar/app/platform/orgs", "/ar/app/platform/orgs/new", `/ar/app/platform/orgs/${orgId}/domains`,
    "/ar/app/platform/templates", "/ar/app/platform/metrics", "/ar/app/platform/impersonate",
  ]) {
    await scan(page, route, "platform");
  }
});
