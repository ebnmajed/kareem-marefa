// SCR-063 · /app/admin/settings — against REAL local Supabase
// (REQ-TEN-008, REQ-INT-006, REQ-MAT-009). Proves a member/moderator gets
// a real 404, an admin can change a setting and it persists, and the
// change lands in `org_settings_history` with the old and new value.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

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
  domain = `admin-settings-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الإعدادات', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`admin-settings-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الإعدادات"],
    [modEmail, "منظّم الإعدادات"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
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
 * hundred ms beside the copy already in `<main>`, and a strict locator
 * counts it. Same helper as `console.spec.ts`'s/`admin-moderation.spec.ts`'s.
 */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

// ★ DEC-134: `app/loading.tsx` wraps every `/app` page in a Suspense
// boundary, so the response has begun streaming — status committed — before
// the DAL's own gate runs. A gated page's `notFound()` therefore answers 200
// with `noindex` and the not-found page, never a real 404 status — this
// test used to assert `.status() === 404`, which DEC-134 makes false. Same
// rewrite `admin-moderation.spec.ts`/`admin-managed-lists.spec.ts` already
// carry for their own routes, applied here now that settings is rebuilt.
//
// ★ A latent flake sessions' own diagnosis found (172bf22): `goto()`'s own
// zero-`div[hidden][id^="S:"]` wait can time out HERE specifically — a gated
// route can flush one Suspense boundary before its page's own `notFound()`
// throws, so an empty hidden div stays in the body for good, not just
// transiently. `page.goto()` bare, then the visible not-found heading is the
// wait — it already auto-retries.
test("a moderator gets the streamed not-found page on the settings screen (DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/settings");
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

test("REQ-TEN-008: an admin changes the time zone, it persists, and the history records the old and new value", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/settings");
  await expect(page.getByRole("heading", { name: "إعدادات المؤسسة", level: 1 })).toBeVisible();

  // REQ-INT-006, DEC-124: numerals are Western everywhere and there is no
  // setting — the control that used to be tested here must not exist.
  await expect(page.getByLabel("نظام الترقيم")).toHaveCount(0);
  await page.getByLabel("المنطقة الزمنية").fill("Asia/Dubai");
  await page.getByRole("button", { name: "احفظ الإعدادات" }).click();
  // ★ Wave 7: the save now travels through a `redirect(...?saved=1)`
  // (`admin/scoring`/`admin/emails`'s own established convention) rather
  // than returning `{saved: true}` in place — `SavedToast` fires a real
  // `ui/toast` (`role="status"`) on mount, then strips the query param.
  await expect(page.getByRole("status")).toContainText("حُفظت الإعدادات.");
  await expect(page).toHaveURL(/\/ar\/app\/admin\/settings$/);

  const { rows } = await db.query<{ time_zone: string }>(`select time_zone from public.org_settings where org_id = $1`, [orgId]);
  expect(rows[0].time_zone).toBe("Asia/Dubai");

  const history = await db.query<{ old_value: string; new_value: string }>(
    `select old_value, new_value from public.scoring_config_history where org_id = $1 and scope = 'org_settings' and field = 'time_zone'`,
    [orgId],
  );
  expect(history.rows).toEqual([{ old_value: "Asia/Riyadh", new_value: "Asia/Dubai" }]);

  // Reload: the field shows the persisted value, not the old default.
  await page.reload();
  await expect(page.getByLabel("المنطقة الزمنية")).toHaveValue("Asia/Dubai");
});

test("SCR-063 at 390 px RTL: the settings form reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/settings");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await page.evaluate(() => {    // First question: does the page itself scroll sideways? (One number; on the
    // phone project innerWidth already includes no classic scrollbar.)
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [];
    // Second: which element is responsible. An element inside an
    // `overflow-x: auto|scroll` ancestor is a permitted scroller (CLAUDE.md:
    // tables), and a `position: fixed` overlay spans the visual viewport by
    // design; neither makes the page scroll, so neither is named.
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right <= limit + 1 && box.left >= -1) continue;
      let contained = false;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.position === "fixed" || ((n !== el) && (cs.overflowX === "auto" || cs.overflowX === "scroll"))) { contained = true; break; }
      }
      if (contained) continue;
      offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, "the settings form must not scroll sideways at 390 px").toEqual([]);
  // `E2E_SHOTS_DIR` lets a run in the verification worktree land its
  // captures where the cited path actually points — a hard-coded
  // `.qa-shots/rtl/` was wave 7's own sync-3 finding.
  const dir = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
  await page.screenshot({ path: `${dir}/wave7-console-settings-populated-${test.info().project.name}.png`, fullPage: true });
});
