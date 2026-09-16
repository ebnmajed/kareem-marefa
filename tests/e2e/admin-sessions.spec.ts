// SCR-042 · /app/admin/sessions — top level only, rebuilt onto the system
// (wave 6, `16` §6.7, `DEC-130`). `tests/e2e/sessions-screens.spec.ts` (wave
// 1's file) already proves the propose → session → schedule → publish round
// trip end to end; this file proves what changed this wave and that file
// does not exercise: the PageHeader, the DataTable's status badge and row
// menu (locale-aware since this track's own `menu.tsx` fix), the search box,
// and cancel's confirm dialog — always-visible controls, never gated behind
// an extra click (the regression this track found against its own first
// draft, guarded again here as it is in the jsdom test).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

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
  const domain = `admin-sess-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة الجلسات', $1, 'AS', gen_random_uuid(), $2) returning id`,
    [`admin-sess-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الجلسات') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الجلسات', 30) returning id`, [orgId]);

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الجلسات" } });
  if (error) throw error;
  userIds.push(data.user.id);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة قابلة للبدء', 'ملخص الجلسة', $2, 'introductory', now() + interval '2 days', 60, now() + interval '2 days 1 hour', $3, 30, 'published', now())
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test("the page header, the status badge and the search box all render for real data", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/admin/sessions");
  await expect(page.getByRole("heading", { name: "الجلسات", level: 1 })).toBeVisible();
  await expect(page.getByText("التسجيل مفتوح")).toBeVisible(); // published + future starts_at → the shared "open" badge, not a raw "published" string

  await page.getByRole("searchbox", { name: "ابحث في الجلسات" }).fill("لا يوجد شيء بهذا الاسم");
  await expect(page.getByText("لا جلسات مطابقة لبحثك.")).toBeVisible();
});

test("★ the row menu navigates locale-aware, and start/cancel stay ALWAYS visible — not gated behind the menu", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/admin/sessions");

  // The regression this guards: an earlier draft hid these behind a row-menu
  // click, which would have broken sessions-screens.spec.ts's own assumption.
  await expect(page.getByRole("button", { name: "ابدأ الجلسة الآن" })).toBeVisible();

  await page.getByRole("button", { name: /مزيد من الإجراءات على جلسة قابلة للبدء/ }).click();
  const open = page.getByRole("menuitem", { name: "فتح الجلسة" });
  await expect(open).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions/${sessionId}$`));
});

test("★ cancelling confirms in a dialog naming the session — cancel changes nothing in the database, confirm does", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/admin/sessions");
  await page.getByText("ألغِ الجلسة").click();
  await page.getByLabel("سبب الإلغاء الذي سيصل الحاضرين").fill("سبب الإلغاء لهذا الاختبار");
  await page.getByRole("button", { name: "أكّد الإلغاء" }).click();

  const dialog = page.getByRole("dialog", { name: "إلغاء «جلسة قابلة للبدء»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تراجع" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId])).rows[0].state).toBe("published");

  await page.getByRole("button", { name: "أكّد الإلغاء" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإلغاء" }).click();
  await expect(page.getByRole("status")).toContainText("تم تنفيذ الإجراء");
  expect((await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId])).rows[0].state).toBe("cancelled");
});
