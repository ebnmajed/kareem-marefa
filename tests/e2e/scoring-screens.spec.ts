// The 390 px RTL review (definition of done) for every new scoring screen:
// SCR-022, SCR-027/SCR-028, SCR-053, SCR-054. Same shape as
// tests/e2e/notify-screens.spec.ts — one capture per screen, at the width
// most members actually use, saved under `.qa-shots/rtl/` and LOOKED AT.
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

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let domain = "";
let memberUserId = "";
let memberEmail = "";
let memberId = "";
let shotCompanyId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `scoring-shots-${tag}.example`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة لقطات الشاشة', $1, 'SS', gen_random_uuid()) returning id`,
    [`scoring-shots-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: shotCompanyRows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة اللقطات') returning id`, [
    orgId,
  ]);
  shotCompanyId = shotCompanyRows[0].id;

  memberEmail = `member@${domain}`;
  const { data: memberAuth, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو اللقطات" },
  });
  if (error) throw error;
  memberUserId = memberAuth.user.id;
});

test.afterAll(async () => {
  if (memberUserId) await admin.auth.admin.deleteUser(memberUserId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: memberEmail, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

/** Same measurement as notify-screens.spec.ts — the layout viewport is the
 * only frame in which "escapes the screen" means what it sounds like. */
async function widerThanViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > limit + 1 || box.left < -1) {
        offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
      }
    }
    return offenders.slice(0, 6);
  });
}

test("390 px RTL captures of every new scoring screen", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one capture per screen, at phone width");
  memberId = await signIn(context);
  await page.setViewportSize({ width: 390, height: 900 });

  // Real content, not an empty state: a check-in award and a manual
  // adjustment, so SCR-022 and SCR-027 show an actual row and an actual
  // rank rather than the empty-state copy. The company points ledger row
  // (post-launch — docs/plan/notes/scoring.md "Company points rules") does
  // the same for the new "your company's points" section on SCR-028.
  await db.query(`update public.members set company_id = $1 where id = $2`, [shotCompanyId, memberId]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 20, 'check_in', 'تسجيل حضور مؤكَّد', $3)`,
    [orgId, memberId, `shot:${memberId}`],
  );
  await db.query(
    `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key, meta)
     values ($1, $2, 30, 'company_hosting', 'استضافة جلسة', $3, '{}'::jsonb)`,
    [orgId, shotCompanyId, `shot:company:${shotCompanyId}`],
  );

  await page.goto("/ar/app/me/points");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await widerThanViewport(page), "SCR-022 scrolls horizontally at 390 px").toEqual([]);
  await page.screenshot({ path: ".qa-shots/rtl/scr-022-points-390-rtl.png", fullPage: true });

  await page.goto("/ar/app/leaderboards");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await widerThanViewport(page), "SCR-027/028 scrolls horizontally at 390 px").toEqual([]);
  await page.screenshot({ path: ".qa-shots/rtl/scr-027-028-leaderboards-390-rtl.png", fullPage: true });

  // The two admin screens need an admin, which this member is not yet.
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  await context.clearCookies();
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 900 });

  for (const [name, path] of [
    ["scr-053-admin-scoring", "/ar/app/admin/scoring"],
    ["scr-054-admin-recognition", "/ar/app/admin/recognition"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await widerThanViewport(page), `${path} scrolls horizontally at 390 px`).toEqual([]);
    await page.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl.png`, fullPage: true });
  }
});
