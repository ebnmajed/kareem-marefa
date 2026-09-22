// SCR-043 · a session's presenters, changed after it exists — `REQ-SES-019`,
// DEC-172, DEC-174.
//
// What this proves against the real page, which no unit test can:
//   · the section sits beside the schedule on SCR-043 and does not scroll the
//     page sideways at 390 px;
//   · the one accepted presenter is never offered for removal, and the page
//     says why;
//   · adding through the member picker assigns at once — the row appears, the
//     status line names them, and the database holds an ACCEPTED row;
//   · removing ASKS, naming the person, and is a DELETE — no `declined_at`;
//   · on a completed session the page says a change moves points, and a
//     member who checked in is refused AT THE FIELD with what to do first.
//
// Runs once sessions/0001 is promoted (the RPCs do not exist before it).
//
// Captures, phone project, 390 × 844:
//   wave12-sessions-schedule-presenters-one.png        one presenter, no «أزل»
//   wave12-sessions-schedule-presenters-added.png      two, and the status line
//   wave12-sessions-schedule-presenters-confirm.png    the confirm, naming her
//   wave12-sessions-schedule-presenters-refused.png    completed; checked-in refused at the field
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let draftId = "";
let completedId = "";
const ids: Record<"sara" | "khalid" | "nora", string> = { sara: "", khalid: "", nora: "" };
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one walk, on the touch project the captures come from");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave12-presenters-${tag}.example`;
  adminEmail = `boss@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المقدّمين', $1, 'PR', gen_random_uuid(), $2) returning id`,
    [`wave12-presenters-${tag}`, adminEmail],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'التخطيط') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ', 40) returning id`,
    [orgId],
  );

  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف المؤسسة" } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const adminMember = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminMember]);

  for (const [key, name] of [["sara", "سارة العتيبي"], ["khalid", "خالد الشهري"], ["nora", "نورة القحطاني"]] as const) {
    const email = `${key}@${domain}`;
    const user = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (user.error) throw user.error;
    userIds.push(user.data.user.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name) values ($1, $2, $3, $4) returning id`,
      [orgId, user.data.user.id, email, name],
    );
    ids[key] = rows[0].id;
  }

  // A draft with one presenter — the ordinary case.
  const { rows: draft } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level)
     values ($1, 'كيف نخطط لربع السنة', 'جلسة عملية في التخطيط الربعي.', $2, 'introductory') returning id`,
    [orgId, cat[0].id],
  );
  draftId = draft[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, draftId, ids.sara]);

  // A completed session, two presenters, and Nora checked in as an attendee.
  const { rows: done } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at, completed_at)
     values ($1, 'مراجعة نتائج الربع الماضي', 'ما الذي نجح وما الذي لم ينجح.', $2, 'introductory',
             now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
             $3, 30, now() - interval '3 days', now() - interval '3 days', 'completed', now() - interval '5 days', now() - interval '1 day')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  completedId = done[0].id;
  for (const m of [ids.sara, ids.khalid]) {
    await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, completedId, m]);
  }
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'نسيت هاتفها', $4, 'empty'::tstzrange)`,
    [orgId, completedId, ids.nora, adminMember],
  );
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** The section, found from `#main` (DEC-145). */
const section = (page: Page) => page.locator("#main").locator('section[aria-labelledby="presenters"]');

/**
 * A full page from the top, for a state of the page; the viewport alone, for
 * an open dialog — a fixed layer in a full-page shot is drawn wherever the page
 * was scrolled to, and so are the sticky header and the rail's skip link,
 * which is what the first run's captures showed mid-page.
 */
