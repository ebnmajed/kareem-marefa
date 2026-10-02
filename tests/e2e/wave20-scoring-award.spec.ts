// Wave 20, PR C — the photo award on SCR-022 (REQ-UIX-083, STORY-UIX-073, DEC-222, DEC-043). scoring's spec; the lead
// runs it on a production build once `w20c_0001_photo_award.sql` is promoted.
//
// Seeded through the REAL pipeline: each photo goes through `award_photo_points()`, and the job it enqueued is run
// as the worker's `award_points` task runs it — never a hand-written ledger row:
//   · ★ one photo past the session's cap earns 0 and NO ledger row holds it;
//   · ★ SCR-022 explains it in place as `0` with «الحد: صورتان لكل جلسة» — photos, not comments.
// Captures: `.qa-shots/rtl/wave20-scoring-022-photo-cap-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
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
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";
let photoSessionId = "";
let photoTitle = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w20-award-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الصور', $1, 'WA', gen_random_uuid()) returning id`,
    [`w20-award-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // A photo cap small enough to reach, and no cooldown, so three photos in a row are judged by the cap alone.
  await db.query(`update public.scoring_rules set cap_per_session = 2, cooldown = null where org_id = $1 and action_key = 'photo'`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);
  const session = async (title: string) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
       values ($1, $2, 'ملخص', $3, 'introductory', now() - interval '3 hours', 60, now() - interval '2 hours', $4, 40, 'completed', now() - interval '1 day', now() - interval '2 hours')
       returning id`,
      [orgId, title, cat[0].id, venue[0].id],
    );
    return rows[0].id;
  };
  photoTitle = `معرض الصور ${tag}`;
  photoSessionId = await session(photoTitle);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان الاختبار" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return { memberId, client };
}

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(SHOTS, `wave20-scoring-022-${state}-${width < 1024 ? 390 : 1280}.png`), fullPage: true });
}

const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("★★ a photo past the cap earns 0, writes no ledger row, and SCR-022 says why", async ({ context, page }) => {
  if (!desktop(page)) await page.setViewportSize(PHONE);
  const { memberId } = await signIn(context);

  // Three visible photos on one session, each paid through award_photo_points() and its job: the third finds the cap full.
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
       values ($1, $2, $3, $4, 1200, 800, 2048, $5, true) returning id`,
      [orgId, photoSessionId, memberId, `${orgId}/sessions/${photoSessionId}/photos/e2e-${i}-${Date.now()}.jpg`, "a".repeat(64)],
    );
    await db.query(`select public.award_photo_points($1, false)`, [rows[0].id]);
    const { rows: jobs } = await db.query<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string } }>(
      `select j.payload from graphile_worker._private_jobs j where j.key = $1`,
      [`pts:photo:${rows[0].id}:v1`],
    );
    expect(jobs, "★ each visible photo enqueues one award").toHaveLength(1);
    const p = jobs[0].payload;
    await db.query(`select public.award_points($1, $2, $3::public.ledger_source, $4, $5)`, [p.rule, p.member_id, p.source, p.source_id, p.session_id]);
    await db.query(`delete from graphile_worker._private_jobs where key = $1`, [`pts:photo:${rows[0].id}:v1`]);
  }
  const { rows: paid } = await db.query<{ n: number }>(`select count(*)::int as n from public.points_ledger where member_id = $1 and rule_key = 'photo'`, [memberId]);
  expect(paid[0].n, "★ the cap writes no ledger row").toBe(2);

  await page.goto("/ar/app/me/points");
  await expect(page.locator("#main #points-head strong")).toHaveText(/^\d/);

  if (!desktop(page)) {
    const history = page.locator("#main #history");
    const cap = history.locator("li[data-kind=cap]");
    await expect(cap).toHaveCount(1);
    await expect(cap).toContainText("الحد: صورتان لكل جلسة");
    await expect(cap).not.toContainText("تعليق");
    await expect(cap.locator("[data-slot=figure] bdi")).toHaveText("0");
    await expect(cap.getByRole("link", { name: photoTitle })).toHaveAttribute("href", `/ar/app/sessions/${photoSessionId}`);
    await expect(history).not.toContainText(/[٠-٩]/);
  } else {
    await expect(page.locator("#main #history-table")).toContainText("الحد: صورتان لكل جلسة");
  }
  await capture(page, "photo-cap");
});
