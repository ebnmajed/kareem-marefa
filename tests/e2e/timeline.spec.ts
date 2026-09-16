// SCR-010 · /app — where a member lands, and it is the sessions timeline
// (DEC-112, DEC-130, REQ-UIX-021, REQ-UIX-022, REQ-UIX-012).
//
// What this proves against the real page:
//   · `/app` renders the timeline itself — no redirect — and a member's next
//     confirmed session is the FIRST item, not repeated in its group;
//   · a filter applied on `/app` lands on `/app/sessions?…`;
//   · the empty case is the same screen, with an invitation to propose;
//   · the filtered-empty state names the filter and «أزل» restores results.
//
// Captures at 390 px, phone project, last in their test: items, empty,
// filtered-empty.
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
const SHOTS = join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
const orgs: string[] = [];
const userIds: string[] = [];
let memberEmail = "";
let emptyEmail = "";
let orgId = "";
let committedId = "";
let catId = "";

const SOON = "جلسة هذا الأسبوع";
const COMMITTED = "الجلسة التي حجزتها";

async function makeOrg(tag: string, name: string) {
  const { rows } = await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'TL', gen_random_uuid()) returning id`, [name, `timeline-${tag}`]);
  const id = rows[0].id;
  orgs.push(id);
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [id]);
  const domain = `timeline-${tag}.example`;
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [id, domain]);
  return { id, domain };
}

async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userIds.push(data.user.id);
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;

  const main = await makeOrg(tag, "مؤسسة الخط الزمني");
  orgId = main.id;
  memberEmail = `member@${main.domain}`;
  await makeUser(memberEmail);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  catId = cat[0].id;
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name) values ($1, 'القاعة الكبرى') returning id`, [orgId]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, state, starts_at, duration_minutes, ends_at, capacity, venue_id, published_at)
     values
       ($1, $4, 'نبذة.', $2, 'introductory', 'published', now() + interval '1 day', 60, now() + interval '1 day 1 hour', 60, $3, now() - interval '1 day'),
       ($1, $5, 'نبذة.', null, 'advanced', 'published', now() + interval '9 days', 60, now() + interval '9 days 1 hour', 60, $3, now() - interval '1 day')
     returning id`,
    [orgId, catId, venue[0].id, SOON, COMMITTED],
  );
  committedId = rows[1].id;

  // An org with nothing scheduled at all, for the empty screen.
  const empty = await makeOrg(`${tag}-empty`, "مؤسسة بلا جلسات");
  emptyEmail = `member@${empty.domain}`;
  await makeUser(emptyEmail);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const id of orgs) await db.query(`delete from public.orgs where id = $1`, [id]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function capture(p: Page, name: string) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} must not scroll sideways`).toBe(true);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `wave6-sessions-${name}.png`), fullPage: true });
}

test("★ /app IS the timeline, and the member's next committed session is the first item — not repeated below", async ({ context, page }, testInfo) => {
  const memberId = await signIn(context, memberEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await db.query(`delete from public.rsvps where session_id = $1 and member_id = $2`, [committedId, memberId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, committedId, memberId]);

  await page.goto("/ar/app");
  await expect(page).toHaveURL(/\/ar\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: "الجلسات" })).toBeVisible();

  const cards = page.locator("article");
  await expect(cards.first()).toContainText(COMMITTED);
  await expect(cards.first()).toContainText("التالية لك");
  await expect(page.getByText(COMMITTED)).toHaveCount(1);
  await expect(page.getByText(SOON)).toBeVisible();
  // «هذا الأسبوع» with its count, as a labelled group.
  await expect(page.getByRole("region", { name: /هذا الأسبوع/ })).toContainText(SOON);

  if (testInfo.project.name === "phone") await capture(page, "timeline-items");
  await db.query(`delete from public.rsvps where session_id = $1 and member_id = $2`, [committedId, memberId]);
});

test("★ a filter applied on /app lands on the canonical /app/sessions (DEC-130)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app");
  await page.getByRole("navigation", { name: "تصفية الجلسات" }).getByRole("link", { name: "فني" }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/app/sessions\\?category=${catId}$`));
  await expect(page.getByText(SOON)).toBeVisible();
  await expect(page.getByText(COMMITTED)).toHaveCount(0);
});

test("★ the empty case is the same screen, inviting a proposal (REQ-UIX-021, REQ-UIX-012)", async ({ context, page }, testInfo) => {
  await signIn(context, emptyEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await page.goto("/ar/app");
  await expect(page.getByRole("heading", { level: 1, name: "الجلسات" })).toBeVisible();
  await expect(page.getByText("لا جلسات قادمة بعد")).toBeVisible();
  await expect(page.getByRole("link", { name: "اقترح موضوعًا" })).toHaveAttribute("href", "/ar/app/propose");
  await expect(page.getByRole("navigation", { name: "تصفية الجلسات" })).toBeVisible();
  if (testInfo.project.name === "phone") await capture(page, "timeline-empty");
});

test("★ filtered-empty names the filter that emptied it; «أزل» drops only that one", async ({ context, page }, testInfo) => {
  await signIn(context, memberEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  // «فني» holds only the introductory session, so adding «متقدم» empties it —
  // and removing «متقدم» alone restores one session.
  await page.goto(`/ar/app/sessions?category=${catId}&level=advanced`);
  await expect(page.getByText("لا جلسات تطابق «\u2068متقدم\u2069» مع بقية عوامل التصفية")).toBeVisible();
  await expect(page.getByText("إزالته وحده تُظهر جلسة واحدة")).toBeVisible();
  if (testInfo.project.name === "phone") await capture(page, "timeline-filtered-empty");

  await page.getByRole("link", { name: "أزل «\u2068متقدم\u2069»" }).click();
  await expect(page).toHaveURL(new RegExp(`category=${catId}$`));
  await expect(page.getByText(SOON)).toBeVisible();
});
