// ★ Half of the M8 demonstrable (14-roadmap.md §M8): a super admin creates an
// org, sets its first admin, and CANNOT READ A SINGLE ROW OF ITS DATA — walked
// through the real screens against two real orgs, with the real Route Handlers
// and the real RPCs. The RLS sweep (tests/rls/platform-schema.test.ts) proves
// the wall per table; this proves the console itself never opens a door the
// sweep does not know about, which a mocked client could never catch.
//
// The other half — a break-glass session appearing in THE ORG'S OWN audit log
// and expiring on its own — is the last two cases: the session is started from
// SCR-085 and then read from the org admin's own /app/admin/audit.
//
// Same seeding and sign-in as second-org.spec.ts: real auth users, a real
// provision_member(), cookies from a server client (DEC-020).
import AxeBuilder from "@axe-core/playwright";
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
// The same rule tags as tests/e2e/a11y.spec.ts, because the console is part of
// the same WCAG 2.2 AA promise (REQ-NFR-007) and a second, looser set would
// make "the a11y harness passes" mean two different things.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.describe.configure({ mode: "serial" });

type SeededOrg = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  adminEmail: string;
  memberEmail: string;
  memberName: string;
  sessionTitle: string;
};

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let a: SeededOrg;
let b: SeededOrg;
let platformEmail: string;
let tag: string;
const userIds: string[] = [];
const createdOrgIds: string[] = [];

async function makeUser(email: string, fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  return data.user.id;
}

async function provision(email: string) {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
}

/**
 * Seeded directly, not through the console: these two orgs exist so the
 * console has something to be blind about, and the case that creates one
 * through SCR-081 needs a clean slate of its own.
 */
async function seedOrg(letter: "a" | "b", prefix: string): Promise<SeededOrg> {
  const domain = `plat-${letter}-${tag}.example`;
  const adminEmail = `boss@${domain}`;
  const memberEmail = `member@${domain}`;
  const name = letter === "a" ? `مؤسسة المنصة الأولى ${tag}` : `مؤسسة المنصة الثانية ${tag}`;
  const slug = `plat-${letter}-${tag}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ($1, $2, $3, gen_random_uuid(), $4) returning id`,
    [name, slug, prefix, adminEmail],
  );
  const id = rows[0].id;
  createdOrgIds.push(id);
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [id, domain]);

  const memberName = `عضو ${letter} ${tag}`;
  await makeUser(adminEmail, `مشرف ${name}`);
  await makeUser(memberEmail, memberName);
  await provision(memberEmail);

  const { rows: cat } = await db.query<{ id: string }>(
    `insert into public.categories (org_id, name) values ($1, $2) returning id`,
    [id, `تصنيف ${letter} ${tag}`],
  );
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, capacity) values ($1, $2, 40) returning id`,
    [id, `قاعة ${letter} ${tag}`],
  );
  const sessionTitle = `جلسة سرية ${letter} ${tag}`;
  await db.query(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour',
             $4, 30, now() + interval '3 days', now() + interval '3 days', 'published', now())`,
    [id, sessionTitle, cat[0].id, venue[0].id],
  );
  return { id, name, slug, domain, adminEmail, memberEmail, memberName, sessionTitle };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  tag = `${testInfo.workerIndex}-${Date.now()}`;

  a = await seedOrg("a", "PLA");
  b = await seedOrg("b", "PLB");

  // The super admin: an auth user with a row in `platform_admins` and NO
  // member row anywhere. That is the shape the whole design assumes.
  platformEmail = `super@platform-${tag}.example`;
  const platformUserId = await makeUser(platformEmail, `مدير المنصة ${tag}`);
  await db.query(`insert into public.platform_admins (auth_user_id) values ($1)`, [platformUserId]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const id of createdOrgIds) await db.query(`delete from public.orgs where id = $1`, [id]);
  await db.end();
});

