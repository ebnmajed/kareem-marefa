// Wave 27 · console — a member's company follows their email domain (REQ-PRF-012, REQ-PRF-013, REQ-ADM-024,
// DEC-254 §2, DEC-255 §4; STORY-ADM-012, 013, STORY-PRF-007). The job, end to end, and the captures:
//   .qa-shots/rtl/wave27-console-<screen>-<state>-<1280|390>.png
//
//  · 048: the admin adds a domain to a company; the save ASKS — two move to it, one stays because an admin placed them —
//    and «انقل واحفظ» does exactly that. The row then shows the domain left to right.
//  · 049: the two are in the company and the one is where the admin put them; ⋯ «غيّر الشركة» places a member by hand.
//  · 021: the member sees their company and has no control for it.
//  · 062: the log answers it — «إضافة نطاق إلى شركة», «تغيير شركة عضو».
//  · 048 at 390: cards, the domain included, never a sideways page.
// ★ Needs 0203 and console's promoted functions on the local stack. Locators from #main; dialogs by role; toasts exact.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let orgDomain = "";
let acmeDomain = "";
let adminEmail = "";
const userIds: string[] = [];
const people = { one: "سارة القحطاني", two: "فهد العنزي", pinned: "نورة العتيبي" };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  orgDomain = `w27-console-${tag}.example`;
  acmeDomain = `acme-${tag}.example`;
  adminEmail = `boss@${orgDomain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ('شبه الجزيرة', $1, 'WS', gen_random_uuid(), $2) returning id`,
    [`w27-console-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  // Two independent lists (ruling 1): the org admits both domains; no company carries one yet.
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2), ($1, $3)`, [orgId, orgDomain, acmeDomain]);
  await db.query(`insert into public.companies (org_id, name, team_color) values ($1, 'أكمي', '#35d0ff'), ($1, 'شركة أخرى', '#ff9a2e')`, [orgId]);

  for (const [email, name] of [
    [adminEmail, "عبدالله المطيري"],
    [`one@${acmeDomain}`, people.one],
    [`two@${acmeDomain}`, people.two],
    [`pinned@${acmeDomain}`, people.pinned],
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

async function signIn(context: BrowserContext, email = adminEmail) {
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

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/wave27-console-${name}.png`, fullPage: true });
const more = (page: Page, name: string) => page.locator("#main").getByRole("button", { name: `مزيد من الإجراءات على ${name}` }).filter({ visible: true });

async function placement(name: string) {
  const { rows } = await db.query<{ company: string | null; source: string | null }>(
    `select c.name as company, m.company_assigned_by::text as source from public.members m left join public.companies c on c.id = m.company_id
      where m.org_id = $1 and m.display_name = $2`,
    [orgId, name],
  );
  return rows[0];
}

test("048 → 049 → 021 → 062 at 1280: a domain moves the people who belong, asks first, and leaves the admin's placement", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the console's primary width");
  await page.setViewportSize(DESKTOP);
  // The three arrive before any company carries their domain: no company, nobody's placement.
  for (const local of ["one", "two", "pinned"]) await signIn(context, `${local}@${acmeDomain}`);
  expect(await placement(people.one)).toEqual({ company: null, source: null });
  // An admin's earlier placement, standing in for SCR-049 (no source named → the admin's).
  await db.query(`update public.members set company_id = (select id from public.companies where org_id = $1 and name = 'شركة أخرى') where org_id = $1 and display_name = $2`, [orgId, people.pinned]);
  await context.clearCookies();

  await signIn(context);
  const main = page.locator("#main");

  // ── 048: the domain, and the question before anyone moves ────────────────────────────────────────────────────────
  await goto(page, "/ar/app/admin/companies");
  await more(page, "أكمي").click();
  await page.getByRole("menuitem", { name: "عدّل" }).click();
  const sheet = page.getByRole("dialog", { name: "عدّل الشركة" });
  const domains = sheet.getByLabel("النطاقات");
  await expect(domains).toHaveAttribute("dir", "ltr");
  await domains.fill(acmeDomain.toUpperCase());
  await shot(page, "048-domains-1280");
  await sheet.getByRole("button", { name: "احفظ" }).click();

  const ask = page.getByRole("dialog", { name: "حفظ نطاقات «أكمي»؟" });
  await expect(ask).toContainText("ينتقل عضوان إلى «أكمي»");
  await expect(ask).toContainText("يبقى عضو واحد مكانه لأن مشرفًا وضعه يدويًا");
  await shot(page, "048-confirm-1280");
  // Nothing has moved while it asks.
  expect(await placement(people.one)).toEqual({ company: null, source: null });

  await ask.getByRole("button", { name: "انقل واحفظ" }).click();
  await expect(page.getByText("حُفظت الشركة.", { exact: true })).toBeVisible();
  const row = main.getByRole("row", { name: /أكمي/ });
  const shown = row.getByText(acmeDomain, { exact: true });
  await expect(shown).toBeVisible();
  expect(await shown.evaluate((el) => [el.tagName, el.getAttribute("dir")])).toEqual(["BDI", "ltr"]);
  await shot(page, "048-saved-1280");

  expect(await placement(people.one)).toEqual({ company: "أكمي", source: "domain" });
  expect(await placement(people.two)).toEqual({ company: "أكمي", source: "domain" });
  expect(await placement(people.pinned)).toEqual({ company: "شركة أخرى", source: "admin" });

  // ── 049: where each one is, and a placement by hand ──────────────────────────────────────────────────────────────
  await goto(page, "/ar/app/admin/members");
  await expect(main.getByRole("row", { name: new RegExp(people.one) }).getByText("أكمي")).toBeVisible();
  await expect(main.getByRole("row", { name: new RegExp(people.pinned) }).getByText("شركة أخرى")).toBeVisible();
  await more(page, people.two).click();
  await page.getByRole("menuitem", { name: "غيّر الشركة" }).click();
  const place = page.getByRole("dialog");
  await place.getByLabel("الشركة").selectOption({ label: "شركة أخرى" });
  await shot(page, "049-company-1280");
  await place.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByText("حُفظت الشركة.", { exact: true })).toBeVisible();
  expect(await placement(people.two)).toEqual({ company: "شركة أخرى", source: "admin" });

  // ── 062: the log answers it ──────────────────────────────────────────────────────────────────────────────────────
  await goto(page, "/ar/app/admin/audit");
  await expect(main.getByText("إضافة نطاق إلى شركة").first()).toBeVisible();
  await expect(main.getByText("تغيير شركة عضو").first()).toBeVisible();

  // ── 021: the member sees their company and cannot change it ─────────────────────────────────────────────────────
  await context.clearCookies();
  await signIn(context, `one@${acmeDomain}`);
  await goto(page, "/ar/app/me");
  await expect(main.getByRole("region", { name: "ملفي" }).getByText("أكمي", { exact: true })).toBeVisible();
  await goto(page, "/ar/app/me?edit");
  await expect(main.getByRole("heading", { level: 2, name: "تعديل ملفي" })).toBeVisible();
  await expect(main.getByLabel("الشركة", { exact: false })).toHaveCount(0);
  await shot(page, "021-edit-1280");
});

test("048 at 390: the domain is in the card, never a sideways page", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone treatment");
  await page.setViewportSize(PHONE);
  await db.query(
    `insert into public.company_domains (org_id, company_id, domain)
     select $1, id, $2 from public.companies where org_id = $1 and name = 'أكمي' on conflict do nothing`,
    [orgId, acmeDomain],
  );
  await signIn(context);
  await goto(page, "/ar/app/admin/companies");
  await expect(page.locator("#main").getByText(acmeDomain, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(page, "048-default-390");
});
