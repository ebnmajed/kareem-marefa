// SCR-040 · /app/admin — the org dashboard, against REAL local Supabase
// (REQ-ADM-004, D60). Proves the real aggregates (`src/lib/dal/
// admin-dashboard.ts` — no SQL added, every figure reads a table the
// admin's own RLS policy already lets them see) and that the figures this
// track can wire today actually click through to a real list (REQ-ADM-004's
// own acceptance criterion). Also proves the admin shell's staff gate: a
// member and a moderator both get a real 404 on this admin-only screen.
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
// Viewport captures with motion reduced: `globals.css` scrolls smoothly
// otherwise, and a capture after a scroll fires mid-animation (sync 2).
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
let mem1Email = "";
let mem2Email = "";
const userIds: string[] = [];
let presenterMemberId = "";

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
  domain = `admin-dash-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  mem1Email = `presenter@${domain}`;
  mem2Email = `attendee@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة اللوحة', $1, 'DB', gen_random_uuid(), $2) returning id`,
    [`admin-dash-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف اللوحة') returning id`, [orgId]);
  const categoryId = catRows[0].id;
  const { rows: companyRows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة اللوحة') returning id`, [orgId]);
  const companyId = companyRows[0].id;
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة اللوحة', 40) returning id`, [orgId]);
  const venueId = venueRows[0].id;

  for (const [email, name] of [
    [adminEmail, "مشرفة اللوحة"],
    [modEmail, "منظّم اللوحة"],
    [mem1Email, "المُقدِّم الأول"],
    [mem2Email, "الحاضر الثاني"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  presenterMemberId = await provisionMemberId(mem1Email);
  const attendeeMemberId = await provisionMemberId(mem2Email);
  const modMemberId = await provisionMemberId(modEmail);
  // `first_admin_email` already granted the admin role at provisioning
  // (DEC-035); the queue below only needs the other two.
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);
  await db.query(`update public.members set company_id = $1 where id = $2`, [companyId, presenterMemberId]);
  // A fifth, deactivated member — proves "active members" excludes them.
  const { data: deactivatedAuth, error: deactivatedErr } = await admin.auth.admin.createUser({
    email: `gone@${domain}`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو غادر" },
  });
  if (deactivatedErr) throw deactivatedErr;
  userIds.push(deactivatedAuth.user.id);
  const deactivatedMemberId = await provisionMemberId(`gone@${domain}`);
  await db.query(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'اختبار' where id = $1`, [deactivatedMemberId]);

  // Six proposals, one per pipeline state.
  const proposalRows: [string, string, string | null][] = [
    ["مقترح مسودة", "draft", null],
    ["مقترح بانتظار المراجعة", "submitted", null],
    ["مقترح قيد المراجعة", "in_review", null],
    ["مقترح بحاجة تعديل", "changes_requested", "يحتاج تفاصيل إضافية"],
    ["مقترح معتمد", "approved", null],
    ["مقترح مرفوض", "rejected", "مكرر مع جلسة سابقة"],
  ];
  for (const [title, state, reason] of proposalRows) {
    await db.query(
      `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state, decision_reason)
       values ($1, $2, $3, 'ملخص المقترح', $4, 'introductory', $5, $6)`,
      [orgId, presenterMemberId, title, categoryId, state, reason],
    );
  }

  // One completed session, an accepted presenter, two confirmed RSVPs, one
  // check-in — the attendance-rate denominator only counts started sessions,
  // and this one has (starts_at in the past).
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة انتهت للتو', 'ملخص الجلسة', $2, 'introductory', now() - interval '3 hours', 60, now() - interval '2 hours',
             $3, 30, 'completed', now() - interval '1 day', now() - interval '2 hours')
     returning id`,
    [orgId, categoryId, venueId],
  );
  const sessionId = sessRows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterMemberId]);
  await db.query(
    `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed'), ($1, $2, $4, 'confirmed')`,
    [orgId, sessionId, presenterMemberId, attendeeMemberId],
  );
  const { rows: codeRows } = await db.query<{ id: string }>(
    `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
     values ($1, $2, 'ACDEFG', now() - interval '3 hours', now() - interval '2 hours') returning id`,
    [orgId, sessionId],
  );
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window)
     values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, presenterMemberId, codeRows[0].id],
  );

  // Points issued sums only the positive side (10, not 10 - 5).
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
     values ($1, $2, 10, 'check_in', 'حضور الجلسة', $3), ($1, $2, -5, 'manual_adjustment', 'تصحيح', $4)`,
    [orgId, presenterMemberId, `dash-award-${tag}`, `dash-reversal-${tag}`],
  );
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

/**
 * Waits out React's streamed Suspense boundaries. While one streams, a
 * second copy of its content sits in `body > div#S:n[hidden]` for a few
 * hundred ms beside the copy already in `<main>` — the lead's own finding,
 * under a CPU throttle — and a strict locator counts it. Same helper as
 * `wave6-discussion-review.spec.ts`'s (sessions' file).
 */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

