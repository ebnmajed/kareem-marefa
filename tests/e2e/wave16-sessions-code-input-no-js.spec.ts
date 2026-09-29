// Wave 16, STATUS F1 — `ui/code-input` without JavaScript (REQ-CHK-003,
// REQ-UIX-035, DEC-197's closing entry).
//
// ★ The defect: the six boxes are a controlled component, and only React fills
// the hidden `code` field they post through. With JavaScript off a member typed
// a correct code, posted an empty one, and was told it was wrong. The server
// now renders one labelled field under the same name; this walks that path on a
// real build: JavaScript disabled, the code typed, the form posted, the member
// checked in — by the check-in screen's own no-JS path (`?success=1`), and in
// the database.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w16-nojs-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الرمز دون جافاسكربت', $1, 'WN', gen_random_uuid()) returning id`,
    [`w16-nojs-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  // Running now, walk-ins on, the room's switch open: any member of the org may check in with the code.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, capacity, state, published_at, allow_walk_ins, custom_venue_name)
     values ($1, 'جلسة الرمز', 'ملخص', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', 40, 'in_progress', now() - interval '1 day', true, 'القاعة')
     returning id`,
    [orgId, cat[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: string, asAdmin = false): Promise<string> {
  const email = `${who}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `عضو ${who}` } });
  if (error && !/already/i.test(error.message)) throw error;
  if (data?.user) users.push(data.user.id);
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  // The role is in the token, so the session is refreshed after it is set.
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return memberId;
}

test("★ with JavaScript off, a member types the code into the one field and is checked in", async ({ browser }, testInfo) => {
  // The code, from the host view, as staff read it out in the room.
  const staff = await browser.newContext();
  await signIn(staff, `host-${testInfo.project.name}`, true);
  const host = await staff.newPage();
  await host.goto(`/ar/app/sessions/${sessionId}/host`);
  const code = (await host.locator("#main p[dir='ltr']").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  await staff.close();

  const context = await browser.newContext({ javaScriptEnabled: false });
  const memberId = await signIn(context, `nojs-${testInfo.project.name}`);
  const page = await context.newPage();
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  const main = page.locator("#main");

  // One visible field that posts `code` — no boxes, nothing React must fill.
  await expect(main.locator("input[maxlength='1']")).toHaveCount(0);
  const field = main.locator("input[name='code']");
  await expect(field).toHaveCount(1);
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("maxlength", "6");
  // Typed as a member types it: lower case is the same code (compared upper-cased, `0105:279`).
  await field.fill(code.toLowerCase());
  await main.getByRole("button", { name: "تسجيل الحضور" }).last().click();

  // The no-JS path's own answer, unchanged since before the wave.
  await expect(page).toHaveURL(/\/check-in\?success=1$/);
  const rows = await db.query<{ method: string }>(
    `select method from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null`,
    [sessionId, memberId],
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0].method).toBe("code");
  await context.close();
});
