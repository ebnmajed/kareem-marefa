// SCR-024 «المحفوظات» against REAL local Supabase (REQ-DSC-006). This
// track owns the whole route (src/app/[locale]/app/me/bookmarks/page.tsx),
// unlike `<SearchFilters>`/`<BookmarkButton>`, which are components for
// another track's page to embed — neither is wired anywhere yet (the
// browse page, SCR-011, is `sessions`'), so a full end-to-end of "filter,
// then bookmark from the list" isn't reachable through any real page
// today. What this proves instead: the member's own saved sessions list,
// private to them, with no points/scoring entanglement (true by omission,
// nothing here to assert against).
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
let sessionId = "";
let memberEmail = "";
let otherEmail = "";
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
  domain = `bookmarks-e2e-${tag}.example`;
  memberEmail = `member@${domain}`;
  otherEmail = `other@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المحفوظات', $1, 'BM', gen_random_uuid()) returning id`,
    [`bookmarks-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة تستحق الحفظ', 'ملخص الجلسة', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days' + interval '1 hour',
             $3, 30, 'published', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [memberEmail, "عضو الاختبار"],
    [otherEmail, "عضو آخر"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const memberId = await provisionMemberId(memberEmail);
  await db.query(`insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3)`, [orgId, memberId, sessionId]);
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
  // Layout-viewport measurement (TEAM.md §5): first, does the page scroll at all
  // (`scrollWidth - clientWidth` is the scrollbar's width on every RTL page that
  // scrolls vertically); then which element is responsible, skipping permitted
  // scroll containers and fixed overlays. Names what to fix.
  // Phone project only: a desktop context at 390 px carries a classic scrollbar
  // that inflates scrollWidth on every page that scrolls vertically.
  const overflow = test.info().project.name !== "phone" ? [] : await p.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [];
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
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("★ REQ-DSC-006: SCR-024 lists the member's own bookmarked session, and links into it", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/me/bookmarks`);

  await expect(page.getByRole("heading", { name: "المحفوظات", level: 1 })).toBeVisible();
  await expect(page.getByText("جلسة تستحق الحفظ")).toBeVisible();
  await review(page, "bookmarks-page");

  await page.getByRole("link", { name: "جلسة تستحق الحفظ" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
});

test("★ REQ-DSC-006: private to the member — another member's own bookmarks page is empty", async ({ context, page }) => {
  await signIn(context, otherEmail);
  await page.goto(`/ar/app/me/bookmarks`);
  await expect(page.getByText("لم تحفظ أي جلسة بعد.")).toBeVisible();
  await expect(page.getByText("جلسة تستحق الحفظ")).not.toBeVisible();
});
