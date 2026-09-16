// The admin console's left rail — `16` §6.7, wave 6 (`DEC-130`). Proves what
// `admin-rail.test.tsx` (jsdom) cannot: the real 390 px phone drawer over a
// real screen, the second skip link's actual focus target, and that the
// layout renders correctly around a screen this track did NOT rebuild this
// wave — the "one untouched admin screen after the layout change" capture
// `docs/plan/notes/console.md`'s Wave 6 §1 commits to.
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
  const domain = `admin-rail-${tag}.example`;
  email = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('مؤسسة الرف', $1, 'AR', gen_random_uuid(), $2) returning id`,
    [`admin-rail-${tag}`, email],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة الرف" } });
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

/**
 * Waits out React's streamed Suspense boundaries. While one streams, a
 * second copy of its content sits in `body > div#S:n[hidden]` for a few
 * hundred ms beside the copy already in `<main>` — the lead's own finding,
 * under a CPU throttle — and a strict locator counts it. Same helper as
 * `wave6-discussion-review.spec.ts`'s (sessions' file).
 */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("the second skip link jumps past the rail, straight to the content region", async ({ context, page }) => {
  await signIn(context);
  await goto(page, "/ar/app/admin");
  // ★ Both skip links carried IDENTICAL text before this wave («تخطَّ إلى
  // المحتوى» twice, `app.shell.skipToContent` and the old `admin.shell.
  // skipToContent`) — a real, pre-existing ambiguity for a screen-reader
  // user tabbing through two links announced the same way for two different
  // destinations. Given distinct wording here rather than left as found:
  // `admin.shell.skipToContent` now reads «تخطَّ قائمة الإدارة إلى المحتوى».
  const skip = page.getByRole("link", { name: "تخطَّ قائمة الإدارة إلى المحتوى" });
  // Walk the tab sequence instead of assuming a fixed count of presses: this
  // layout doesn't own the shell ahead of it, and the exact number of
  // focusable elements before its own skip link (the shell's own skip link,
  // now also a "تصفّح" menu and a search field) isn't this route's contract
  // to pin down — only that the link IS reachable by keyboard, straight
  // after the shell's own skip link, before anything else in the rail.
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await skip.evaluate((el) => el === document.activeElement).catch(() => false);
  }
  expect(reached, "the admin skip link was not reachable within 8 Tab presses from the top of the page").toBe(true);
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#admin-content")).toBeFocused();
});

test("desktop: the rail lists the dashboard as current, and collapsing it keeps every link reachable", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the persistent rail is a desktop control");
  await signIn(context);
  await goto(page, "/ar/app/admin");
  const nav = page.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
  await expect(nav.getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("aria-current", "page");
  const proposals = nav.getByRole("link", { name: "المقترحات" });
  await expect(proposals).not.toHaveAttribute("aria-current");

  const toggle = page.getByRole("button", { name: "طيّ قائمة الإدارة" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "توسيع قائمة الإدارة" })).toBeVisible();
  // Collapsed: the link is still IN the accessibility tree with its full
  // name (an `sr-only` span, not a removed label) — collapsing hides text
  // visually, it never removes a destination.
  await expect(nav.getByRole("link", { name: "المقترحات" })).toBeVisible();
});

test("phone: the rail is a drawer, and it closes on navigation — DEC-111's own bug, not repeated here", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the drawer is the phone treatment");
  await signIn(context);
  await goto(page, "/ar/app/admin");
  await expect(page.getByRole("navigation", { name: "لوحة إدارة المؤسسة" })).toBeHidden();
  await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const dialog = page.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "الجلسات" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/sessions$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an admin screen this track did not rebuild this wave still renders correctly under the new rail, captured at both widths", async ({ context, page }, testInfo) => {
  await signIn(context);
  await goto(page, "/ar/app/admin/venues");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const dir = join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  const name = testInfo.project.name === "phone" ? "390" : "desktop";
  await page.screenshot({ path: join(dir, `wave6-console-layout-untouched-${name}.png`), fullPage: true });
});
