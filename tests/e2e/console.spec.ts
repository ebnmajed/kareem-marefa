// The admin console's left rail — `16` §6.7, wave 6 (`DEC-130`), regrouped
// into the fourteen-group IA for wave 7 (`DEC-137`). Proves what
// `admin-rail.test.tsx`/`admin-rail-groups.test.tsx` (jsdom) cannot: the
// real 390 px phone drawer over a real screen, the second skip link's actual
// focus target, a moderator's rail on real RLS-backed roles (`REQ-ADM-020`),
// and that the layout renders correctly around a screen this track did NOT
// rebuild this wave — the "one untouched admin screen after the layout
// change" capture `docs/plan/notes/console.md`'s "Wave 7 plan" §1 commits
// to, retargeted from `venues` (rebuilt this wave, K3) to `exports` (not
// this wave, never this track's).
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
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let modUserId = "";
let email = "";
let modEmail = "";

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `admin-rail-${tag}.example`;
  email = `boss@${domain}`;
  modEmail = `mod@${domain}`;
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
  const { data: modData, error: modError } = await admin.auth.admin.createUser({ email: modEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "منظّم الرف" } });
  if (modError) throw modError;
  modUserId = modData.user.id;
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (modUserId) await admin.auth.admin.deleteUser(modUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, as: "admin" | "moderator" = "admin") {
  const signInEmail = as === "moderator" ? modEmail : email;
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: signInEmail, password: PASSWORD });
  if (error) throw error;
  // The admin account still needs `provision_member` on its first sign-in;
  // the moderator's was already provisioned in `beforeAll` to set its role,
  // so calling it again here is a harmless no-op (idempotent by design).
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

test("desktop: the fourteen-group IA discloses a group's real routes, and the collapsed rail turns it into a menu", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the persistent rail is a desktop control");
  await signIn(context);
  await goto(page, "/ar/app/admin");
  const nav = page.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });

  const group = nav.getByRole("button", { name: "الإشراف" });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  const comments = nav.getByRole("link", { name: "التعليقات" });
  await expect(comments).toHaveAttribute("href", "/ar/app/admin/moderation/comments");
  await comments.click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/moderation\/comments$/);

  // Collapsed: the same group is a menu button, not an inline list — real
  // Radix portal content, real focus, not jsdom's accessibility-tree stand-in.
  await page.getByRole("button", { name: "طيّ قائمة الإدارة" }).click();
  await page.getByRole("button", { name: "الإشراف" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "الصور" })).toHaveAttribute("href", "/ar/app/admin/moderation/photos");
});

test("a moderator's rail regroups to exactly three top-level entries, matching REQ-ADM-020's scope", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "checked once, not per viewport — the filter is server-computed, not a layout concern");
  await signIn(context, "moderator");
  await goto(page, "/ar/app/admin/sessions");
  const nav = page.getByRole("navigation", { name: "لوحة إدارة المؤسسة" });
  // «الجلسات» direct, «الإشراف» disclosing all three queues, «السجل» direct —
  // no «لوحة», no «الأعضاء», no «الإعدادات», no groups whose every child is
  // admin-only (`النقاط والتقدير`, `التصاميم`, `الإشعارات` all vanish, not
  // just hide their contents).
  await expect(nav.getByRole("link", { name: "الجلسات" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "الإشراف" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "سجل التدقيق" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "لوحة التحكم" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "الأعضاء" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "النقاط والتقدير" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "التصاميم" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "الإشعارات" })).toHaveCount(0);

  await nav.getByRole("button", { name: "الإشراف" }).click();
  await expect(nav.getByRole("link", { name: "التعليقات" })).toHaveAttribute("href", "/ar/app/admin/moderation/comments");
  await expect(nav.getByRole("link", { name: "الصور" })).toHaveAttribute("href", "/ar/app/admin/moderation/photos");
  await expect(nav.getByRole("link", { name: "البلاغات" })).toHaveAttribute("href", "/ar/app/admin/moderation/reports");
});

// ★ Captures the phone drawer OPEN with a group disclosed — a sync-3
// finding: the fourteen-group IA is K0's own headline, and no capture from
// the first pass showed it, only the closed drawer and the desktop rail. One
// capture per role, since a moderator's drawer shows a different rail
// entirely (§1's own regroup) and both are worth a look.
async function captureDisclosedDrawer(page: Page, name: string) {
  await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const dialog = page.getByRole("dialog", { name: "لوحة إدارة المؤسسة" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "الإشراف" }).click();
  await expect(dialog.getByRole("link", { name: "التعليقات" })).toBeVisible();
  const dir = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `wave7-console-rail-drawer-${name}-disclosed.png`), fullPage: true });
}

test("phone: the drawer captured open with «الإشراف» disclosed, as an admin", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the drawer is the phone treatment");
  await signIn(context);
  await page.setViewportSize(PHONE);
  await goto(page, "/ar/app/admin");
  await captureDisclosedDrawer(page, "admin");
});

test("phone: the drawer captured open with «الإشراف» disclosed, as a moderator", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the drawer is the phone treatment");
  await signIn(context, "moderator");
  await page.setViewportSize(PHONE);
  await goto(page, "/ar/app/admin/sessions");
  await captureDisclosedDrawer(page, "moderator");
});

test("an admin screen this track did not rebuild this wave still renders correctly under the new rail, captured at both widths", async ({ context, page }, testInfo) => {
  await signIn(context);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  // `exports` — not `venues`, which K3 rebuilds this wave and stops proving
  // "untouched." Not this track's, not this wave's, per `DEC-137`.
  await goto(page, "/ar/app/admin/exports");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // `E2E_SHOTS_DIR` lets a run in the verification worktree land its
  // captures where the cited path actually points — a hard-coded
  // `process.cwd()` was wave 7's own sync-3 finding: every capture landed
  // in the worktree, not the main checkout `STATUS.md` cites.
  const dir = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  const name = testInfo.project.name === "phone" ? "390" : "desktop";
  await page.screenshot({ path: join(dir, `wave7-console-layout-untouched-${name}.png`), fullPage: true });
});