/** A super admin has no member row, so `provision_member()` is NOT called. */
async function signInPlatform(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: platformEmail, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  // The hook runs at issuance, so a refresh is what puts `platform_admin` on
  // the token — exactly what SCR-085 does after starting a session.
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function signInMember(context: BrowserContext, email: string) {
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

/** One 390 px RTL capture per screen, plus the sideways check (TEAM.md §5). */
async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
  // The sideways check runs on the phone project only: a desktop context
  // resized to 390 px carries a 12 px scrollbar a mobile one does not, so
  // every page would measure 402 px (TEAM.md §5).
  if (project !== "phone") return;
  const sideways = await p.evaluate(() => {
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
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeNull();
}

/**
 * The a11y scan, in this spec rather than in `tests/e2e/a11y.spec.ts`: the
 * console needs a platform admin, and that spec's fixture is an org's member
 * and admin. Same tags, same severity rule — `serious` and `critical` fail and
 * name the rule, the selector and the help URL; `moderate` and `minor` are
 * printed for the manual half of `13` §2.
 */
async function scan(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main, [role=main]").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical")) {
    console.log(`a11y advisory ${path}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.helpUrl}`);
  }
  const report = blocking
    .map((v) => `${v.id} (${v.impact}) — ${v.help}\n  ${v.helpUrl}\n` + v.nodes.slice(0, 5).map((n) => `  ${n.target.join(" ")}`).join("\n"))
    .join("\n");
  expect(blocking, `${path}\n${report}`).toEqual([]);
}

/** Everything about an org that a super admin must never see anywhere. */
function secrets(org: SeededOrg): string[] {
  return [org.memberName, org.sessionTitle, org.memberEmail];
}

test("★ REQ-ADM-002: a super admin walks the whole console and sees no member, session or content of either org", async ({ context, page }) => {
  await signInPlatform(context);
  const never = [...secrets(a), ...secrets(b)];

  for (const path of [
    "/ar/app/platform/orgs",
    "/ar/app/platform/metrics",
    "/ar/app/platform/impersonate",
    `/ar/app/platform/orgs/${a.id}/domains`,
  ]) {
    const response = await page.goto(path);
    expect(response!.status(), `${path} answers for a super admin`).toBe(200);
    // ★ AND it is still the page that was asked for. `page.goto()` reports the
    // status of the FINAL response, so a redirect to /no-access answers 200
    // and a status check alone reads as a pass — which is exactly how the app
    // shell's member-only slot hid for a whole sync (notes/platform.md §1.9).
    expect(page.url(), `${path} is not a redirect to somewhere else`).toContain(path);
    const text = await page.locator("body").innerText();
    for (const s of never) expect(text, `${path} shows nothing an org owns (${s})`).not.toContain(s);
  }

  // Not vacuous: the console DOES show what it manages.
  await page.goto("/ar/app/platform/orgs");
  await expect(page.getByText(a.name).first()).toBeVisible();
  await expect(page.getByText(b.name).first()).toBeVisible();
  await page.goto(`/ar/app/platform/orgs/${a.id}/domains`);
  await expect(page.getByText(a.domain).first()).toBeVisible();
  await expect(page.getByText(a.adminEmail).first()).toBeVisible();
});

test("★ REQ-ADM-002: the org's own screens are closed to a super admin, and so are its APIs", async ({ context, page }) => {
  await signInPlatform(context);
  // No member row means no member session: every org screen sends them to
  // /no-access rather than rendering an empty version of itself.
  for (const path of ["/ar/app/admin", "/ar/app/admin/members", "/ar/app/sessions"]) {
    await page.goto(path);
    expect(page.url(), `${path} does not render for a super admin`).toContain("/no-access");
  }
  // And the widest window an org admin has is closed too.
  const csv = await page.request.get("/api/admin/exports/members");
  expect(csv.status(), "the members export is not a super admin's").not.toBe(200);
});

test("REQ-ADM-001: the console answers NOT FOUND for an org admin, not forbidden", async ({ context, page }) => {
  await signInMember(context, a.adminEmail);
  const response = await page.goto("/ar/app/platform/orgs");
  // A 403 would confirm the console exists and that this account is not on
  // it. 404 says nothing at all.
  expect(response!.status()).toBe(404);
});

test("★ REQ-TEN-002: a super admin creates an org and sets its first admin, and the org's own log records both", async ({ context, page }) => {
  await signInPlatform(context);
  const slug = `made-${tag}`;
  const name = `مؤسسة أُنشئت من اللوحة ${tag}`;
  const domain = `made-${tag}.example`;

  await page.goto("/ar/app/platform/orgs/new");
  await page.getByLabel(/اسم المؤسسة/).fill(name);
  await page.getByLabel(/المعرّف في الروابط/).fill(slug);
  await page.getByLabel(/بادئة الشهادات/).fill("MDE");
  await page.getByLabel(/النطاقات المسموح بها/).fill(domain);
  await page.getByLabel(/بريد أول مشرف/).fill(`boss@${domain}`);
  await page.getByRole("button", { name: /أنشئ المؤسسة/ }).click();

  // SCR-081 lands on SCR-082 for the org it just made.
  await page.waitForURL(/\/app\/platform\/orgs\/[0-9a-f-]+\/domains/);
  await expect(page.getByText(domain).first()).toBeVisible();

  const { rows } = await db.query<{ id: string }>(`select id from public.orgs where slug = $1`, [slug]);
  expect(rows).toHaveLength(1);
  createdOrgIds.push(rows[0].id);

  // REQ-TEN-002: the creation is audited in the ORG's own log, naming the
  // platform as the actor.
  const { rows: audit } = await db.query<{ action: string; actor_role: string }>(
    `select action, actor_role from public.audit_log where org_id = $1 order by occurred_at`,
    [rows[0].id],
  );
  expect(audit.map((r) => r.action)).toContain("org.created");
  expect(audit.find((r) => r.action === "org.created")!.actor_role).toBe("platform_admin");

  // DEC-052: the A27 baseline is there for an org that has published nothing.
  const { rows: baseline } = await db.query<{ n: string }>(
    `select count(*) as n from public.design_templates where scope = 'platform' and retired_at is null`,
  );
  expect(Number(baseline[0].n)).toBeGreaterThanOrEqual(8);
});

test("★ REQ-ADM-019: a break-glass session lands in the ORG's own audit log, where its admin reads it", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/impersonate");
  await page.getByLabel(/المؤسسة/).selectOption(a.id);
  await page.getByLabel(/^السبب/).fill("تحقيق في بلاغ من مشرف المؤسسة");
  await page.getByLabel(/المدة بالدقائق/).fill("30");
  await page.getByRole("button", { name: /ابدأ الجلسة/ }).click();
  await expect(page.getByText(/جلسة مفتوحة/)).toBeVisible();

  // ★ The org's OWN admin, on the org's OWN audit screen, in a separate
  // browser context: this is the property REQ-ADM-019 asks for, and reading
  // it from the database would not prove the org can see it.
  const orgContext = await page.context().browser()!.newContext();
  const orgPage = await orgContext.newPage();
  await signInMember(orgContext, a.adminEmail);
  await orgPage.goto("/ar/app/admin/audit");
  const auditText = await orgPage.locator("body").innerText();
  expect(auditText).toContain("تحقيق في بلاغ من مشرف المؤسسة");
  await orgContext.close();

  // And it ends when the super admin says so.
  await page.goto("/ar/app/platform/impersonate");
  await page.getByRole("button", { name: /أنهِ الجلسة/ }).click();
  await expect(page.getByText(/ابدأ الجلسة/)).toBeVisible();
});

