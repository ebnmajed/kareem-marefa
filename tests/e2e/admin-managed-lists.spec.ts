// SCR-046 (venues), SCR-047 (categories) and SCR-048 (companies) — REQ-ADM-006, REQ-ADM-007, REQ-ADM-008,
// REQ-ADM-022 — against REAL local Supabase. The three share one shape (add, edit, deactivate/reactivate, no
// delete), so one file proves all three. ★ The venue case needs `0180` (`venues.company_id`) applied locally.
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
  // ★ Same reasoning as the two rows above, for the K3 wave-7 capture the
  // lead flagged: /app/admin/venues had no seeded row of its own in this
  // org, so a phone-only capture of it would show the empty state, not the
  // populated list.
  await db.query(`insert into public.venues (org_id, name) values ($1, 'قاعة قائمة')`, [orgId]);
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
//
// ★ A latent flake sessions' own diagnosis found (172bf22): `goto()`'s own
// zero-`div[hidden][id^="S:"]` wait can time out HERE specifically, because
// a gated route can flush one Suspense boundary before its page's own
// `notFound()` throws — Fizz sends `$RX` for that boundary and never `$RC`,
// so an empty `<div hidden id="S:0">` stays in the body for good, not just
// transiently. `page.goto()` bare, then the visible not-found heading itself
// is the wait — it already auto-retries, and it is a real, meaningful signal
// here in a way the hidden-div count no longer is.
test("a member gets the streamed not-found page on the three managed lists (DEC-134)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["venues", "categories", "companies"]) {
    await page.goto(`/ar/app/admin/${path}`);
    await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 }), path).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
  }
});

// ★ Wave 22 (`DEC-208`): the three lists were deleted and written again from `AdminVenues`, `AdminCategories` and
// `AdminCompanies.dc.html`. «جديد» and «عدّل» are LINKS to `?new=1` / `?edit=<id>`, the form a sheet with JS
// (`DEC-232` §5.5); the row's decisions live in its ⋯; state lives in the row — «معطّل» beside a deactivated one,
// nothing beside an active one. Each case below is a ledger line in `STATUS.md` (selectors and flows moved; what the
// database ends up holding did not).

/** The row's ⋯, by its accessible name — the same on the table and the phone card. */
const more = (page: Page, name: string) => page.locator("#main").getByRole("button", { name: `مزيد من الإجراءات على ${name}` }).filter({ visible: true });

test("REQ-ADM-007: an admin adds a category, renames it, deactivates and reactivates it — no delete exists", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop walk; the phone's is F1 below");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/categories");
  await expect(page.getByRole("heading", { name: "التصنيفات", level: 1 })).toBeVisible();

  await page.locator("#main").getByRole("link", { name: "تصنيف جديد" }).click();
  const sheet = page.getByRole("dialog", { name: "تصنيف جديد" });
  await sheet.getByLabel("الاسم").fill("تصنيف اختباري");
  await sheet.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ التصنيف." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main").getByRole("table").getByText("تصنيف اختباري", { exact: true })).toBeVisible();

  await more(page, "تصنيف اختباري").click();
  await expect(page.getByRole("menuitem", { name: /حذف|احذف/ })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  const edit = page.getByRole("dialog", { name: "عدّل التصنيف" });
  await edit.getByLabel("الاسم").fill("تصنيف معدّل");
  await edit.getByRole("button", { name: "احفظ" }).click();
  await expect(page.locator("#main").getByRole("table").getByText("تصنيف معدّل", { exact: true })).toBeVisible();

  await more(page, "تصنيف معدّل").click();
  await page.getByRole("menuitem", { name: "عطّل" }).click();
  await page.getByRole("dialog", { name: "تعطيل «تصنيف معدّل»؟" }).getByRole("button", { name: "تأكيد التعطيل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم التعطيل." })).toBeVisible();
  const row = page.getByRole("row", { name: /تصنيف معدّل/ });
  await expect(row.getByText("معطّل", { exact: true })).toBeVisible();

  await more(page, "تصنيف معدّل").click();
  await page.getByRole("menuitem", { name: "أعد التفعيل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تمت إعادة التفعيل." })).toBeVisible();
  await expect(row.getByText("معطّل", { exact: true })).toHaveCount(0);

  const { rows } = await db.query(`select deactivated_at from public.categories where org_id = $1 and name = 'تصنيف معدّل'`, [orgId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].deactivated_at).toBeNull();
});

