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
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// `E2E_SHOTS_DIR` lets a run in the lead's verification worktree land its
// captures in the main checkout, where STATUS cites them (DEC-137, DEC-147).
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

/**
 * ★ Every text or label locator on an `/app` page is scoped to `#main`, and every
 * one that can match a `ui/data-table` cell also filters to the VISIBLE copy.
 * Two different duplicates, both found on real builds (sync 2, sync 3):
 *
 * 1. DEC-145's orphaned streamed segment — React's `$RC` swap can leave a hidden
 *    copy of the page under `body > div#S:…`, OUTSIDE `#main`. Scoping to `#main`
 *    never sees it. Role locators skip it anyway (it is hidden); text locators do not.
 * 2. `ui/data-table` renders a table AND a phone card list and hides one with CSS
 *    per breakpoint, so a cell's text is in `#main` twice. `visible: true` picks
 *    the one the project shows.
 *
 * Inputs are found by role and their own accessible name: a label locator also
 * matches a section or a table named by the same words (sync 3's five-way match).
 */
const main = (page: Page) => page.locator("#main");
// ★ And a `ui/toast` renders its sentence twice outside `#main` — the visible toast
// and Radix's visually-hidden announcer — so no assertion here reads a toast's
// text with a text locator. The banner is found as `role="status"` filtered by its
// badge («جلسة استثنائية»), which no toast sentence in this console contains.
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
let platformUserId: string;
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
  platformUserId = await makeUser(platformEmail, `مدير المنصة ${tag}`);
  await db.query(`insert into public.platform_admins (auth_user_id) values ($1)`, [platformUserId]);
});

test.afterAll(async () => {
  // A failed case can leave a break-glass session open; close it as the job would,
  // so a rerun's `impersonation_already_active` is never this run's leftover.
  if (platformUserId) {
    await db.query(
      `update public.impersonation_sessions set ended_at = least(now(), expires_at) where platform_admin_id = $1 and ended_at is null`,
      [platformUserId],
    );
  }
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

/**
 * The org claim on the access token the BROWSER holds right now — notes W8.0
 * F1/F2. `@supabase/ssr` stores the session as a (possibly chunked) cookie,
 * `base64-` prefixed; the access token's payload carries `app_metadata`, which
 * is what RLS reads. `undefined` means no session cookie at all.
 *
 * ★ This is the assertion that proves what break-glass GRANTS. The audit row, the
 * banner and the active panel are all readable without the claim, which is how
 * a session that never reached the token passed every earlier check.
 */
async function orgClaim(context: BrowserContext): Promise<string | null | undefined> {
  const chunks = (await context.cookies()).filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  if (chunks.length === 0) return undefined;
  const order = (name: string) => (/\.(\d+)$/.test(name) ? Number(name.split(".").pop()) : -1);
  chunks.sort((x, y) => order(x.name) - order(y.name));
  const joined = chunks.map((c) => c.value).join("");
  const raw = joined.startsWith("base64-") ? Buffer.from(joined.slice(7), "base64url").toString("utf8") : decodeURIComponent(joined);
  const session = JSON.parse(raw) as { access_token: string };
  const payload = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8")) as {
    app_metadata?: { org_id?: string };
  };
  return payload.app_metadata?.org_id ?? null;
}

/** Start a session from SCR-085's form, as an operator would. */
async function startFromForm(page: Page, orgId: string, reason: string) {
  await page.goto("/ar/app/platform/impersonate");
  await main(page).getByRole("combobox", { name: /^المؤسسة/ }).selectOption(orgId);
  await main(page).getByRole("textbox", { name: /^السبب/ }).fill(reason);
  await page.getByRole("radio", { name: "30 دقيقة" }).check();
  await page.getByRole("button", { name: /ابدأ الجلسة/ }).click();
  await expect(page.getByRole("region", { name: /جلسة مفتوحة/ })).toBeVisible();
}

/**
 * One 390 px RTL capture per screen state, plus the sideways check (TEAM.md §5).
 *
 * Wave 8 (DEC-147): a capture a STATUS row cites is `wave8-platform-<route>-<state>.png`,
 * phone project only, under `SHOTS`.
 */
async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  await p.evaluate(() => document.fonts.ready);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
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
  // The page's own h1, not `main`: app/loading.tsx streams a skeleton inside
  // `main` first, and `/app/platform`'s redirect to the org list then runs in
  // the browser (DEC-134's streaming model). Evaluating before that navigation
  // lands destroyed the context on the phone project, twice in sync 5.
  // The skeleton carries no h1; every platform page's PageHeader does.
  await expect(page.locator("main h1, [role=main] h1").first()).toBeVisible();
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
  await expect(main(page).getByText(a.name).filter({ visible: true }).first()).toBeVisible();
  await expect(main(page).getByText(b.name).filter({ visible: true }).first()).toBeVisible();
  await page.goto(`/ar/app/platform/orgs/${a.id}/domains`);
  await expect(main(page).getByText(a.domain).filter({ visible: true }).first()).toBeVisible();
  await expect(main(page).getByText(a.adminEmail).filter({ visible: true }).first()).toBeVisible();
});