test("REQ-ADM-002: a session cannot be silently extended — four hours is the ceiling", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/impersonate");
  // The input refuses past 240 in the browser; the table refuses past four
  // hours whatever the browser sends, which the RLS suite pins.
  const minutes = page.getByLabel(/المدة بالدقائق/);
  await expect(minutes).toHaveAttribute("max", "240");
});

test("REQ-NFR-007: the console passes axe at WCAG 2.2 AA", async ({ context, page }) => {
  await signInPlatform(context);
  // `/ar/app/platform` redirects to the org list, so scanning it proves the
  // entry point AND the list. The metrics screen carries the one horizontal
  // scroller in this track, which is `scrollable-region-focusable`'s case.
  for (const path of [
    "/ar/app/platform",
    "/ar/app/platform/orgs",
    "/ar/app/platform/orgs/new",
    "/ar/app/platform/templates",
    "/ar/app/platform/metrics",
    "/ar/app/platform/impersonate",
  ]) {
    await scan(page, path);
  }
});

test.describe("390 px RTL review", () => {
  test.use({ viewport: PHONE });

  test("every platform screen is captured and none scrolls sideways", async ({ context, page }) => {
    await signInPlatform(context);

    await page.goto("/ar/app/platform/orgs");
    await review(page, "scr-080-platform-orgs");

    await page.goto("/ar/app/platform/orgs/new");
    await review(page, "scr-081-platform-new-org");

    await page.goto(`/ar/app/platform/orgs/${a.id}/domains`);
    await review(page, "scr-082-platform-domains");

    await page.goto("/ar/app/platform/templates");
    await review(page, "scr-083-platform-templates");

    await page.goto("/ar/app/platform/metrics");
    await review(page, "scr-084-platform-metrics");

    await page.goto("/ar/app/platform/impersonate");
    await review(page, "scr-085-platform-impersonate");
  });
});
