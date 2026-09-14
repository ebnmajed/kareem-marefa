// SCR-047 (categories) and SCR-048 (companies) — REQ-ADM-007, REQ-ADM-008,
// against REAL local Supabase. Both screens share one shape (add, list,
// deactivate/reactivate, no delete), so one file proves both rather than
// duplicating the same flow twice.
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
let memberEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `admin-lists-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة القوائم', $1, 'LS', gen_random_uuid(), $2) returning id`,
    [`admin-lists-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const email of [adminEmail, memberEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // Measured against the layout viewport, not `scrollWidth - clientWidth`: in an RTL
  // document the vertical scrollbar sits on the left, so that difference is the
  // scrollbar's width on every page that scrolls (TEAM.md §5; the reasoning is in
  // tests/e2e/notify-screens.spec.ts). Names what escapes, rather than a boolean.
  const overflow = await p.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > limit + 1 || box.left < -1) offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, `${name} must not scroll sideways at 390 px`).toEqual([]);
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("a member cannot open either managed list", async ({ context, page }) => {
  await signIn(context, memberEmail);
  expect((await page.goto("/ar/app/admin/categories"))!.status()).toBe(404);
  expect((await page.goto("/ar/app/admin/companies"))!.status()).toBe(404);
});

test("REQ-ADM-007: an admin adds a category, then deactivates and reactivates it — no delete button exists", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/categories");
  await expect(page.getByRole("heading", { name: "التصنيفات", level: 1 })).toBeVisible();

  await page.getByLabel("الاسم").fill("تصنيف اختباري");
  await page.getByRole("button", { name: "أضف التصنيف" }).click();
  const row = page.locator("li", { has: page.getByText("تصنيف اختباري", { exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /حذف/ })).toHaveCount(0);

  await row.getByRole("button", { name: "عطّل" }).click();
  await expect(row.getByText("معطّل")).toBeVisible();
  await row.getByRole("button", { name: "أعد التفعيل" }).click();
  await expect(row.getByText("معطّل")).toHaveCount(0);

  const { rows } = await db.query(`select deactivated_at from public.categories where org_id = $1 and name = 'تصنيف اختباري'`, [orgId]);
  expect(rows[0].deactivated_at).toBeNull();
});

test("REQ-ADM-008: an admin adds a company, then deactivates it — no delete button exists", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/companies");
  await expect(page.getByRole("heading", { name: "الشركات", level: 1 })).toBeVisible();

  await page.getByLabel("الاسم").fill("شركة اختبارية");
  await page.getByRole("button", { name: "أضف الشركة" }).click();
  const row = page.locator("li", { has: page.getByText("شركة اختبارية", { exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /حذف/ })).toHaveCount(0);

  await row.getByRole("button", { name: "عطّل" }).click();
  await expect(row.getByText("معطّلة")).toBeVisible();

  const { rows } = await db.query(`select deactivated_at from public.companies where org_id = $1 and name = 'شركة اختبارية'`, [orgId]);
  expect(rows[0].deactivated_at).not.toBeNull();
});

test("SCR-047/048 at 390 px RTL: both lists read down the page, never sideways", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/categories");
  await review(page, "scr-047-categories");
  await page.goto("/ar/app/admin/companies");
  await review(page, "scr-048-companies");
});