test("★ REQ-ADM-002: the org's own screens are closed to a super admin, and so are its APIs", async ({ context, page }) => {
  await signInPlatform(context);
  const never = [...secrets(a), ...secrets(b)];

  // ★ The assertion is REQ-ADM-002's property, not a mechanism. A screen whose
  // DAL calls `requireSession()` sends a super admin to /no-access; the browse
  // page renders and comes back EMPTY, because a session with no `org_id`
  // claim matches no row under any policy. Both satisfy "cannot read a single
  // row"; demanding a redirect would couple this spec to another track's
  // choice of where it calls its DAL, and would fail on a screen that is in
  // fact perfectly safe.
  for (const path of ["/ar/app/admin", "/ar/app/admin/members", "/ar/app/sessions"]) {
    await page.goto(path);
    if (page.url().includes("/no-access")) continue;
    const text = await page.locator("body").innerText();
    for (const s of never) expect(text, `${path} renders, and shows nothing an org owns (${s})`).not.toContain(s);
  }
  // And the widest window an org admin has is closed too. `maxRedirects: 0`
  // matters here: `requireSession()` answers a Route Handler with a redirect
  // to /no-access, and a followed redirect lands on an HTML page with status
  // 200 — which reads as "the export succeeded" when nothing of the sort
  // happened. The assertion is again the property: whatever comes back, it
  // carries no member of either org.
  const csv = await page.request.get("/api/admin/exports/members", { maxRedirects: 0 });
  expect(csv.status(), "the members export is not served to a super admin").not.toBe(200);
  const body = await csv.text();
  for (const s of never) expect(body, `the members export carries nothing an org owns (${s})`).not.toContain(s);
});

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

test("REQ-ADM-001: the console answers NOT FOUND for an org admin, not forbidden", async ({ context, page }) => {
  await signInMember(context, a.adminEmail);
  await page.goto("/ar/app/platform/orgs");
  // A 403 would confirm the console exists and that this account is not on
  // it. The not-found page says nothing at all — streamed, so 200 (DEC-134).
  await expectGatedNotFound(page);
});

