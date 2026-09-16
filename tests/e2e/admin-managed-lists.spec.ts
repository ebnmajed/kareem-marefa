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

  // ★ Seeded here, by DB insert, not only through the UI — a real sync-3
  // finding. REQ-ADM-007/008's own add-then-deactivate tests are
  // `desktop`-only (row-scoped interaction, no `<table>`/`role="row"` on the
  // phone card stack), so on the PHONE PROJECT's own run neither test ever
  // executes, and the phone-only 390 px capture below was navigating to an
  // org with zero categories and zero companies — hence "populated" showing
  // the empty state, not a product bug. A row seeded directly, present for
  // both projects regardless of which desktop-only tests ran.
  await db.query(`insert into public.categories (org_id, name) values ($1, 'تصنيف قائم')`, [orgId]);
  await db.query(`insert into public.companies (org_id, name) values ($1, 'شركة قائمة')`, [orgId]);
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // Measured against the layout viewport, not `scrollWidth - clientWidth`: in an RTL
  // document the vertical scrollbar sits on the left, so that difference is the
  // scrollbar's width on every page that scrolls (TEAM.md §5; the reasoning is in
  // tests/e2e/notify-screens.spec.ts). Names what escapes, rather than a boolean.
  const overflow = await p.evaluate(() => {    // First question: does the page itself scroll sideways? (One number; on the
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
  expect(overflow, `${name} must not scroll sideways at 390 px`).toEqual([]);
  // `E2E_SHOTS_DIR` lets a run in the verification worktree land its
  // captures where the cited path actually points — a hard-coded
  // `.qa-shots/rtl/` was wave 7's own sync-3 finding.
  const dir = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
  await p.screenshot({ path: `${dir}/${name}-390-rtl-${project}.png`, fullPage: true });
}

// ★ DEC-134: `app/loading.tsx` wraps every `/app` page in a Suspense
// boundary, so the response has begun streaming — status committed — before
// the DAL's own gate runs. A gated page's `notFound()` therefore answers 200
// with `noindex` and the not-found page, never a real 404 status — this
// test used to assert `.status() === 404`, which DEC-134 makes false; wave
// 6's own bug-fix pass rewrote the equivalent assertion on every OTHER
// admin route it touched, but not this file, since venues/categories/
// companies weren't rebuilt yet. Same rewrite, applied here now.
test("a member gets the streamed not-found page on both managed lists (DEC-134)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["categories", "companies"]) {
    await goto(page, `/ar/app/admin/${path}`);
    await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 }), path).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
  }
});

test("REQ-ADM-007: an admin adds a category, then deactivates and reactivates it — no delete button exists", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "row-scoped interaction — the phone card stack has no <table>/role=\"row\" to scope by");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/categories");
  await expect(page.getByRole("heading", { name: "التصنيفات", level: 1 })).toBeVisible();

  await page.getByLabel("الاسم").fill("تصنيف اختباري");
  await page.getByRole("button", { name: "أضف التصنيف" }).click();
  // `DataTable` renders BOTH the desktop `<table>` and the phone `<ul>` card
  // list in the DOM at once (CSS hides one per viewport) — scoped to
  // whichever role is present, the pattern `admin-members.spec.ts` already
  // established for the same dual render.
  await expect(page.getByRole("table").or(page.getByRole("list")).getByText("تصنيف اختباري", { exact: true })).toBeVisible();

  const row = page.getByRole("row", { name: /تصنيف اختباري/ });
  await expect(row.getByRole("button", { name: /حذف/ })).toHaveCount(0);

  await row.getByRole("button", { name: "عطّل" }).click();
  const dialog = page.getByRole("dialog", { name: "تعطيل «تصنيف اختباري»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تأكيد التعطيل" }).click();
  // ★ Filtered by text, not a bare `getByRole("status")` — a real sync-3
  // finding: the deactivate toast can still be up (`ui/toast`'s own
  // auto-dismiss window) when the reactivate one arrives a moment later,
  // two `role="status"` elements at once. Stacking toasts is fine; the
  // assertion just needs to name which one.
  await expect(page.getByRole("status").filter({ hasText: "تم التعطيل." })).toBeVisible();
  await expect(row.getByText("معطّل")).toBeVisible();

  await row.getByRole("button", { name: "أعد التفعيل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تمت إعادة التفعيل." })).toBeVisible();
  await expect(row.getByText("معطّل")).toHaveCount(0);

  const { rows } = await db.query(`select deactivated_at from public.categories where org_id = $1 and name = 'تصنيف اختباري'`, [orgId]);
  expect(rows[0].deactivated_at).toBeNull();
});

test("REQ-ADM-008: an admin adds a company, then deactivates it — no delete button exists", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "row-scoped interaction — the phone card stack has no <table>/role=\"row\" to scope by");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/companies");
  await expect(page.getByRole("heading", { name: "الشركات", level: 1 })).toBeVisible();

  await page.getByLabel("الاسم").fill("شركة اختبارية");
  await page.getByRole("button", { name: "أضف الشركة" }).click();
  await expect(page.getByRole("table").or(page.getByRole("list")).getByText("شركة اختبارية", { exact: true })).toBeVisible();

  const row = page.getByRole("row", { name: /شركة اختبارية/ });
  await expect(row.getByRole("button", { name: /حذف/ })).toHaveCount(0);

  await row.getByRole("button", { name: "عطّل" }).click();
  const dialog = page.getByRole("dialog", { name: "تعطيل «شركة اختبارية»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تأكيد التعطيل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم التعطيل." })).toBeVisible();
  await expect(row.getByText("معطّلة")).toBeVisible();

  const { rows } = await db.query(`select deactivated_at from public.companies where org_id = $1 and name = 'شركة اختبارية'`, [orgId]);
  expect(rows[0].deactivated_at).not.toBeNull();
});

test("SCR-047/048 at 390 px RTL: both lists read down the page as a stacked card list, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/categories");
  await review(page, "wave7-console-categories-populated");
  await goto(page, "/ar/app/admin/companies");
  await review(page, "wave7-console-companies-populated");
});