async function capture(page: Page, name: string, { dialog = false } = {}) {
  expect(page.viewportSize()).toEqual(PHONE);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, `${name} scrolls sideways at 390 px`).toBe(false);
  if (!dialog) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      // `instant`: the page scrolls smoothly, and a smooth scroll is still
      // under way when the shot is taken — the tab bar lands mid-page.
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave12-sessions-schedule-presenters-${name}.png`), fullPage: !dialog });
}

async function open(page: Page, sessionId: string) {
  // The phone project's device is 412 × 839; the captures are 390 × 844
  // (timeline.spec.ts's pattern). Every case here runs on the phone project.
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(section(page).getByRole("heading", { level: 2, name: /المُقدِّمون/ })).toBeVisible();
}

const row = async (session: string, member: string) =>
  (await db.query<{ accepted: boolean; declined_at: string | null }>(`select accepted, declined_at from public.session_presenters where session_id = $1 and member_id = $2`, [session, member])).rows[0];

test("one presenter is never offered for removal; adding assigns at once", async ({ page, context }) => {
  await signIn(context);
  await open(page, draftId);
  const s = section(page);

  await expect(s.getByText("سارة العتيبي")).toBeVisible();
  await expect(s.getByRole("button", { name: /^أزل/ })).toHaveCount(0);
  await expect(s.getByText("للجلسة مُقدِّم واحد على الأقل دائمًا، فلا يُزال آخرهم.")).toBeVisible();
  await capture(page, "one");

  await s.getByRole("combobox", { name: /أضف مُقدِّمًا/ }).fill("خالد");
  await page.getByRole("option", { name: /خالد الشهري/ }).click();
  await s.getByRole("button", { name: "أضف", exact: true }).click();

  await expect(s.getByRole("status")).toHaveText("أُضيف خالد الشهري إلى المُقدِّمين.");
  await expect(s.getByRole("button", { name: "أزل سارة العتيبي من المُقدِّمين" })).toBeVisible();
  await expect(s.getByRole("button", { name: "أزل خالد الشهري من المُقدِّمين" })).toBeVisible();
  expect(await row(draftId, ids.khalid)).toEqual({ accepted: true, declined_at: null });

  const axe = await new AxeBuilder({ page }).include('#main section[aria-labelledby="presenters"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  await capture(page, "added");
});

test("removing asks, names her, and deletes — never a decline", async ({ page, context }) => {
  await signIn(context);
  await open(page, draftId);
  const s = section(page);

  await s.getByRole("button", { name: "أزل سارة العتيبي من المُقدِّمين" }).click();
  const dialog = page.getByRole("dialog", { name: "إزالة سارة العتيبي من مُقدِّمي الجلسة؟" });
  await expect(dialog).toContainText("لن يظهر اسمه بين مُقدِّمي هذه الجلسة.");
  await expect(dialog).not.toContainText("نقاط");
  await capture(page, "confirm", { dialog: true });

  await dialog.getByRole("button", { name: "أزل", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(s.getByText("سارة العتيبي")).toHaveCount(0);
  // Khalid is the one accepted presenter now: nothing to remove.
  await expect(s.getByRole("button", { name: /^أزل/ })).toHaveCount(0);
  expect(await row(draftId, ids.sara)).toBeUndefined();
  const { rows } = await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [draftId]);
  expect(rows[0].state).toBe("draft");
});

test("on a completed session: points are named, and a checked-in member is refused at the field", async ({ page, context }) => {
  await signIn(context);
  await open(page, completedId);
  const s = section(page);

  await expect(s.getByText("الجلسة مكتملة: من تضيفه تُحسب له نقاط التقديم، ومن تزيله تُسحب نقاطه بقيد معاكس.")).toBeVisible();

  await s.getByRole("combobox", { name: /أضف مُقدِّمًا/ }).fill("نورة");
  await page.getByRole("option", { name: /نورة القحطاني/ }).click();
  await s.getByRole("button", { name: "أضف", exact: true }).click();

  await expect(s.getByText("سجّل هذا العضو حضوره في الجلسة. أزل حضوره أولًا من صفحة الحضور، ثم أضفه مُقدِّمًا.")).toBeVisible();
  await expect(s.getByRole("combobox", { name: /أضف مُقدِّمًا/ })).toHaveAttribute("aria-invalid", "true");
  expect(await row(completedId, ids.nora)).toBeUndefined();
  await capture(page, "refused");

  await s.getByRole("button", { name: "أزل خالد الشهري من المُقدِّمين" }).click();
  await expect(page.getByRole("dialog")).toContainText("وتُسحب نقاط تقديمه بقيد معاكس.");
});
