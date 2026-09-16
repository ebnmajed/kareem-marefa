// `/app/me` — SCR-021, REQ-PRF-001, `16` §6.5. Task T1 of content's wave-7
// plan (`docs/plan/notes/content.md`): the hub's tab strip and the profile
// form on the M9 system, `useActionState` replacing the old
// `?saved=1`/`?error=1` redirect.
//
// Same shape as `tests/e2e/privacy.spec.ts` and `tests/e2e/tasks.spec.ts`:
// real local Supabase, one provisioned member, a review pass at 390 px that
// captures the states `docs/plan/notes/content.md`'s Definition of Done
// names — empty, populated, a field error, and the saved confirmation.
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
// `E2E_SHOTS_DIR` lets a look-only run against a dev server keep its
// pictures out of the directory the review reads (`event-page.spec.ts`'s
// own convention).
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let memberEmail = "";
let companyId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `me-e2e-${tag}.example`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'MEH', gen_random_uuid()) returning id`,
    [`مؤسسة الملف ${tag}`, `me-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: companyRows } = await db.query<{ id: string }>(
    `insert into public.companies (org_id, name) values ($1, 'شركة الاختبار') returning id`,
    [orgId],
  );
  companyId = companyRows[0].id;

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الملف" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
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

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave7-content-me-${name}.png`), fullPage: true });
}

test("the hub's tab strip, the profile's empty state, a field error, and the saved confirmation", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app/me");

  // Empty: a fresh member's Google name, no company/job title/bio yet — the
  // acceptance criterion REQ-PRF-001 states directly (a member with no
  // company set is prompted before they can reserve or propose).
  await expect(page.getByRole("heading", { name: "ملفي", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "صفحاتي" })).toBeVisible();
  await expect(page.getByLabel("الاسم", { exact: false })).toHaveValue("عضو الملف");
  await expect(page.getByLabel("المسمى الوظيفي")).toHaveValue("");
  await capture(page, "empty");

  // A field error: clear the required name and submit.
  // ★ Sync-4b: `page.locator("form")` alone is not enough to dodge TEAM.md
  // §5's route-announcer trap — the shell renders its OWN forms on every
  // `/app` page (`search-entry.tsx`, `account-menu.tsx`'s sign-out), so an
  // unscoped `form.getByRole("alert")` searches three forms' worth of
  // subtree, not one. `FormSummary` DOES render inside `<form>` here
  // (`components/me/profile-form.tsx:76-81` — checked directly, not
  // assumed), so the fix is narrower scoping, not a real rendering bug:
  // `shell-frame.tsx`'s own `<main id="main">` wraps the routed page's
  // content only, excluding the header entirely.
  const main = page.locator("#main");
  await page.getByLabel("الاسم", { exact: false }).fill("");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(main.getByRole("alert")).toContainText("يرجى تصحيح الأخطاء التالية");
  await capture(page, "error");

  // Populated + saved: fill every field and submit.
  await page.getByLabel("الاسم", { exact: false }).fill("عضو الملف المُحدَّث");
  await page.getByLabel("الشركة").selectOption({ label: "شركة الاختبار" });
  await page.getByLabel("المسمى الوظيفي").fill("مهندس حلول");
  await page.getByLabel("نبذة").fill("أعمل على المنصة التعليمية.");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("status")).toContainText("تم الحفظ");
  await expect(page.getByLabel("الاسم", { exact: false })).toHaveValue("عضو الملف المُحدَّث");
  // ★ The lead's real-capture finding (wave7-content-me-populated-saved.png):
  // this went unchecked before — only displayName's value was asserted —
  // and the company select showed the placeholder after a save that DID
  // persist it. Root cause was a read-back bug in profile-form.tsx: an
  // uncontrolled `<select defaultValue>` never re-syncs on a re-render, so
  // the just-saved company never reached the DOM even once `value()` itself
  // computed correctly (fixed by keying the field on its own value).
  await expect(page.getByLabel("الشركة")).toHaveValue(companyId);
  await capture(page, "populated-saved");

  // The tab strip is real navigation — every route stays reachable, and a
  // tab near the end (privacy) must not widen the page either.
  await page.getByRole("link", { name: "الخصوصية والبيانات" }).click();
  await expect(page).toHaveURL(/\/app\/me\/privacy$/);
  await capture(page, "tabstrip-privacy");
});

// ★ Skipped, the lead's finding, certain rather than timing-dependent:
// under `/app`, `loading.tsx` makes the response stream (the skeleton
// flushes, the real page arrives in a `<div hidden>` React's own inline
// `$RC` script reveals) — with JS off that script never runs, so no route
// under `/app` can render for a no-JS client, a property of M9's loading
// model (DEC-087/DEC-134), not of this form. The only no-JS contract in the
// plan is the frozen register form (`16` §8.2, `qa:contract`); nothing asks
// for one here. Left in place, skipped, rather than deleted, so the
// reasoning stays attached to the code it would otherwise look like nobody
// tested.
test.describe.skip("no-JS save — loading.tsx streams under JS; see the comment above, not a bug in this form", () => {
  test.use({ javaScriptEnabled: false, viewport: PHONE });

  test("a save submitted with no JavaScript still shows the confirmation, with the value persisted", async ({ context, page }) => {
    await signIn(context, memberEmail);
    await page.goto("/ar/app/me");
    await page.getByLabel("الاسم", { exact: false }).fill("عضو بلا جافاسكربت");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم الحفظ")).toBeVisible();
    await expect(page.getByLabel("الاسم", { exact: false })).toHaveValue("عضو بلا جافاسكربت");
  });
});
