// The signed-in side of M1, against REAL local Supabase: the platform's
// NEXT_PUBLIC_ variables are inlined at build time, so the build under test
// must have been made with .env.local pointing at `supabase start`
// (`npm run test:e2e:local`). Skipped when the local service key is not
// provided — CI has no Supabase; the RLS suite covers the database there.
//
// The session is minted the way the app would receive it: a user created
// through the local Auth admin API, a member row provisioned by the same
// RPC the callback uses, a password sign-in through @supabase/ssr with a
// captured cookie jar, and those cookies handed to the browser.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

// Playwright runs the desktop and phone projects in parallel workers, each
// with its own beforeAll/afterAll. One shared org would be torn down by
// whichever worker finishes first while the other is mid-test — so every
// worker gets its own org, domain and user, and the specs run serially
// within the worker.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EE', gen_random_uuid()) returning id`,
    [`e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.companies (org_id, name) values ($1, 'شركة الاختبار')`, [orgId]);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs in with the password and installs the resulting cookies in the browser context. */
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
  // Provision through the same RPC the OAuth callback uses, then refresh so
  // the token carries the org claims (0006).
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  expect(["provisioned", "member"]).toContain((envelope as { status: string }).status);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ Wave 27 (DEC-254 §2.5, DEC-255, REQ-PRF-012): a member's company follows their email domain, so the home no
// longer nudges one with none to choose — the case now proves nothing asks.
test("a member lands on the home, and nothing asks them to choose a company", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app");
  // ★ wave 18 (DEC-205 §2, REQ-UIX-055): home is the feed and `/app` is its own page; the timeline
  // is `/app/sessions`' alone. The address stays, and the heading is the home's.
  await expect(page).toHaveURL(/\/ar\/app$/);
  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toHaveText("الرئيسية");
  // ★ Wave 27 (DEC-254 §2.5): no company nudge — a missing company refuses nothing.
  await expect(page.getByText("اختر شركتك", { exact: false })).toHaveCount(0);
});

test("a member updates their profile through the action and the column grant", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/me");
  const main = page.locator("#main");
  // ★ Wave 20 (SCR-021 rebuilt, REQ-UIX-071): the hub's h1 is «حسابي» and «ملفي» its h2; the profile is read by
  // default and edited through «عدّل ملفك» (`/app/me?edit`).
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("حسابي");
  await expect(main.getByRole("heading", { level: 2, name: "ملفي" })).toBeVisible();
  // Interact after hydration: this test is about the action and the column grant.
  await page.waitForLoadState("networkidle");
  await main.getByRole("link", { name: "عدّل ملفك" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/me\?edit/);
  // ★ Wave 27 (DEC-254 §2.5, REQ-PRF-012): the company follows the email domain — no company control to fill.
  await expect(main.getByLabel("الشركة", { exact: false })).toHaveCount(0);
  await main.getByLabel("المسمى الوظيفي", { exact: false }).fill("مهندسة برمجيات");
  await main.getByLabel("نبذة", { exact: false }).fill("أحب مشاركة المعرفة.");
  await main.getByRole("button", { name: "حفظ" }).click();
  // ★ Wave 20: «تم الحفظ» is a toast, and the page returns to read mode — the saved value is a row.
  await expect(page.getByText("تم الحفظ", { exact: true })).toBeVisible();
  await expect(main.getByRole("region", { name: "ملفي" }).getByText("مهندسة برمجيات")).toBeVisible();
  // ★ Wave 27 (DEC-254 §2.5): the home never nudged for a company again, before or after the save.
  await page.goto("/ar/app");
  await expect(page.getByText("اختر شركتك", { exact: false })).toHaveCount(0);
});

test("another member's profile renders at the member tier", async ({ context, page }) => {
  await signIn(context);
  const { rows } = await db.query<{ id: string }>(`select id from public.members where auth_user_id = $1`, [userId]);
  await page.goto(`/ar/app/members/${rows[0].id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("عضو الاختبار");
  await expect(page.getByText(email)).toHaveCount(0); // email is not in the member tier
});

test("signing out ends the session", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app");
  // Sign-out is the last item of the account menu, at both widths (DEC-111).
  await page.getByRole("button", { name: "حسابي" }).click();
  await page.getByRole("menuitem", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/ar\/sign-in$/);
  await page.goto("/ar/app");
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=/);
});
