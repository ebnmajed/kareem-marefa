// ★ The M7 demonstrable (14-roadmap.md §M7, DEC-048): a SECOND org stands up —
// its own admins, members, sessions — and neither org sees a single row of the
// other's from any console screen, from an export, or from browse. The RLS
// sweep (tests/rls/isolation.test.ts) proves the wall per table; this spec
// walks it through the real screens as each org's admin in turn, which is what
// "exercised, not only tested" means.
//
// Same seeding and sign-in as console's specs: real auth users, a real
// provision_member(), cookies from a server client (DEC-020). Names carry a
// per-worker tag, and the cascade on `orgs` takes everything with it.
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
test.describe.configure({ mode: "serial" });

type Org = { id: string; name: string; adminEmail: string; memberEmail: string; memberName: string; sessionTitle: string; categoryName: string };
let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let a: Org;
let b: Org;
const userIds: string[] = [];

async function provision(email: string) {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
}

async function seedOrg(tag: string, letter: "a" | "b", prefix: string): Promise<Org> {
  const domain = `second-org-${letter}-${tag}.example`;
  const adminEmail = `boss@${domain}`;
  const memberEmail = `member@${domain}`;
  const name = letter === "a" ? `المؤسسة الأولى ${tag}` : `المؤسسة الثانية ${tag}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ($1, $2, $3, gen_random_uuid(), $4) returning id`,
    [name, `second-org-${letter}-${tag}`, prefix, adminEmail],
  );
  const id = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [id, domain]);
  const memberName = letter === "a" ? `عضو الأولى ${tag}` : `عضو الثانية ${tag}`;
  for (const [email, full] of [[adminEmail, `مشرف ${name}`], [memberEmail, memberName]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: full } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provision(memberEmail);
  const categoryName = letter === "a" ? `تصنيف الأولى ${tag}` : `تصنيف الثانية ${tag}`;
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, $2) returning id`, [id, categoryName]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, $2, 40) returning id`, [id, `قاعة ${name}`]);
  const sessionTitle = letter === "a" ? `جلسة الأولى ${tag}` : `جلسة الثانية ${tag}`;
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour',
             $4, 30, now() + interval '3 days', now() + interval '3 days', 'published', now())`,
    [id, sessionTitle, cat[0].id, venue[0].id],
  );
  return { id, name, adminEmail, memberEmail, memberName, sessionTitle, categoryName };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  a = await seedOrg(tag, "a", "SOA");
  b = await seedOrg(tag, "b", "SOB");
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const org of [a, b]) if (org?.id) await db.query(`delete from public.orgs where id = $1`, [org.id]);
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

/** Every string that belongs to the OTHER org and must never appear. */
function foreign(other: Org): string[] {
  return [other.name, other.memberName, other.sessionTitle, other.categoryName, other.memberEmail, other.adminEmail];
}

async function walk(page: Page, mine: Org, other: Org) {
  const never = foreign(other);
  for (const path of ["/ar/app/admin", "/ar/app/admin/members", "/ar/app/admin/sessions", "/ar/app/admin/categories", "/ar/app/admin/audit", "/ar/app/sessions"]) {
    const response = await page.goto(path);
    expect(response!.status(), `${path} answers for ${mine.name}'s admin`).toBe(200);
    // `textContent`, not `innerText`: ui/data-table renders a table AND a card
    // list and hides one per viewport, and `innerText` skips hidden text — so on
    // a phone the hidden table's rows were never checked for org B.
    const text = (await page.locator("body").textContent()) ?? "";
    for (const s of never) expect(text, `${path} shows nothing of ${other.name} (${s})`).not.toContain(s);
  }
  // Own rows ARE there — the walk is not vacuous. The copy this viewport shows.
  await page.goto("/ar/app/admin/members");
  await expect(page.getByText(mine.memberName).filter({ visible: true }).first()).toBeVisible();
  await page.goto("/ar/app/sessions");
  await expect(page.getByText(mine.sessionTitle).filter({ visible: true }).first()).toBeVisible();
  // The bulk read too: an export is the widest window an admin has (REQ-ADM-017).
  const csv = await page.request.get("/api/admin/exports/members");
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain(mine.memberEmail);
  for (const s of never) expect(body, `the members export carries nothing of ${other.name}`).not.toContain(s);
}

test("★ REQ-TEN-002 / DEC-004: org A's admin sees nothing of org B on any console screen, on browse, or in an export", async ({ context, page }) => {
  await signIn(context, a.adminEmail);
  await walk(page, a, b);
});

test("★ and org B's admin sees nothing of org A — the wall has two sides", async ({ context, page }) => {
  await signIn(context, b.adminEmail);
  await walk(page, b, a);
});

test("a member of org A cannot open org B's session by id, and the URL is not a hint", async ({ context, page }) => {
  await signIn(context, a.memberEmail);
  const { rows } = await db.query<{ id: string }>(`select id from public.sessions where org_id = $1`, [b.id]);
  await page.goto(`/ar/app/sessions/${rows[0].id}`);
  // The event page streams through its slots, so `notFound()` fires after the
  // headers went out and the status is 200; the not-found boundary is what
  // renders, and nothing of org B's session with it. Assert on the page.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لم نعثر على ما تبحث عنه"); // app/not-found.tsx (DEC-134)
  const text = await page.locator("body").innerText();
  expect(text).not.toContain(b.sessionTitle);
  expect(text).not.toContain(b.name);
});
