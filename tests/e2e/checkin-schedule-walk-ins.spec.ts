// SCR-043's schedule form — the walk-in checkbox's own regression guard
// against real local Supabase (DEC-117, DEC-118, checkin's feature-only
// field on `sessions`'/`console`'s own screen). This is not a test of the
// whole form (that's `sessions`'/`console`'s), only of the one thing this
// track found broken in its own history: `schedule-form.tsx`'s checkbox
// used to render unchecked for every session regardless of its real
// stored value, because `initial.allowWalkIns` was optional and defaulted
// to `false` (the interim marker at `3c140bf`, the real fix at `343991d`,
// the cleanup at `9acc4bf` — docs/plan/notes/checkin.md). A session
// created here with `allow_walk_ins = true` proves the checkbox renders
// CHECKED — the read-back working, not merely compiling.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// `E2E_SHOTS_DIR` — see checkin.spec.ts's own comment; the same helper
// shape `wave7-content-me.spec.ts` established, so a verification
// worktree's capture lands at the main checkout's path STATUS.md cites.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let sessionId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `checkin-schedule-walkins-${tag}.example`;
  adminEmail = `boss@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الجدولة', $1, 'SC', gen_random_uuid(), $2) returning id`,
    [`checkin-schedule-walkins-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الجدولة') returning id`, [orgId]);

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الجدولة" } });
  if (error) throw error;
  userIds.push(data.user.id);

  const provisionClient = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await provisionClient.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: envelope, error: rpcError } = await provisionClient.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);

  // `draft` is enough — 0010's own check constraint requires a venue and a
  // capacity only once the session reaches `published`; nothing about
  // scheduling itself is what this spec proves, only the checkbox's own
  // read-back.
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, allow_walk_ins)
     values ($1, 'جلسة اختبار خيار الحضور دون حجز', 'ملخص الجلسة', $2, 'introductory', true)
     returning id`,
    [orgId, catRows[0].id],
  );
  sessionId = sessRows[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test("DEC-117/DEC-118: a session with allow_walk_ins already on renders the checkbox CHECKED, at 390px", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(context);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // ★ The whole point: `initial.allowWalkIns` reading the stored `true`
  // back, not the `false` fallback the hazard shipped. A checkbox that
  // renders unchecked here — with the RIGHT session, the RIGHT stored
  // value — is exactly what 343991d closed and this guards against
  // regressing.
  const checkbox = page.getByRole("checkbox", { name: "السماح بالحضور دون حجز مسبق" });
  await expect(checkbox).toBeChecked();

  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "wave7-checkin-schedule-walk-ins.png"), fullPage: true });
});