// ★ DEC-134: `app/loading.tsx` wraps every `/app` page in a Suspense
// boundary, so the response has begun streaming — status committed — before
// `requireSession()`'s gate runs. A gated page's `notFound()` therefore
// answers 200 with `noindex` and the not-found page, never a real 404
// status; the requirement is that no guarded data renders, which this
// checks directly instead of a status code.
async function expectGatedNotFound(page: Page) {
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  // ★ Not `.toHaveAttribute` on the bare selector: `/app`'s own layout meta
  // ("noindex, nofollow") plus the not-found boundary's own injected tag
  // both match `meta[name="robots"]`, three elements in a real build — the
  // content-based attribute selector plus `.first()` finds ANY of them
  // carrying `noindex`, which is all DEC-134 actually asks for.
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("heading", { name: "لوحة المؤسسة" })).toHaveCount(0);
}

// ★ A latent flake sessions' own diagnosis found (172bf22): `goto()`'s own
// zero-`div[hidden][id^="S:"]` wait can time out on a GATED route
// specifically — one Suspense boundary can flush before the page's own
// `notFound()` throws, so an empty hidden div stays in the body for good,
// not just transiently. `page.goto()` bare below, then
// `expectGatedNotFound()`'s own first assertion (the visible not-found
// heading) is the wait — it already auto-retries, and it is the real signal
// here, unlike the hidden-div count.
test("a member gets the streamed not-found page on the admin console, not the dashboard (DEC-134)", async ({ context, page }) => {
  await signIn(context, mem2Email);
  await page.goto("/ar/app/admin");
  await expectGatedNotFound(page);
});

test("REQ-ADM-020: a moderator gets the streamed not-found page on the (admin-only) dashboard (DEC-134)", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin");
  await expectGatedNotFound(page);
});