test("REQ-ADM-008: an admin adds a company with a colour, recolours it, and deactivates it — no delete exists", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop walk; the phone's is F1 below");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/companies");
  await expect(page.getByRole("heading", { name: "الشركات", level: 1 })).toBeVisible();

  await page.locator("#main").getByRole("link", { name: "شركة جديدة" }).click();
  const sheet = page.getByRole("dialog", { name: "شركة جديدة" });
  await sheet.getByLabel("الاسم").fill("شركة اختبارية");
  await sheet.getByRole("radio", { name: "ذهبي" }).check();
  await sheet.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظت الشركة." })).toBeVisible();
  const row = page.getByRole("row", { name: /شركة اختبارية/ });
  await expect(row.getByText("ذهبي", { exact: true })).toBeVisible();

  await more(page, "شركة اختبارية").click();
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  await page.getByRole("dialog", { name: "عدّل الشركة" }).getByRole("radio", { name: "سماوي" }).check();
  await page.getByRole("dialog", { name: "عدّل الشركة" }).getByRole("button", { name: "احفظ" }).click();
  await expect(row.getByText("سماوي", { exact: true })).toBeVisible();

  await more(page, "شركة اختبارية").click();
  await expect(page.getByRole("menuitem", { name: /حذف|احذف/ })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "عطّل" }).click();
  await page.getByRole("dialog", { name: "تعطيل «شركة اختبارية»؟" }).getByRole("button", { name: "تأكيد التعطيل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم التعطيل." })).toBeVisible();
  await expect(row.getByText("معطّلة", { exact: true })).toBeVisible();

  const { rows } = await db.query(`select id, deactivated_at, team_color from public.companies where org_id = $1 and name = 'شركة اختبارية'`, [orgId]);
  expect(rows[0].deactivated_at).not.toBeNull();
  expect(rows[0].team_color).toBe("#35d0ff");
  const audit = await db.query(`select before, after from public.audit_log where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`, [orgId, rows[0].id]);
  expect(audit.rows).toEqual([{ before: { teamColor: "#ffd23f" }, after: { teamColor: "#35d0ff" } }]);
});

test("★ SCR-046, the job: the owner sets a venue's company in one move, and «لا شركة» is a real choice (REQ-ADM-022)", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop walk; the phone's is F1 below");
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/venues");
  const row = page.getByRole("row", { name: /قاعة قائمة/ });
  await expect(row.getByText("لا شركة", { exact: true })).toBeVisible();

  await more(page, "قاعة قائمة").click();
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  const sheet = page.getByRole("dialog", { name: "عدّل المكان" });
  await sheet.getByLabel("الشركة").selectOption({ label: "شركة قائمة" });
  await sheet.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ المكان." })).toBeVisible();
  await expect(row.getByText("شركة قائمة", { exact: true })).toBeVisible();

  const { rows: set } = await db.query(
    `select c.name from public.venues v join public.companies c on c.id = v.company_id where v.org_id = $1 and v.name = 'قاعة قائمة'`,
    [orgId],
  );
  expect(set).toEqual([{ name: "شركة قائمة" }]);

  await more(page, "قاعة قائمة").click();
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  await page.getByRole("dialog", { name: "عدّل المكان" }).getByLabel("الشركة").selectOption({ label: "لا شركة" });
  await page.getByRole("dialog", { name: "عدّل المكان" }).getByRole("button", { name: "احفظ" }).click();
  await expect(row.getByText("لا شركة", { exact: true })).toBeVisible();
  const { rows: cleared } = await db.query(`select company_id from public.venues where org_id = $1 and name = 'قاعة قائمة'`, [orgId]);
  expect(cleared[0].company_id).toBeNull();
});

// ★ DEC-232 §5.5: «… جديد» and «عدّل» are links to `?new=1` / `?edit=<id>`, and the SERVER renders the form for them.
// A browser with JavaScript off cannot show it here: `app/loading.tsx` streams every `/app` page behind a Suspense
// boundary whose reveal is an inline script, so no-JS sees the skeleton on every console page (the verify run proved it).
// What this proves instead is the half that is ours — the response itself carries the form, its fields and its action.
test("?new=1 renders the creation form on the server — the URL is the state (DEC-232 §5.5)", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one walk is enough");
  await signIn(context, adminEmail);
  const html = await (await page.request.get("/ar/app/admin/categories?new=1")).text();
  expect(html).toContain('id="category-editor"');
  expect(html).toContain('name="name"');
  expect(html).toMatch(/<form[^>]*action=/);
  const edit = await (await page.request.get("/ar/app/admin/categories?new=0")).text();
  expect(edit).not.toContain('id="category-editor"');
});

test("SCR-046/047/048 at 390 px RTL: the three lists read down the page as a stacked card list, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  for (const path of ["venues", "categories", "companies"]) {
    await goto(page, `/ar/app/admin/${path}`);
    await review(page, `wave22-console-${path}-populated`);
  }
});

// ★ Wave 8, F1: on a phone the three managed lists had no «عطّل» at all. Since wave 22 the decisions are under each
// card's ⋯. Runs after the captures, and leaves each row active again.
test("F1 at 390 px: each managed list deactivates and reactivates from its phone card", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone card list is the phone treatment");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  for (const [path, name, deactivated, table] of [
    ["venues", "قاعة قائمة", "معطّل", "venues"],
    ["categories", "تصنيف قائم", "معطّل", "categories"],
    ["companies", "شركة قائمة", "معطّلة", "companies"],
  ] as const) {
    await goto(page, `/ar/app/admin/${path}`);
    const card = page.getByRole("listitem").filter({ hasText: name });
    await more(page, name).click();
    await page.getByRole("menuitem", { name: "عطّل" }).click();
    await page.getByRole("dialog", { name: `تعطيل «${name}»؟` }).getByRole("button", { name: "تأكيد التعطيل" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم التعطيل." }), path).toBeVisible();
    await expect(card.getByText(deactivated, { exact: true }), path).toBeVisible();

    await more(page, name).click();
    await page.getByRole("menuitem", { name: "أعد التفعيل" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تمت إعادة التفعيل." }), path).toBeVisible();
    await expect(card.getByText(deactivated, { exact: true }), path).toHaveCount(0);
    const { rows } = await db.query(`select deactivated_at from public.${table} where org_id = $1 and name = $2`, [orgId, name]);
    expect(rows[0].deactivated_at, path).toBeNull();
  }
});
