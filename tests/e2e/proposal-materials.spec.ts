// REQ-PRO-004 — draft materials on a proposal, against REAL local Supabase.
// The proposal itself is seeded directly (SCR-017's own form is the
// `sessions` track's to e2e-test); what this proves is the visibility rule
// (admins and the proposal's own owner only, until publication) and the
// upload form driving the real Route Handlers end to end.
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
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let proposalId = "";
let proposerEmail = "";
let bystanderEmail = "";
let adminEmail = "";
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
  domain = `propmat-e2e-${tag}.example`;
  proposerEmail = `proposer@${domain}`;
  bystanderEmail = `bystander@${domain}`;
  adminEmail = `admin@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة مواد المقترح', $1, 'PM', gen_random_uuid()) returning id`,
    [`propmat-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);

  for (const [email, name] of [
    [proposerEmail, "صاحب المقترح"],
    [bystanderEmail, "زميل آخر"],
    [adminEmail, "المشرف"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const proposerMemberId = await provisionMemberId(proposerEmail);
  const adminMemberId = await provisionMemberId(adminEmail);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminMemberId]);

  const { rows: propRows } = await db.query<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, 'اقتراح جلسة عن الذكاء الاصطناعي', 'ملخص المقترح', $3, 'intermediate', 'draft') returning id`,
    [orgId, proposerMemberId, catRows[0].id],
  );
  proposalId = propRows[0].id;
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

test("★ REQ-PRO-004: the proposer uploads a draft material through the real upload pipeline; it obeys the size/sniff rules like any material", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, proposerEmail);
  await page.goto(`/ar/app/propose/${proposalId}`);

  await page.getByLabel("نوع المادة").selectOption("image");
  await page.getByLabel("عنوان المادة").fill("صورة توضيحية");
  await page.getByLabel("الملف").setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByRole("button", { name: "رفع" }).click();

  await expect(page.getByText("صورة توضيحية")).toBeVisible();
  await review(page, "proposal-materials");

  const { rows } = await db.query<{ proposal_id: string; session_id: string | null; render_status: string }>(
    `select proposal_id, session_id, render_status from public.materials where proposal_id = $1`,
    [proposalId],
  );
  expect(rows.length).toBe(1);
  expect(rows[0].session_id).toBeNull();
});

test("★ REQ-PRO-004: not visible to an unrelated member; visible to an admin", async ({ context, page }) => {
  await signIn(context, bystanderEmail);
  const res = await page.goto(`/ar/app/propose/${proposalId}`);
  expect(res?.status()).toBe(404);

  await context.clearCookies();
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/propose/${proposalId}`);
  await expect(page.getByText("صورة توضيحية")).toBeVisible();
});
