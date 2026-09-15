// `/app/me/privacy` — REQ-PRF-006, REQ-PRF-007, REQ-NFR-013, REQ-NFR-005.
//
// ★ The whole export path end to end, through the real Route Handler: a member
// asks, the job builds the archive, the download answers with the member's own
// data and nobody else's. A mocked client would never catch a policy gap
// between the request and the download, which is why this runs against real
// local Supabase with two real members.
//
// The job itself is not running here, so the test does what the worker does —
// `build_data_export_payload()` then `record_data_export()`, both service-role
// — and then checks the SCREEN and the HANDLER, which are the parts a member
// actually touches.
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
let orgId: string;
let tag: string;
let meEmail: string;
let otherEmail: string;
let meMemberId: string;
let otherMemberId: string;
const userIds: string[] = [];

async function makeUser(email: string, fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  userIds.push(data.user.id);
}

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const { rows } = await db.query<{ id: string }>(`select id from public.members where email = $1`, [email]);
  return rows[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  tag = `${testInfo.workerIndex}-${Date.now()}`;

  const domain = `privacy-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by)
     values ($1, $2, 'PRV', gen_random_uuid()) returning id`,
    [`مؤسسة الخصوصية ${tag}`, `privacy-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  meEmail = `me@${domain}`;
  otherEmail = `other@${domain}`;
  await makeUser(meEmail, `صاحب البيانات ${tag}`);
  await makeUser(otherEmail, `عضو آخر ${tag}`);
  meMemberId = await provision(meEmail);
  otherMemberId = await provision(otherEmail);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/**
 * What the worker does. A real graphile-worker may or may not be running
 * beside this suite — when it is, it finishes the job in under a second and
 * this is a no-op that rewrites the same payload. The cases below therefore
 * accept either state rather than racing it: an assertion that only passes
 * when no worker is running is an assertion that fails on a healthy machine.
 */
async function runTheJob(memberId: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.data_export_requests where member_id = $1 order by requested_at desc limit 1`,
    [memberId],
  );
  await db.query(`select public.record_data_export($1, public.build_data_export_payload($2))`, [rows[0].id, memberId]);
}

test("★ REQ-PRF-006: a member asks, and the download carries their data and nobody else's", async ({ context, page }) => {
  await signIn(context, meEmail);
  await page.goto("/ar/app/me/privacy");
  await page.getByRole("button", { name: /اطلب التصدير/ }).click();
  // Queued, building or already ready — all three mean the request landed.
  await expect(page.getByText(/في الانتظار|قيد التجهيز|جاهز/)).toBeVisible();

  await runTheJob(meMemberId);
  await page.reload();
  await expect(page.getByRole("link", { name: /نزّل الملف/ })).toBeVisible();

  // The real handler, with the member's own session.
  const download = await page.request.get("/api/me/export");
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  const body = await download.text();
  expect(body).toContain(meEmail);
  // ★ REQ-PRF-006's first acceptance criterion.
  expect(body, "no other member's address").not.toContain(otherEmail);
  expect(body, "no other member's id").not.toContain(otherMemberId);
});

test("★ REQ-PRF-006: another member's download is their own, never this one's", async ({ context, page }) => {
  await signIn(context, otherEmail);
  // They have asked for nothing, so there is nothing to hand them — and the
  // answer is a plain 404 rather than an explanation.
  const empty = await page.request.get("/api/me/export");
  expect(empty.status()).toBe(404);
});

test("REQ-NFR-005: a second request inside the window is refused, and the screen says so before the click", async ({ context, page }) => {
  await signIn(context, meEmail);
  await page.goto("/ar/app/me/privacy");
  // The member asked a moment ago in the case above, so the screen states the
  // limit instead of offering a button that would be refused.
  await expect(page.getByText(/أربع وعشرين ساعة/)).toBeVisible();
  await expect(page.getByRole("button", { name: /اطلب نسخة جديدة/ })).toHaveCount(0);

  // And the rule is the RPC's, not the screen's: calling it directly is
  // refused too, which is what makes the missing button honest rather than
  // decorative.
  const { rows: before } = await db.query<{ n: string }>(
    `select count(*)::text as n from public.data_export_requests where member_id = $1`,
    [meMemberId],
  );
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  await client.auth.signInWithPassword({ email: meEmail, password: PASSWORD });
  const { error } = await client.rpc("request_data_export");
  expect(error?.message ?? "").toContain("export_rate_limited");
  const { rows: after } = await db.query<{ n: string }>(
    `select count(*)::text as n from public.data_export_requests where member_id = $1`,
    [meMemberId],
  );
  expect(after[0].n, "no second row was created").toBe(before[0].n);
});

test("★ REQ-PRF-007: a deactivation request reaches the org's log and deactivates nobody", async ({ context, page }) => {
  await signIn(context, meEmail);
  await page.goto("/ar/app/me/privacy");
  await page.getByLabel(/سبب الطلب/).fill("أغادر المؤسسة نهاية الشهر");
  await page.getByRole("button", { name: /أرسل الطلب/ }).click();
  await expect(page.getByText(/أُرسل طلبك/)).toBeVisible();

  const { rows } = await db.query<{ reason: string; status: string }>(
    `select a.reason, m.status
       from public.audit_log a join public.members m on m.id = a.subject_id
      where a.org_id = $1 and a.action = 'member.deactivation_requested'`,
    [orgId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].reason).toBe("أغادر المؤسسة نهاية الشهر");
  // Asking is not doing: an admin performs it (REQ-AUT-008).
  expect(rows[0].status).toBe("active");
});

test.describe("390 px RTL review", () => {
  test.use({ viewport: PHONE });

  test("the privacy screen is captured and does not scroll sideways", async ({ context, page }) => {
    await signIn(context, meEmail);
    await page.goto("/ar/app/me/privacy");
    const project = test.info().project.name;
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: `.qa-shots/rtl/me-privacy-390-rtl-${project}.png`, fullPage: true });
    if (project !== "phone") return;
    const sideways = await page.evaluate(() => {
      if (document.documentElement.scrollWidth <= window.innerWidth + 1) return null;
      let worst = "";
      let worstWidth = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const box = el.getBoundingClientRect();
        if (box.width <= window.innerWidth) continue;
        let contained = false;
        for (let n = el.parentElement; n; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll") {
            contained = true;
            break;
          }
        }
        if (!contained && box.width > worstWidth) {
          worstWidth = box.width;
          worst = `${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px`;
        }
      }
      return `${document.documentElement.scrollWidth}px wide, viewport ${window.innerWidth}px; widest: ${worst || "(none outside a scroller)"}`;
    });
    expect(sideways, "the privacy screen must not scroll sideways at 390 px").toBeNull();
  });
});
