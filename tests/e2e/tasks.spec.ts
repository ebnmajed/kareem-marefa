// The Tasks slot against REAL local Supabase (STORY-TSK-001/002).
// session_tasks/task_completions/task_form_responses need no worker at all
// (REQ-TSK-002: reminder-only, nothing async here) — every assertion below
// exercises the real RLS-gated tables through the real app.
//
// Same shape as tests/e2e/materials.spec.ts / photos.spec.ts.
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
let orgId = "";
let domain = "";
let sessionId = "";
let checklistTaskId = "";
let presenterEmail = "";
let memberEmail = "";
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
  domain = `tasks-e2e-${tag}.example`;
  presenterEmail = `presenter@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المهام', $1, 'TK', gen_random_uuid()) returning id`,
    [`tasks-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة اختبار المهام', 'ملخص الجلسة', $2, 'introductory', now() + interval '2 days', 60, now() + interval '2 days' + interval '1 hour',
             $3, 30, now() + interval '1 day', now() + interval '1 day', 'published', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [presenterEmail, "مقدّم الاختبار"],
    [memberEmail, "عضو الاختبار"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const presenterMemberId = await provisionMemberId(presenterEmail);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterMemberId]);

  // ★ Wave-7 plan §4 item 3, ruled and now applied: `checkin`'s own
  // AFFORDANCE_MATRIX withholds `tasks` for a viewer with no stake in the
  // session (DEC-090 — "calendar/tasks withheld — no seat yet"), and this
  // fixture never gave `memberEmail` a reservation before the test below
  // asserted the tasks section was visible to them. The product is right;
  // the spec was wrong. A confirmed RSVP, the same shape `fixture-m2.ts`
  // seeds for every org's own "member" role, is what the test was missing.
  const memberMemberId = await provisionMemberId(memberEmail);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, memberMemberId]);

  const { rows: taskRows } = await db.query<{ id: string }>(
    `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'أحضر جهازك المحمول') returning id`,
    [orgId, sessionId],
  );
  checklistTaskId = taskRows[0].id;
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

test("★ REQ-TSK-004: a member marks a checklist task done, and it persists across a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "مهام ما قبل الجلسة", exact: true, level: 2 })).toBeVisible();
  // Scoped to #tasks INSIDE #main, not just #tasks: `getByRole` above is
  // naturally immune (an orphaned, `hidden` streaming-SSR template segment
  // — see the REQ-TSK-001/002 test's own note below — is excluded from the
  // accessibility tree entirely), but `getByText` matches on raw DOM text
  // regardless of `hidden`, and `#tasks` alone matches BOTH the real
  // section and the orphaned copy's own duplicate id. `#main` (the routed
  // page's own landmark) never contains the orphaned copy, which sits
  // directly under `body`.
  const tasksSection = page.locator("#main").locator("#tasks");
  await expect(tasksSection.getByText("أحضر جهازك المحمول")).toBeVisible();

  await tasksSection.getByRole("button", { name: "أنجزتها" }).click();
  await expect(tasksSection.getByRole("button", { name: "التراجع عن الإنجاز" })).toBeVisible();
  await review(page, "tasks-event-page");

  await page.reload();
  await expect(page.getByRole("button", { name: "التراجع عن الإنجاز" })).toBeVisible();

  const { rows } = await db.query(`select 1 from public.task_completions where task_id = $1`, [checklistTaskId]);
  expect(rows.length).toBe(1);
});

test("★ REQ-TSK-001/002: the presenter adds an external task through the inline form; it is a reminder only — check-in path never consults it", async ({ context, page }) => {
  await signIn(context, presenterEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);

  // ★ Desktop-only strict-mode find: `getByLabel('نوع المهمة')` resolved to
  // 2 elements. Traced the actual DOM (a debug dump of every <select>'s
  // ancestor chain, run once and discarded) rather than guessing between
  // the lead's two candidates — it was neither. The real, live "تسجيل مهمة
  // جديدة" form sits under `main#main > article > …`; the second match sits
  // directly under `body > div#S:e`, outside `#main` entirely, with the
  // SAME `id="tasks"`/`id="tasks-create-form"` and the same field labels —
  // an orphaned, `hidden` React streaming-SSR template segment (the same
  // `$S:`/`$RC` mechanism the no-JS finding traced) that the reveal script
  // leaves behind instead of removing, on this route at desktop width.
  // Materials' own upload form shows the identical duplicate — a page-wide
  // artefact, not something in this component. Scoping to `#main` (the
  // established idiom for excluding shell/duplicate content in this file)
  // excludes the orphaned copy everywhere at once, since it never renders
  // inside `#main` in the first place.
  const main = page.locator("#main");
  await main.getByLabel("نوع المهمة").selectOption("external");
  await main.getByLabel("عنوان المهمة").fill("ثبّت التطبيق قبل الحضور");
  await main.getByLabel("الرابط").fill("https://example.com/app");
  // exact: true — photos.spec.ts's own UploadWidget submit button
  // ("إضافة صورة") shares the same event page and would otherwise match too.
  await main.getByRole("button", { name: "إضافة", exact: true }).click();

  await expect(main.getByText("ثبّت التطبيق قبل الحضور")).toBeVisible();
  await expect(main.getByRole("link", { name: "فتح الرابط — يغادر المنصة" })).toHaveAttribute("href", "https://example.com/app");

  // REQ-TSK-002, made structural: no scoring catalogue entry names a task
  // action, and no check-in RPC reads task_completions at all — proven at
  // the RLS/schema level already; this just confirms the new task exists
  // and completion is still purely self-declared, never a gate.
  const { rows } = await db.query<{ kind: string }>(`select kind from public.session_tasks where session_id = $1 and title = $2`, [sessionId, "ثبّت التطبيق قبل الحضور"]);
  expect(rows[0].kind).toBe("external");
});
