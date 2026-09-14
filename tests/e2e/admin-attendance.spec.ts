// SCR-044 · /app/admin/sessions/[id]/attendance — against REAL local
// Supabase (REQ-CHK-008, REQ-CHK-012, REQ-RAT-005, REQ-ADM-020). Proves
// what the RLS suite cannot: the real page renders the summary counts and
// the per-member table, a moderator reaches this exact screen while the
// admin's `/app/admin/sessions` management UI stays admin-only, and the
// CSV export streams with the manual-mark flag intact.
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
let modEmail = "";
let attendeeEmail = "";
let waitlistedEmail = "";
let sessionId = "";
let attendeeMemberId = "";
let waitlistedMemberId = "";
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
  domain = `admin-attendance-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  attendeeEmail = `attendee@${domain}`;
  waitlistedEmail = `waitlisted@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الحضور', $1, 'AT', gen_random_uuid(), $2) returning id`,
    [`admin-attendance-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الحضور') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الحضور', 40) returning id`, [orgId]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الحضور"],
    [modEmail, "منظّم الحضور"],
    [attendeeEmail, "حاضر مسجَّل"],
    [waitlistedEmail, "بانتظار الحجز"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  attendeeMemberId = await provisionMemberId(attendeeEmail);
  waitlistedMemberId = await provisionMemberId(waitlistedEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  // In progress, so the manual-mark form is open (`mark_checked_in_manually`
  // only accepts `in_progress`, 0015).
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة قيد الحضور', 'ملخص الجلسة', $2, 'introductory', now() - interval '30 minutes', 60, now() + interval '30 minutes', $3, 30, 'in_progress', now() - interval '1 day')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;
  // Two separate inserts, not one multi-row VALUES: `rsvps`' own check
  // constraint ties `waitlist_position` to `status = 'waitlisted'` at
  // insert time, so a confirmed row and a waitlisted row need different
  // column sets, not a shared one with a mismatched second tuple.
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, attendeeMemberId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status, waitlist_position) values ($1, $2, $3, 'waitlisted', 1)`, [orgId, sessionId, waitlistedMemberId]);
  const { rows: codeRows } = await db.query<{ id: string }>(
    `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
     values ($1, $2, 'ACDEFG', now() - interval '20 minutes', now() + interval '20 minutes') returning id`,
    [orgId, sessionId],
  );
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, attendeeMemberId, codeRows[0].id],
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

test("a member cannot open the attendance report", async ({ context, page }) => {
  await signIn(context, attendeeEmail);
  const response = await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  expect(response!.status()).toBe(404);
});

test("REQ-ADM-020: a moderator reaches attendance through /admin/sessions, with no management controls anywhere on that page", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/sessions");
  await expect(page.getByText("جلسة قيد الحضور")).toBeVisible();
  // The admin-only pipeline/direct-create UI must not exist for a moderator.
  await expect(page.getByText("جاهزة للجدولة")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "أنشئ الجلسة" })).toHaveCount(0);

  await page.getByRole("link", { name: "تقرير الحضور" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/attendance$`));
  await expect(page.getByRole("heading", { name: /تقرير الحضور/ })).toBeVisible();
  // Export and per-rater ratings are admin-only, even on this shared screen.
  await expect(page.getByRole("link", { name: "صدِّر كملف CSV" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "التقييمات — لكل مُقيِّم" })).toHaveCount(0);
});

test("REQ-CHK-012: the summary counts and the per-member table are correct", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  const summary = page.locator("section", { has: page.getByRole("heading", { name: "ملخّص الحضور" }) });

  // One confirmed RSVP checked in via code, one waitlisted RSVP not yet
  // checked in — reserved 2, confirmed 1, checked in 1, no walk-ins, no
  // no-shows (the waitlisted one is not a no-show: it was never confirmed).
  const ddFor = (label: string) => summary.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
  await expect(ddFor("الحجوزات").first()).toHaveText("2");
  await expect(ddFor("الحجوزات المؤكَّدة")).toHaveText("1");
  await expect(ddFor("سجَّلوا حضورهم")).toHaveText("1");
  await expect(ddFor("حضور بلا حجز")).toHaveText("0");
  await expect(ddFor("لم يحضروا رغم الحجز")).toHaveText("0");
  await expect(ddFor("معدّل الحضور")).toHaveText("100٪");

  await expect(page.getByText("حاضر مسجَّل")).toBeVisible();
  await expect(page.getByText("بانتظار الحجز")).toBeVisible();
  await expect(page.getByText("رمز الحضور")).toBeVisible();
});

test("REQ-CHK-008: a manual mark records a check-in with the manual method, and a written reason is required", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);

  await page.getByLabel("العضو").selectOption({ label: "بانتظار الحجز" });
  await page.getByRole("button", { name: "سجّل حضوره" }).click();
  await expect(page.getByText("اكتب السبب أولًا")).toBeVisible();

  await page.getByLabel("السبب").fill("حضر ولم يُسجَّل رمزه");
  await page.getByRole("button", { name: "سجّل حضوره" }).click();
  await expect(page.getByText("تسجيل يدوي").first()).toBeVisible();

  const { rows } = await db.query<{ method: string; manual_reason: string }>(`select method, manual_reason from public.check_ins where session_id = $1 and member_id = $2`, [
    sessionId,
    waitlistedMemberId,
  ]);
  expect(rows[0]).toEqual({ method: "manual", manual_reason: "حضر ولم يُسجَّل رمزه" });
});

test("REQ-CHK-012/REQ-ADM-017: the CSV export streams with a BOM, Arabic headers and the manual-mark flag, and is audited", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  const csvResponse = await page.request.get(`/api/admin/exports/attendance/${sessionId}`);
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()["content-type"]).toContain("text/csv");
  const body = await csvResponse.body();
  expect(body[0]).toBe(0xef); // UTF-8 BOM, byte 1
  expect(body[1]).toBe(0xbb);
  expect(body[2]).toBe(0xbf);
  const text = body.toString("utf8");
  expect(text).toContain("الاسم");
  expect(text).toContain("علامة يدوية");
  // The member marked manually above carries the flag; the code-based one does not.
  const lines = text.trim().split("\r\n");
  const manualLine = lines.find((l) => l.includes("بانتظار الحجز"));
  const codeLine = lines.find((l) => l.includes("حاضر مسجَّل"));
  expect(manualLine).toContain(",نعم");
  expect(codeLine).toContain(",لا");

  const audit = await db.query(`select action, after from public.audit_log where action = 'export.created' and org_id = $1`, [orgId]);
  expect(audit.rowCount).toBe(1);
  expect((audit.rows[0] as { after: { export_type: string } }).after).toEqual({ export_type: "attendance" });
});

test("SCR-044 at 390 px RTL: the report reads down the page, never sideways, with the table in its own scroll container", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
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
  expect(overflow, "the page itself must not scroll sideways at 390 px").toEqual([]);
  await page.screenshot({ path: `.qa-shots/rtl/scr-044-attendance-390-rtl-${test.info().project.name}.png`, fullPage: true });
});