test("★ REQ-TEN-002: a super admin creates an org and sets its first admin, and the org's own log records both", async ({ context, page }) => {
  await signInPlatform(context);
  const slug = `made-${tag}`;
  const name = `مؤسسة أُنشئت من اللوحة ${tag}`;
  const domain = `made-${tag}.example`;

  await page.goto("/ar/app/platform/orgs/new");
  await main(page).getByRole("textbox", { name: /^اسم المؤسسة/ }).fill(name);
  await main(page).getByRole("textbox", { name: /^المعرّف في الروابط/ }).fill(slug);
  await main(page).getByRole("textbox", { name: /^بادئة الشهادات/ }).fill("MDE");
  await main(page).getByRole("textbox", { name: /^النطاقات المسموح بها/ }).fill(domain);
  await main(page).getByRole("textbox", { name: /^بريد أول مشرف/ }).fill(`boss@${domain}`);
  await page.getByRole("button", { name: /أنشئ المؤسسة/ }).click();

  // SCR-081 lands on SCR-082 for the org it just made.
  await page.waitForURL(/\/app\/platform\/orgs\/[0-9a-f-]+\/domains/);
  await expect(main(page).getByText(domain).filter({ visible: true }).first()).toBeVisible();

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

/** Open a row's menu on SCR-080 and choose an act. The hidden twin (card list or table) is excluded by the role locator. */
async function orgAct(page: Page, org: { name: string }, item: string) {
  await page.getByRole("button", { name: `إجراءات ${org.name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("★ REQ-TEN-006 · REQ-UIX-013: suspension confirms by name, refuses an empty reason beside the field, and reinstating answers", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/orgs");
  await orgAct(page, b, "إيقاف المؤسسة");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(b.name);
  await expect(dialog).toContainText("لا يحذف شيئًا");

  await dialog.getByRole("button", { name: /^أوقف/ }).click();
  await expect(dialog.getByText("السبب مطلوب، ولا يقلّ عن ثلاثة أحرف.")).toBeVisible();
  const { rows: still } = await db.query<{ status: string }>(`select status from public.orgs where id = $1`, [b.id]);
  expect(still[0].status, "an empty reason suspends nothing").toBe("active");

  await dialog.getByRole("textbox", { name: /^سبب الإيقاف/ }).fill("مراجعة مؤقتة لحساب المؤسسة");
  await dialog.getByRole("button", { name: /^أوقف/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await db.query<{ status: string }>(`select status from public.orgs where id = $1`, [b.id])).rows[0].status).toBe("suspended");

  await orgAct(page, b, "أعد التفعيل");
  await expect.poll(async () => (await db.query<{ status: string }>(`select status from public.orgs where id = $1`, [b.id])).rows[0].status).toBe("active");
});

test("★ REQ-NFR-014: deletion needs the slug typed back — a mismatch deletes nothing, the slug queues it and the platform's own log records it", async ({ context, page }) => {
  await signInPlatform(context);
  // A throwaway org: the seeded two serve every other case.
  const slug = `doomed-${tag}`;
  const name = `مؤسسة للحذف ${tag}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'DMD', gen_random_uuid()) returning id`,
    [name, slug],
  );
  createdOrgIds.push(rows[0].id);
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);

  await page.goto("/ar/app/platform/orgs");
  await orgAct(page, { name }, "حذف المؤسسة");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(name);
  await dialog.getByRole("textbox", { name: /^معرّف المؤسسة/ }).fill(`${slug}-typo`);
  await dialog.getByRole("button", { name: /احذف نهائيًا/ }).click();
  await expect(dialog.getByText(/لا يطابق معرّف المؤسسة/)).toBeVisible();
  const { rows: untouched } = await db.query<{ status: string }>(`select status from public.orgs where id = $1`, [rows[0].id]);
  expect(untouched[0].status, "a mismatched slug deletes nothing and suspends nothing").toBe("active");

  await dialog.getByRole("textbox", { name: /^معرّف المؤسسة/ }).fill(slug);
  await dialog.getByRole("button", { name: /احذف نهائيًا/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await db.query(`select 1 from public.platform_audit_log where action = 'org.deletion_requested' and subject_org = $1`, [rows[0].id])).rowCount)
    .toBe(1);
  // `0010` (sync 3's ruling): an org on its way out is offered nothing — no
  // «أعد التفعيل» for the window before the job runs. Whether the row is still
  // there («قيد الحذف») or the worker already removed it, the acts are gone.
  await page.reload();
  await expect(page.getByRole("button", { name: `إجراءات ${name}` })).toHaveCount(0);
});

test("REQ-UIX-009 · REQ-UIX-011: a refused new org summarises its fields and keeps what was typed", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/orgs/new");
  await main(page).getByRole("textbox", { name: /^اسم المؤسسة/ }).fill(`مؤسسة لم تُنشأ ${tag}`);
  await main(page).getByRole("textbox", { name: /^المعرّف في الروابط/ }).fill("Bad Slug");
  await main(page).getByRole("textbox", { name: /^النطاقات المسموح بها/ }).fill("Example.COM");
  await page.getByRole("button", { name: /أنشئ المؤسسة/ }).click();

  const summary = main(page).getByRole("alert").filter({ hasText: "تعذّر إنشاء المؤسسة" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link")).toHaveCount(3); // slug, prefix, first admin
  await expect(main(page).getByRole("textbox", { name: /^المعرّف في الروابط/ })).toHaveAttribute("aria-invalid", "true");
  await expect(main(page).getByRole("textbox", { name: /^اسم المؤسسة/ })).toHaveValue(`مؤسسة لم تُنشأ ${tag}`);
  await expect(main(page).getByRole("textbox", { name: /^النطاقات المسموح بها/ })).toHaveValue("Example.COM");
  expect(new URL(page.url()).pathname).toBe("/ar/app/platform/orgs/new");
});

test("★ REQ-TEN-007 (contract 4) · REQ-TEN-002 (F3): SCR-082 takes any case and shows what is stored; removal confirms by name", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto(`/ar/app/platform/orgs/${b.id}/domains`);

  const mixed = `Mixed-${tag}.Example`;
  await main(page).getByRole("textbox", { name: /^النطاق/ }).fill(mixed);
  await page.getByRole("button", { name: /أضف النطاق/ }).click();
  const storedDomain = mixed.toLowerCase();
  await expect(main(page).getByText(storedDomain, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(main(page).getByText(mixed, { exact: true })).toHaveCount(0);
  const { rows } = await db.query<{ domain: string }>(`select domain::text from public.org_domains where org_id = $1 and domain = $2`, [b.id, storedDomain]);
  expect(rows.map((r) => r.domain)).toEqual([storedDomain]);

  // F3 — measured refused before wave 8: a mixed-case address is saved, lowercase.
  await main(page).getByRole("textbox", { name: /^بريد أول مشرف/ }).fill(`Boss@${mixed}`);
  await page.getByRole("button", { name: /^احفظ/ }).click();
  await expect
    .poll(async () => (await db.query<{ e: string }>(`select first_admin_email::text as e from public.orgs where id = $1`, [b.id])).rows[0].e)
    .toBe(`boss@${storedDomain}`);
  // Put the seeded admin back: other cases sign in as it.
  await db.query(`update public.orgs set first_admin_email = $2 where id = $1`, [b.id, b.adminEmail]);

  await page.getByRole("button", { name: `احذف ${storedDomain}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(storedDomain);
  await expect(dialog).toContainText("لا يفقد أحد وصوله");
  await dialog.getByRole("button", { name: "احذف" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await db.query(`select 1 from public.org_domains where org_id = $1 and domain = $2`, [b.id, storedDomain])).rowCount).toBe(0);
});

test("★ REQ-ADM-003: SCR-084 reads all eight alerts through platform_alerts(), and job health is a card list on a phone", async ({ context, page }) => {
  // Needs `0008_platform_alerts_read` applied (promoted, or proposed and applied):
  // without it the page says the alerts could not be read, and this case says so too.
  await signInPlatform(context);
  await page.goto("/ar/app/platform/metrics");
  const alerts = page.getByRole("region", { name: /التنبيهات/ });
  await expect(alerts).not.toContainText("تعذّر قراءة حالة التنبيهات");
  const phone = test.info().project.name === "phone";
  // The visible twin: a table from `md`, cards below it.
  const rows = phone ? alerts.getByRole("listitem") : alerts.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(phone ? 8 : 9);
  for (const s of [...secrets(a), ...secrets(b)]) await expect(page.locator("body")).not.toContainText(s);
});

test("★ REQ-DSG-026 · DEC-148: SCR-083 lists the baseline as rows of a composition — certificates in both orientations — and offers no retirement below the floor", async ({ context, page }) => {
  // Needs `0009_platform_library_roster` and `designer`'s roster seed applied.
  await signInPlatform(context);
  await page.goto("/ar/app/platform/templates");
  const phone = test.info().project.name === "phone";
  const certificates = page.getByRole("region", { name: /^الشهادات/ });
  const posters = page.getByRole("region", { name: /^الملصقات/ });
  await expect(certificates).toContainText("أفقي");
  await expect(certificates).toContainText("عمودي");
  await expect(posters).not.toContainText("عمودي");
  if (!phone) await expect(posters.getByRole("columnheader", { name: "الشكل" })).toHaveCount(0);
  // The baseline is badged as such, and no document or preview is on the page.
  await expect(main(page).getByText("أساسي").filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("main img, main canvas")).toHaveCount(0);
});

test("★ REQ-ADM-019: a break-glass session lands in the ORG's own audit log, where its admin reads it", async ({ context, page }) => {
  await signInPlatform(context);
  await startFromForm(page, a.id, "تحقيق في بلاغ من مشرف المؤسسة");

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

  // And it ends when the super admin says so. Scoped to the page's own panel:
  // the banner carries the same control (wave 8 — there is one stop control).
  await page.goto("/ar/app/platform/impersonate");
  await page.getByRole("region", { name: /جلسة مفتوحة/ }).getByRole("button", { name: /أنهِ الجلسة/ }).click();
  await expect(main(page).getByRole("button", { name: /ابدأ الجلسة/ })).toBeVisible();
});

test("REQ-ADM-001 · REQ-UIX-017: the console's home renders, and the rail follows a client-side navigation", async ({ context, page }) => {
  test.skip(test.info().project.name !== "desktop", "the rail is the desktop shape; the phone switcher is the review's");
  await signInPlatform(context);
  await page.goto("/ar/app/platform");
  // ★ A page, not a redirect (wave 8): the URL stays and the home has its own h1.
  expect(new URL(page.url()).pathname).toBe("/ar/app/platform");
  await expect(page.getByRole("heading", { level: 1, name: "لوحة المنصة" })).toBeVisible();
  const rail = page.getByRole("navigation", { name: "لوحة المنصة" }).filter({ has: page.getByRole("link", { name: "المؤسسات" }) });
  await expect(rail.getByRole("link", { name: "لوحة المنصة" })).toHaveAttribute("aria-current", "page");

  // ★ The layout does not re-render on this navigation; the rail must still move.
  await rail.getByRole("link", { name: "المؤسسات" }).click();
  await page.waitForURL(/\/ar\/app\/platform\/orgs$/);
  await expect(rail.getByRole("link", { name: "المؤسسات" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "لوحة المنصة" })).not.toHaveAttribute("aria-current");

  // The second skip link lands past the rail.
  await page.goto("/ar/app/platform");
  await expect(page.getByRole("heading", { level: 1, name: "لوحة المنصة" })).toBeVisible();
  // ★ Sync 2 found TWO identical skip links. The layout renders one, so the
  // question was where the second lives — asserted here rather than assumed:
  // exactly one inside `#main`, and any other copy inside a hidden ancestor
  // outside it, which is DEC-145's orphaned streamed segment, not a double render.
  const copies = await page
    .locator('a[href="#platform-content"]')
    .evaluateAll((els) => els.map((el) => ({ inMain: el.closest("#main") !== null, hidden: el.closest("[hidden]") !== null })));
  expect(copies.filter((c) => c.inMain), "the layout renders exactly one skip link").toHaveLength(1);
  expect(copies.filter((c) => !c.inMain).every((c) => c.hidden), "any other copy is the hidden orphaned segment").toBe(true);
  await main(page).locator('a[href="#platform-content"]').focus();
  await page.keyboard.press("Enter");
  await expect(main(page).locator("#platform-content")).toBeFocused();
});

test("REQ-ADM-002: a session cannot be silently extended — four hours is the ceiling", async ({ context, page }) => {
  await signInPlatform(context);
  await page.goto("/ar/app/platform/impersonate");
  // Five presets, the last the table's own ceiling: the form cannot ask for more
  // than four hours, and the table refuses more whatever arrives (the RLS suite).
  const group = page.getByRole("radiogroup", { name: "المدة" });
  const values = await group.getByRole("radio").evaluateAll((els) => els.map((el) => Number((el as HTMLInputElement).value)));
  expect(values).toEqual([15, 30, 60, 120, 240]);
  await expect(group.getByRole("radio", { name: "ساعة واحدة" })).toBeChecked();
  await expect(group.getByRole("radio", { name: /4 ساعات/ })).toBeVisible();
});

test("★ REQ-ADM-002 (F2, F1): starting from the page puts the org on the TOKEN, and stopping from the page takes it off", async ({ context, page }) => {
  await signInPlatform(context);
  expect(await orgClaim(context), "a super admin carries no org").toBeNull();

  // F2 — measured red before wave 8: the session and its audit row existed, and
  // the token never carried the org, because the refresh lived in an effect of a
  // form the same response unmounted.
  await startFromForm(page, a.id, "مراجعة صلاحية الجلسة على الرمز");
  await expect.poll(() => orgClaim(context), { message: "the started session reaches the token" }).toBe(a.id);

  // F1 — measured red before wave 8: the page's own stop was a plain form that
  // ended the row and left the org on the token for up to 900 s.
  await page.getByRole("region", { name: /جلسة مفتوحة/ }).getByRole("button", { name: /أنهِ الجلسة/ }).click();
  await expect(page.getByRole("button", { name: /ابدأ الجلسة/ })).toBeVisible();
  await expect.poll(() => orgClaim(context), { message: "stopping takes the org off the token" }).toBeNull();
  await expect(page.getByRole("status").filter({ hasText: "جلسة استثنائية" })).toHaveCount(0);
});

test("★ REQ-ADM-002 (C1): an org route lands on /no-access WITH the banner, and the banner's stop takes the org off the token", async ({ context, page }) => {
  await signInPlatform(context);
  await startFromForm(page, b.id, "التحقق من شاشة المؤسسة أثناء الجلسة");
  await expect.poll(() => orgClaim(context)).toBe(b.id);

  // DEC-055 option C, as built: a break-glass session has no member id, so an org
  // screen sends it to /no-access — and the banner is there.
  await page.goto("/ar/app/sessions");
  await page.waitForURL(/\/ar\/no-access/);
  const banner = page.getByRole("status").filter({ hasText: "جلسة استثنائية" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(b.name);
  await expect(banner).toContainText(/تنتهي عند/);
  for (const secret of secrets(b)) await expect(page.locator("body")).not.toContainText(secret);
  // L1 (the lead's b8d511d): a platform admin with no org is offered the console
  // first here — not «sign in with another account», which during break-glass
  // would sign the operator out.
  await expect(page.getByRole("heading", { level: 1, name: "هذا الحساب لا ينتمي إلى مؤسسة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "لوحة المنصة" })).toBeVisible();

  await banner.getByRole("button", { name: /أنهِ الجلسة/ }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => orgClaim(context), { message: "the banner's stop takes the org off the token" }).toBeNull();
});

test("REQ-NFR-007: the console passes axe at WCAG 2.2 AA", async ({ context, page }) => {
  await signInPlatform(context);
  // `/ar/app/platform` is the console's home since wave 8 (it no longer
  // redirects). The metrics screen carries the one horizontal scroller in this
  // track, which is `scrollable-region-focusable`'s case.
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
    test.skip(test.info().project.name !== "phone", "wave 8 captures are the phone project's (DEC-147)");
    await signInPlatform(context);

    // P0 + P1 — the console's home, and its section switcher open.
    await page.goto("/ar/app/platform");
    await expect(page.getByRole("heading", { level: 1, name: "لوحة المنصة" })).toBeVisible();
    await review(page, "wave8-platform-home-default");
    await page.getByRole("button", { name: "أقسام لوحة المنصة: لوحة المنصة" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await review(page, "wave8-platform-shell-nav-open");
    await page.keyboard.press("Escape");

    // P2 — the stacked card list, a suspension confirm open, a refused deletion.
    await page.goto("/ar/app/platform/orgs");
    await expect(main(page).getByText(a.name).filter({ visible: true }).first()).toBeVisible();
    await review(page, "wave8-platform-orgs-cards");
    await orgAct(page, a, "إيقاف المؤسسة");
    await expect(page.getByRole("dialog")).toBeVisible();
    await review(page, "wave8-platform-orgs-suspend-confirm");
    await page.keyboard.press("Escape");
    await orgAct(page, a, "حذف المؤسسة");
    await page.getByRole("dialog").getByRole("textbox", { name: /^معرّف المؤسسة/ }).fill("not-the-slug");
    await page.getByRole("dialog").getByRole("button", { name: /احذف نهائيًا/ }).click();
    await expect(page.getByRole("dialog").getByText(/لا يطابق معرّف المؤسسة/)).toBeVisible();
    await review(page, "wave8-platform-orgs-delete-mismatch");
    await page.keyboard.press("Escape");

    // P3 — a new org with field errors, the summary focused, the values kept.
    await page.goto("/ar/app/platform/orgs/new");
    await main(page).getByRole("textbox", { name: /^اسم المؤسسة/ }).fill("مؤسسة التصوير");
    await main(page).getByRole("textbox", { name: /^المعرّف في الروابط/ }).fill("Bad Slug");
    await page.getByRole("button", { name: /أنشئ المؤسسة/ }).click();
    await expect(main(page).getByRole("alert").filter({ hasText: "تعذّر إنشاء المؤسسة" })).toBeVisible();
    await review(page, "wave8-platform-orgs-new-field-error");

    // P4 — a mixed-case domain saved, listed as stored (contract 4).
    await page.goto(`/ar/app/platform/orgs/${a.id}/domains`);
    const shotDomain = `Shot-${tag}.Example`;
    await main(page).getByRole("textbox", { name: /^النطاق/ }).fill(shotDomain);
    await page.getByRole("button", { name: /أضف النطاق/ }).click();
    await expect(main(page).getByText(shotDomain.toLowerCase(), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await review(page, "wave8-platform-domains-mixed-case-saved");

    // P5 — the library with the baseline.
    await page.goto("/ar/app/platform/templates");
    await expect(page.getByRole("heading", { level: 1, name: "مكتبة قوالب المنصة" })).toBeVisible();
    await review(page, "wave8-platform-templates-baseline");

    // P6 — metrics: the alerts, the totals, job health as cards.
    await page.goto("/ar/app/platform/metrics");
    await expect(page.getByRole("heading", { level: 1, name: "مؤشرات المنصة" })).toBeVisible();
    await review(page, "wave8-platform-metrics-default");

    // P7 — SCR-085's states, and the banner where an org route lands (C1).
    await page.goto("/ar/app/platform/impersonate");
    await expect(page.getByRole("button", { name: /ابدأ الجلسة/ })).toBeVisible();
    await review(page, "wave8-platform-impersonate-empty");

    await startFromForm(page, a.id, "مراجعة شاشة المؤسسة للتصوير");
    await expect(page.getByRole("status").filter({ hasText: "جلسة استثنائية" })).toBeVisible();
    await review(page, "wave8-platform-impersonate-active");

    await page.goto("/ar/app/sessions");
    await page.waitForURL(/\/ar\/no-access/);
    await expect(page.getByRole("status").filter({ hasText: "جلسة استثنائية" })).toBeVisible();
    await review(page, "wave8-platform-impersonate-banner-org-route");
    await page.getByRole("status").filter({ hasText: "جلسة استثنائية" }).getByRole("button", { name: /أنهِ الجلسة/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "جلسة استثنائية" })).toHaveCount(0);

    // Expired: the latest session ended on its own, arranged as the expiry job
    // leaves one (`ended_at = expires_at`) — started after the one just stopped,
    // so it is the one SCR-085 reports at the top.
    await db.query(
      `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, started_at, expires_at, ended_at)
       values ($1, $2, 'جلسة انتهت وحدها', now() - interval '100 milliseconds', now() - interval '50 milliseconds', now() - interval '50 milliseconds')`,
      [b.id, platformUserId],
    );
    await page.goto("/ar/app/platform/impersonate");
    // Scoped to `#main`: sync 2 found a second copy of this line outside it (DEC-145).
    await expect(main(page).getByText(/تلقائيًا عند/)).toBeVisible();
    await review(page, "wave8-platform-impersonate-expired");
  });
});
