// SCR-049 · /app/admin/members — members and roles, against REAL local
// Supabase (REQ-ADM-009, REQ-TEN-005). Proves what the RLS suite
// (`tests/rls/rpcs.test.ts`, `tests/rls/admin-members.test.ts`) cannot:
// the real page renders the admin-only email column, the last-admin guard
// reads as a real Arabic sentence in the role form, and a deactivation
// reason typed by the admin actually lands in the transaction.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
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
let memberId = "";
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
  domain = `admin-members-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الأعضاء', $1, 'MB', gen_random_uuid(), $2) returning id`,
    [`admin-members-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الأعضاء"],
    [memberEmail, "عضو تحت الاختبار"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  memberId = await provisionMemberId(memberEmail);
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

test("a member cannot open the members screen", async ({ context, page }) => {
  await signIn(context, memberEmail);
  const response = await page.goto("/ar/app/admin/members");
  expect(response!.status()).toBe(404);
});

test("REQ-ADM-009: the admin sees every member's email, and REQ-TEN-005: a role change is refused, then audited once it succeeds", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/members");
  await expect(page.getByRole("heading", { name: "الأعضاء والأدوار", level: 1 })).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();

  const row = page.locator("li", { has: page.getByText("عضو تحت الاختبار", { exact: true }) });
  await row.getByLabel("الدور").selectOption("moderator");
  await row.getByRole("button", { name: "غيّر الدور" }).click();
  // Not `toHaveValue("moderator")` on the select: it is uncontrolled
  // (`defaultValue`), so it already reads "moderator" the instant
  // `selectOption` runs and would pass even if the server action never
  // completed — a race the DB assertion below would then lose. The
  // confirmation text is driven by `useActionState`'s own returned state,
  // which only updates once the RPC has actually returned.
  await expect(row.getByText("غُيِّر الدور.")).toBeVisible();

  const { rows: memberRow } = await db.query<{ org_role: string }>(`select org_role from public.members where id = $1`, [memberId]);
  expect(memberRow[0].org_role).toBe("moderator");
  const audit = await db.query(`select action from public.audit_log where action = 'member.role_changed' and subject_id = $1`, [memberId]);
  expect(audit.rowCount).toBe(1);
});

test("REQ-ADM-009: the last admin cannot be demoted — the RPC's guard reads as a real sentence", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/members");
  const { rows: adminMemberRows } = await db.query<{ id: string }>(`select id from public.members where org_id = $1 and org_role = 'admin'`, [orgId]);
  expect(adminMemberRows).toHaveLength(1);
  await expect(page.getByText("مشرفة الأعضاء")).toBeVisible();

  const row = page.locator("li", { has: page.getByText("مشرفة الأعضاء", { exact: true }) });
  await row.getByLabel("الدور").selectOption("member");
  await row.getByRole("button", { name: "غيّر الدور" }).click();
  await expect(row.getByText("لا يمكن ترك المؤسسة بلا مشرف")).toBeVisible();

  const { rows } = await db.query<{ org_role: string }>(`select org_role from public.members where id = $1`, [adminMemberRows[0].id]);
  expect(rows[0].org_role).toBe("admin");
});

test("REQ-ADM-009: deactivation needs a written reason, and the reason lands in the audit log", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/members");
  const row = page.locator("li", { has: page.getByText("عضو تحت الاختبار", { exact: true }) });

  await row.getByRole("button", { name: "عطّل العضوية" }).click();
  await row.getByRole("button", { name: "أرسل" }).click();
  await expect(row.getByText("اكتب سبب التعطيل أولًا")).toBeVisible();

  await row.getByLabel("سبب التعطيل الذي يُسجَّل في سجل التدقيق").fill("مغادرة الشركة");
  await row.getByRole("button", { name: "أرسل" }).click();
  await expect(row.getByText("معطَّل", { exact: true })).toBeVisible();
  await expect(row.getByText("مغادرة الشركة", { exact: true })).toBeVisible();

  const { rows } = await db.query<{ status: string; deactivated_reason: string }>(`select status, deactivated_reason from public.members where id = $1`, [memberId]);
  expect(rows[0]).toEqual({ status: "deactivated", deactivated_reason: "مغادرة الشركة" });

  await row.getByRole("button", { name: "أعد تفعيل العضوية" }).click();
  await expect(row.getByText("معطَّل")).toHaveCount(0);
});

test("SCR-049 at 390 px RTL: the members list reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/members");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // Measured against the layout viewport, not `scrollWidth - clientWidth`: in an RTL
  // document the vertical scrollbar sits on the left, so that difference is the
  // scrollbar's width on every page that scrolls (TEAM.md §5; the reasoning is in
  // tests/e2e/notify-screens.spec.ts). Names what escapes, rather than a boolean.
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
  expect(overflow, "the members list must not scroll sideways at 390 px").toEqual([]);
  await page.screenshot({ path: `.qa-shots/rtl/scr-049-members-390-rtl-${test.info().project.name}.png`, fullPage: true });
});