test("REQ-ADM-004: every figure is correct and the built ones click through", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin");
  await expect(page.getByRole("heading", { name: "لوحة المؤسسة", level: 1 })).toBeVisible();

  // «يحتاج انتباهك» — 2 proposals awaiting a decision (submitted + in_review
  // among the six seeded); nothing else in the seed produces an unscheduled
  // session or an open report, so those three rows read 0.
  const attention = page.locator("section", { has: page.getByRole("heading", { name: "يحتاج انتباهك" }) });
  await expect(attention.getByText("مقترحات بانتظار قرار")).toBeVisible();
  await expect(attention.getByRole("link", { name: "مقترحات بانتظار قرار" })).toHaveText(/2/);

  // Proposal pipeline — one of each state.
  const pipeline = page.locator("section", { has: page.getByRole("heading", { name: "مسار المقترحات" }) });
  await expect(pipeline.getByText("مسودة")).toBeVisible();
  for (const label of ["بانتظار المراجعة", "قيد المراجعة", "بانتظار تعديل", "معتمدة", "مرفوضة"]) {
    await expect(pipeline.getByText(label)).toBeVisible();
  }

  // Overview: attendance (2 confirmed RSVPs, 1 check-in, 50% rate), active
  // members and points issued are now each their own `Stat` tile — one
  // section, not one per figure the way the pre-wave-6 screen had it.
  const overview = page.locator("section", { has: page.getByRole("heading", { name: "نظرة عامة" }) });
  await expect(overview.getByText("حجوزات مؤكَّدة")).toBeVisible();
  await expect(overview.getByText("50٪")).toBeVisible();
  await expect(overview.getByText("الأعضاء النشطون")).toBeVisible();
  await expect(overview.getByRole("link", { name: "الأعضاء النشطون" })).toHaveText(/4/); // 4 of 5 seeded — one deactivated
  await expect(overview.getByText("النقاط الممنوحة")).toBeVisible();
  await expect(overview.getByRole("link", { name: "النقاط الممنوحة" })).toHaveText(/10/); // 10, not 5 — the -5 reversal does not net against it

  // Top presenters/categories/companies show the one row each seeded.
  await expect(page.getByText("المُقدِّم الأول")).toBeVisible();
  await expect(page.getByText("تصنيف اللوحة")).toBeVisible();
  await expect(page.getByText("شركة اللوحة")).toBeVisible();

  // Click-through: the attention row for proposals goes to the real review queue.
  await attention.getByRole("link", { name: "مقترحات بانتظار قرار" }).click();
  await expect(page.getByRole("heading", { name: "مراجعة المقترحات", level: 1 })).toBeVisible();
  await expect(page.getByText("مقترح بانتظار المراجعة")).toBeVisible();

  await page.goBack();
  await overview.getByRole("link", { name: "حجوزات مؤكَّدة" }).click();
  await expect(page.getByRole("heading", { name: "الجلسات", level: 1 })).toBeVisible();
  // ★ Three matches, not two: `DataTable`'s own desktop/phone dual render
  // (one hidden per viewport) PLUS a third, always-visible one — a
  // completed session still offers "archive", so its title repeats in
  // `sessions-table.tsx`'s controls panel below the table, which is neither
  // a `<table>` nor the card `<ul>`. Scoping to whichever of those two roles
  // is actually present excludes that third copy too.
  await expect(page.getByRole("table").or(page.getByRole("list")).getByText("جلسة انتهت للتو")).toBeVisible();

  await page.goBack();
  // The pipeline section's heading is no longer itself the link — a
  // separate «عرض القائمة» action carries the click-through now, and it is
  // disambiguated from the identically-worded actions on the two
  // top-categories/top-companies sections by its own accessible name.
  await pipeline.getByRole("link", { name: "عرض القائمة — مسار المقترحات" }).click();
  await expect(page.getByRole("heading", { name: "مراجعة المقترحات", level: 1 })).toBeVisible();

  await page.goBack();
  await page.getByRole("link", { name: "المُقدِّم الأول" }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${presenterMemberId}$`));
});

test("SCR-040 at 390 px RTL: the dashboard reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin");
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
  expect(overflow, "the dashboard must not scroll sideways at 390 px").toEqual([]);
  // `E2E_SHOTS_DIR` lets a run in the verification worktree land its
  // captures where the cited path actually points — a hard-coded
  // `.qa-shots/rtl/` was wave 7's own sync-3 finding.
  const dir = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
  await page.screenshot({ path: `${dir}/scr-040-admin-dashboard-390-rtl-${test.info().project.name}.png`, fullPage: true });
});

// Wave 8, F2: the three «أكثر …» cards set each count at the row's edge, as
// «مسار المقترحات» does. A viewport capture scrolled to the cards — a
// full-page one paints the fixed tab bar across them — and the measurement
// the capture is for: the count's inline-end edge meets the name's row edge.
test("F2 at 390 px: the «أكثر …» cards set the count at the edge, like the pipeline", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "أكثر المُقدِّمين مشاركة" }) });
  const row = section.locator("li").first();
  // Centred, so neither the sticky header nor the fixed tab bar covers the cards.
  await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const [rowBox, countBox] = await Promise.all([row.boundingBox(), row.locator("span").last().boundingBox()]);
  // RTL: the row's inline end is its LEFT edge.
  expect(Math.abs((countBox?.x ?? 0) - (rowBox?.x ?? 0))).toBeLessThanOrEqual(1);
  const dir = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
  await page.screenshot({ path: `${dir}/wave8-console-dashboard-top-lists.png` });
});
