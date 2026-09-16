// ★★ DEC-111's gate — the owner's stuck dropdown, and the class it belongs to.
//
// Both shell menus were native `<details>`. A `<details>` has no reason to close
// when a link inside it is followed, and under Partial Rendering the layout
// never re-renders on navigation, so the panel hung over the destination. It
// also ignored `Escape` and outside clicks, and two could be open at once.
// REQ-UIX-023 names all four, and each is asserted here — because under
// Partial Rendering "it closed when I tried it" is not evidence of anything.
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
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `shell-menus-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القوائم', $1, 'SM', gen_random_uuid()) returning id`,
    [`shell-menus-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
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
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const header = (page: import("@playwright/test").Page) => page.locator("header").first();

test("★ following a link inside the account menu leaves no menu over the destination", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/leaderboards");
  await header(page).getByRole("button", { name: "حسابي" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "نقاطي" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/me\/points$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("★ Escape closes the menu and returns focus to the control that opened it", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/leaderboards");
  const trigger = header(page).getByRole("button", { name: "حسابي" });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("★ an outside click closes the menu", async ({ context, page }, testInfo) => {
  await signIn(context);
  await page.goto("/ar/app/leaderboards");
  await header(page).getByRole("button", { name: "حسابي" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  // In RTL the account menu opens at the LEFT edge (its inline end), so the
  // outside point is on the right, well clear of it.
  const { width } = page.viewportSize()!;
  // The phone project is a touch device: a tap is the honest outside press there.
  // ★ Retried as a unit: Radix registers its outside-press listener a tick AFTER the
  // menu opens, so a press in that tick is not "outside" yet — it passed alone 5/5
  // and lost the race once under two workers. The assertion is the behaviour, not
  // the timing.
  await expect(async () => {
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(width - 30, 420);
    else await page.mouse.click(width - 30, 420);
    await expect(page.getByRole("menu")).toHaveCount(0, { timeout: 500 });
  }).toPass({ timeout: 5000 });
});

test("★ desktop: «تصفّح» closes on navigation, and never two menus are open at once", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "«تصفّح» is a desktop control; the phone reaches it from the tab bar");
  await signIn(context);
  await page.goto("/ar/app/me/points");
  // Measured BEFORE a menu opens: a modal menu hides the rest of the page from
  // the accessibility tree, so the other trigger cannot be found by role after.
  const account = await header(page).getByRole("button", { name: "حسابي" }).boundingBox();
  await header(page).getByRole("button", { name: "تصفّح" }).click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  // One open at a time: pressing the OTHER trigger while a menu is open is an
  // outside press, so it dismisses the open menu — it can never stack a second.
  await page.mouse.click(account!.x + account!.width / 2, account!.y + account!.height / 2);
  await expect.poll(() => page.getByRole("menu").count()).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await header(page).getByRole("button", { name: "تصفّح" }).click();
  await page.getByRole("menuitem", { name: "لوحة الصدارة" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/leaderboards$/);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("the header and its open menu, captured for the icon-position review at both widths", async ({ context, page }, testInfo) => {
  await signIn(context);
  await page.goto("/ar/app/leaderboards");
  const dir = join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  const name = testInfo.project.name === "phone" ? "390" : "desktop";
  await page.screenshot({ path: join(dir, `wave6-shell-header-${name}.png`), clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 120 } });
  await header(page).getByRole("button", { name: "حسابي" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.screenshot({ path: join(dir, `wave6-shell-account-menu-${name}.png`), clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 560 } });
  if (testInfo.project.name === "phone") {
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: join(dir, "wave6-shell-tabbar-390.png"), fullPage: false });
  }
});
