// SCR-061 · /app/admin/exports — against REAL local Supabase (REQ-ADM-017).
// Proves the real page lists all seven exports, a member gets the not-found page (DEC-134),
// and two representative downloads (members, sessions) are correct CSV
// with a BOM, Arabic headers, and are each audited exactly once.
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
  domain = `admin-exports-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة التصدير', $1, 'EX', gen_random_uuid(), $2) returning id`,
    [`admin-exports-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف التصدير') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة التصدير', 40) returning id`, [orgId]);
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة قابلة للتصدير', 'ملخص الجلسة', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days' + interval '1 hour', $3, 30, 'published', now() - interval '1 day')`,
    [orgId, catRows[0].id, venueRows[0].id],
  );

  for (const [email, name] of [
    [adminEmail, "مشرفة التصدير"],
    [memberEmail, "عضو التصدير"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
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

// ★ DEC-134: `app/loading.tsx` puts every `/app` page inside a Suspense boundary,
// so the status is committed before the gate runs, and a gated page's
// `notFound()` streams 200 with `noindex` and the not-found page. What the gate
// protects is the content, so that is what is asserted: the not-found page is
// the only `h1`, and nothing the page guards rendered.
async function expectGatedNotFound(page: Page) {
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

test("a member cannot open the exports screen", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/admin/exports");
  await expectGatedNotFound(page);
});

test("REQ-ADM-017: the admin sees all seven exports, and two representative downloads are correct and audited", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/exports");
  await expect(page.getByRole("heading", { name: "التصدير", level: 1 })).toBeVisible();
  for (const title of ["الجلسات", "الحجوزات", "الحضور", "التقييمات", "النقاط", "الشهادات", "الأعضاء"]) {
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  }

  const membersCsv = await page.request.get("/api/admin/exports/members");
  expect(membersCsv.status()).toBe(200);
  const membersBody = await membersCsv.body();
  expect([membersBody[0], membersBody[1], membersBody[2]]).toEqual([0xef, 0xbb, 0xbf]);
  const membersText = membersBody.toString("utf8");
  expect(membersText).toContain("الاسم");
  expect(membersText).toContain("عضو التصدير");

  const sessionsCsv = await page.request.get("/api/admin/exports/sessions");
  expect(sessionsCsv.status()).toBe(200);
  const sessionsText = (await sessionsCsv.body()).toString("utf8");
  expect(sessionsText).toContain("العنوان");
  expect(sessionsText).toContain("جلسة قابلة للتصدير");

  const audit = await db.query<{ after: { export_type: string } }>(`select after from public.audit_log where org_id = $1 and action = 'export.created' order by occurred_at`, [orgId]);
  expect(audit.rows.map((r) => r.after.export_type)).toEqual(["members", "sessions"]);
});

test("an unknown export type 404s", async ({ context, page }) => {
  await signIn(context, adminEmail);
  const response = await page.request.get("/api/admin/exports/not-a-real-type");
  expect(response.status()).toBe(404);
});

test("SCR-061 at 390 px RTL: the exports list reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/exports");
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
  expect(overflow, "the exports list must not scroll sideways at 390 px").toEqual([]);
  await page.screenshot({ path: `.qa-shots/rtl/scr-061-exports-390-rtl-${test.info().project.name}.png`, fullPage: true });
});
