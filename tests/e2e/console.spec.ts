// The admin console's frame and rail — `16` §6.7, wave 6 (`DEC-130`), regrouped
// for wave 7 (`DEC-137`), ★ and rebuilt in wave 21 (`REQ-UIX-084`, `DEC-226`, `DEC-227`):
// a 52 px bar and twenty destinations on one level in six ruled groups — no
// collapse, no disclosure, no flyout. Proves what `admin-nav.test.ts` and
// `admin-rail-scope.test.tsx` (unit, jsdom) cannot: the
// real 390 px phone drawer over a real screen, the second skip link's actual
// focus target, a moderator's rail on real RLS-backed roles (`REQ-ADM-020`),
// and that the layout renders correctly around a screen this track did NOT
// rebuild this wave — the "one untouched admin screen after the layout
// change" capture `docs/plan/notes/console.md`'s "Wave 7 plan" §1 commits
// to. Retargeted twice: from `venues` (rebuilt in wave 7) to `exports`, and in
// wave 8 from `exports` (rebuilt, K2) to `proposals`, which no track touches
// this wave.
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

// ★ wave 21 (DEC-226 §2): the proof is a COUNT. The fourteen-group IA's collapse, disclosure and flyout cases went
// with the rail that had them (ledger lines in STATUS.md); what they protected — every destination reachable, a
// moderator's scope — is asserted here on the new shape.
const RAIL = "لوحة إدارة المؤسسة";
const shotsDir = () => {
  const dir = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
  mkdirSync(dir, { recursive: true });
  return dir;
};

test("desktop: the rail holds all twenty destinations in six ruled groups, the dashboard current", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the persistent rail is a desktop control");
  await signIn(context);
  await goto(page, "/ar/app/admin");
  const nav = page.getByRole("navigation", { name: RAIL });
  await expect(nav.getByRole("link")).toHaveCount(20);
  await expect(nav.getByRole("list")).toHaveCount(6);
  await expect(nav.getByRole("button")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "التصنيفات", exact: true })).toHaveAttribute("href", "/ar/app/admin/categories");
  // The console's own bar — no member header, no tab bar (REQ-UIX-084).
  await expect(page.locator("[data-console-bar]")).toBeVisible();
  await expect(page.locator("[data-tab-bar]")).toHaveCount(0);
  await page.screenshot({ path: join(shotsDir(), "wave21-lead-frame-admin-1280.png") });
});

test("phone: the rail is a sheet that keeps the six groups, and it closes on navigation — DEC-111's own bug, not repeated here", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the sheet is the phone treatment");
  await signIn(context);
  await goto(page, "/ar/app/admin");
  await expect(page.getByRole("navigation", { name: RAIL })).toBeHidden();
  await expect(page.locator("[data-tab-bar]")).toHaveCount(0);
  await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const dialog = page.getByRole("dialog", { name: RAIL });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(20);
  await expect(dialog.getByRole("list")).toHaveCount(6);
  await page.screenshot({ path: join(shotsDir(), "wave21-lead-frame-sheet-admin-390.png") });
  await dialog.getByRole("link", { name: "الجلسات" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/admin\/sessions$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ★ Wave 22 (DEC-230 §3, DEC-231 §5): «التعليقات» left the rail — comment reports moved into «البلاغات» and
// `/moderation/comments` redirects there — so a moderator reaches five, not six.
test("a moderator's rail holds exactly REQ-ADM-020's five destinations", async ({ context, page }, testInfo) => {
  await signIn(context, "moderator");
  await goto(page, "/ar/app/admin/sessions");
  let scope = page.getByRole("navigation", { name: RAIL });
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
    scope = page.getByRole("dialog", { name: RAIL });
  }
  await expect(scope.getByRole("link")).toHaveCount(5); // ★ Wave 22 (DEC-230): five — «التعليقات» retired.
  for (const name of ["الجلسات", "الاستبانات", "الصور", "البلاغات", "سجل التدقيق"]) {
    await expect(scope.getByRole("link", { name, exact: true })).toBeVisible();
  }
  // ★ Wave 22 (DEC-230): «التعليقات» is gone for every role; «الإعلانات» (REQ-ADM-025, DEC-267) is admin only.
  for (const name of ["لوحة التحكم", "المقترحات", "الأعضاء", "القوالب", "الإعدادات", "التعليقات", "الإعلانات"]) {
    await expect(scope.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  const width = testInfo.project.name === "phone" ? "390" : "1280";
  await page.screenshot({ path: join(shotsDir(), `wave21-lead-frame-moderator-${width}.png`) });
});

test("an admin screen no track rebuilds this wave renders under the new frame, captured at both widths", async ({ context, page }, testInfo) => {
  await signIn(context);
  // ★ wave 21: `venues` — not `proposals`, which `sessions` rebuilds in PR B.
  await goto(page, "/ar/app/admin/venues");
  await expect(page.locator("#main").getByRole("heading", { level: 1 })).toBeVisible();
  const width = testInfo.project.name === "phone" ? "390" : "1280";
  await page.screenshot({ path: join(shotsDir(), `wave21-lead-frame-untouched-${width}.png`), fullPage: true });
});
