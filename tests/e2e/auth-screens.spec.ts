// The three (auth) screens on the design system — DEC-129, DEC-130, DEC-131.
//
// Two halves. The first runs against the stubbed server like auth.spec.ts:
// SC 3.3.8 as it actually applies to a screen with no credential field, the
// next action on every no-access reason, no horizontal scroll at 390 px, and
// the captures a human looks at. The second needs local Supabase, because
// choose-org only renders for a signed-in user whose domain matches two orgs.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "platform unconfigured: covered by unconfigured.spec.ts");

const PHONE = { width: 390, height: 844 };

async function capture(page: Page, name: string) {
  // `E2E_SHOTS_DIR` lets a run in the verification worktree land its captures where STATUS cites them.
  const dir = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `wave6-auth-${name}-390.png`), fullPage: true });
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page must not scroll sideways at 390 px").toBeLessThanOrEqual(1);
}

test.describe("sign-in and no-access, signed out", () => {
  test("★ SC 3.3.8: sign-in asks for no cognitive function test — no field to type into, one named action, nothing intercepting paste", async ({ page }) => {
    await page.goto("/ar/sign-in");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("الدخول إلى كريم معرفة");
    // DEC-131: authentication is Google's; our step is one button. If a code
    // field ever arrives, DEC-129's three clauses bind it — and this fails first.
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.locator('input:not([type="hidden"])')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "الدخول عبر Google" })).toBeVisible();
    const blockers = await page.evaluate(
      () => document.querySelectorAll("[onpaste],[oncopy],[oncut],[autocomplete='off']").length,
    );
    expect(blockers).toBe(0);
    // Western digits only, on the first screen every member sees (DEC-124).
    expect(await page.locator("main").innerText()).not.toMatch(/[٠-٩۰-۹]/);
  });

  test("the refused-domain error is an alert on a readable surface, and names no org", async ({ page }) => {
    await page.goto("/ar/sign-in?error=domain");
    const alert = page.getByRole("alert").filter({ hasText: "منصة خاصة بمؤسسات محددة" });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText("example");
  });

  test("★ no-access is never a dead end: every reason offers a next action", async ({ page }) => {
    await page.goto("/ar/no-access");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لا يمكن الدخول");
    // The likeliest cause is the wrong Google account, so that is the primary act.
    await expect(page.getByRole("button", { name: "الدخول بحساب آخر" })).toBeVisible();
    for (const [reason, heading] of [
      ["suspended", "هذه المؤسسة موقوفة حاليًا"],
      ["deactivated", "تم إيقاف حسابك"],
    ] as const) {
      await page.goto(`/ar/no-access?reason=${reason}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
      await expect(page.getByRole("link", { name: "العودة للرئيسية" })).toBeVisible();
    }
  });

  test("390 px RTL: sign-in, its error, and no-access read down the page — captured for review", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project (TEAM.md §5)");
    await page.setViewportSize(PHONE);
    await page.goto("/ar/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expectNoSidewaysScroll(page);
    await capture(page, "sign-in");
    await page.goto("/ar/sign-in?error=domain");
    await expectNoSidewaysScroll(page);
    await capture(page, "sign-in-error");
    await page.goto("/ar/no-access");
    await expectNoSidewaysScroll(page);
    await capture(page, "no-access");
  });
});

// ── choose-org needs a real ambiguous sign-in ──────────────────────────────
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";

test.describe("choose-org", () => {
  test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
  test.describe.configure({ mode: "serial" });

  let db: pg.Client;
  let admin: ReturnType<typeof createClient>;
  const orgIds: string[] = [];
  let userId = "";
  let email = "";

  test.beforeAll(async ({}, testInfo) => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
    db = new pg.Client(DB_URL);
    await db.connect();
    const tag = `${testInfo.workerIndex}-${Date.now()}`;
    const domain = `choose-org-${tag}.example`;
    // Two orgs claiming one domain: the only case REQ-AUT-004 shows the picker.
    for (const [name, prefix] of [["مؤسسة الشمال", "NO"], ["Southern Studio الجنوب", "SO"]] as const) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, $3, gen_random_uuid()) returning id`,
        [name, `choose-${prefix.toLowerCase()}-${tag}`, prefix],
      );
      orgIds.push(rows[0].id);
      await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
      await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, domain]);
    }
    email = `member@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    for (const id of orgIds) await db.query(`delete from public.orgs where id = $1`, [id]);
    await db.end();
  });

  // Signed in, NOT provisioned: the member row is what choose-org creates.
  async function signInUnprovisioned(context: BrowserContext) {
    const jar: { name: string; value: string }[] = [];
    const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
      cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
    });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  }

  test("offers both orgs as a named radio group, isolates each name, says the choice is final, and captures at 390 px", async ({ context, page }, testInfo) => {
    await signInUnprovisioned(context);
    await page.setViewportSize(PHONE);
    await page.goto("/ar/choose-org");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("اختر مؤسستك");
    const group = page.getByRole("radiogroup", { name: "مؤسستك" });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(group.locator("bdi")).toHaveCount(2);
    await expect(page.getByText("هذا الاختيار نهائي")).toBeVisible();
    await expectNoSidewaysScroll(page);
    if (testInfo.project.name === "phone") await capture(page, "choose-org");
  });
});
