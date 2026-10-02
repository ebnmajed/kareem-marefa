// SCR-044 · /app/admin/sessions/[id]/attendance — against REAL local
// Supabase (REQ-CHK-008, REQ-CHK-012, REQ-RAT-005, REQ-ADM-020). Proves
// what the RLS suite cannot: the real page renders the summary counts and
// the per-member table, a moderator reaches this exact screen while the
// admin's `/app/admin/sessions` management UI stays admin-only, and the
// CSV export streams with the manual-mark flag intact.
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
// `E2E_SHOTS_DIR` lets a look-only run against a dev server keep its
// pictures out of the directory the review reads (`event-page.spec.ts`'s
// own convention, `wave7-content-me.spec.ts`'s own precedent for this
// exact helper shape). A verification worktree sets this to the MAIN
// checkout's `.qa-shots/rtl`, so a sync build's captures land where
// STATUS.md's row cites them, not inside the worktree that produced them.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

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

// ★ DEC-134: `app/loading.tsx` puts every `/app` page inside a Suspense
// boundary, so the status is committed before the gate runs, and a gated
// page's `notFound()` streams 200 with `noindex` and the not-found page —
// not a real 404 status. What the gate protects is the content, so that is
// what is asserted: the not-found page is the only `h1`, and nothing the
// page guards rendered (the pattern `dd03094` set for branding/exports/
// designer/platform).
// ★ Wave 21 (SCR-044 rebuilt, DEC-208): a row is a `<tr>` from `md` up and a card `<li>` below it — `data-table`
// draws both and CSS hides one, so the accessibility tree holds exactly one of the two at any width.
const main = (page: Page) => page.locator("#main");
const rowOf = (page: Page, name: string) => main(page).getByRole("row", { name: new RegExp(name) }).or(main(page).getByRole("listitem").filter({ hasText: name }));
/** A figure's value — the `stat` whose label reads exactly `label`. */
const figure = (page: Page, label: string) => main(page).locator("span", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::strong[1]");

async function expectGatedNotFound(page: Page) {
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

test("a member cannot open the attendance report", async ({ context, page }) => {
  await signIn(context, attendeeEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expectGatedNotFound(page);
});

test("REQ-ADM-020: a moderator reaches attendance through /admin/sessions, with no management controls anywhere on that page", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/sessions");
  // `DataTable` renders BOTH the desktop `<table>` and the phone `<ul>` card
  // list in the DOM at once (CSS hides one per viewport), so a bare
  // `getByText` strict-mode-fails by matching both copies — the idiom
  // `admin-sessions.spec.ts` set: scope to whichever role is actually
  // present (Chromium excludes a `display:none` subtree from the
  // accessibility tree, so this resolves to exactly one match either way).
  const visibleRows = page.getByRole("table").or(page.getByRole("list"));
  await expect(visibleRows.getByText("جلسة قيد الحضور")).toBeVisible();
  // The admin-only pipeline/direct-create UI must not exist for a moderator.
  await expect(page.getByText("جاهزة للجدولة")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "أنشئ الجلسة" })).toHaveCount(0);

  await visibleRows.getByRole("link", { name: "جلسة قيد الحضور" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/attendance$`));
  // ★ Wave 21: the title is the hub header's `h1` (contract 4), no longer «تقرير الحضور — …» on the page.
  await expect(main(page).getByRole("heading", { level: 1 })).toContainText("جلسة قيد الحضور");
  // Export, revoke and per-rater ratings are admin-only, even on this shared screen.
  await expect(main(page).getByRole("link", { name: "CSV", exact: true })).toHaveCount(0);
  await expect(main(page).getByRole("heading", { name: "التقييمات — لكل مُقيِّم" })).toHaveCount(0);
  // A present row offers a moderator nothing (no revoke, nothing to mark), so it carries no menu at all.
  await expect(main(page).getByRole("button", { name: "إجراءات حاضر مسجَّل" })).toHaveCount(0);
});

test("REQ-CHK-012: the figures and the per-member table are correct", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);

  // One confirmed RSVP checked in via code, one waitlisted RSVP not yet checked in. ★ Wave 21 (D1): «محجوز» counts
  // CONFIRMED reservations — 1, where «الحجوزات» counted every RSVP row (2). The rate is DEC-228 §3.4's.
  await expect(figure(page, "محجوز")).toHaveText("1");
  await expect(figure(page, "حاضر")).toHaveText("1");
  await expect(figure(page, "المعدّل")).toHaveText("100٪");
  await expect(figure(page, "بلا حجز")).toHaveText("0");
  await expect(figure(page, "يدوي")).toHaveText("0");
  // No-showed lives on the chip: the waitlisted member is not a no-show — they were never confirmed.
  await expect(main(page).getByRole("link", { name: /لم يحضر/ })).toContainText("0");

  await expect(rowOf(page, "حاضر مسجَّل")).toContainText("رمز");
  await expect(rowOf(page, "حاضر مسجَّل")).toContainText("حاضر");
  await expect(rowOf(page, "بانتظار الحجز")).toContainText("قائمة انتظار");
});

test("REQ-CHK-008: a manual mark records a check-in with the manual method, and a written reason is required", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);

  // ★ Wave 21: «تسجيل يدوي» opens a sheet with the member combobox and the reason (`M11a.md` §5).
  await main(page).getByRole("button", { name: "تسجيل يدوي" }).click();
  const sheet = page.getByRole("dialog", { name: "تسجيل حضور يدوي" });
  await sheet.getByRole("combobox").fill("بانتظار");
  await page.getByRole("option", { name: "بانتظار الحجز" }).click();
  await sheet.getByRole("button", { name: "سجّل حضوره" }).click();
  await expect(sheet.getByText("اكتب السبب أولًا")).toBeVisible();

  await sheet.getByLabel("السبب", { exact: false }).fill("حضر ولم يُسجَّل رمزه");
  await sheet.getByRole("button", { name: "سجّل حضوره" }).click();
  await expect(sheet).toHaveCount(0);
  // ★ Wave 21: the method names who marked it — «يدوي · <name>», where it read «يدوي».
  await expect(rowOf(page, "بانتظار الحجز")).toContainText("يدوي · مشرفة الحضور");

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
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `scr-044-attendance-390-rtl-${test.info().project.name}.png`), fullPage: true });
});

// ★ REQ-CHK-017, C3 — last in the file: removes `attendeeMemberId`'s still-active code check-in from `beforeAll`, so no
// earlier test depends on it staying checked in. ★ Wave 21: the revoke is the row menu's «ألغِ الحضور», and its dialog
// carries the reason; the RPC — and so the reversal — is the same `remove_check_in()`.
test("REQ-CHK-017: an admin revokes a check-in from the row menu, and the table shows it revoked with its reason", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  const isPhone = test.info().project.name === "phone";
  await signIn(context, adminEmail);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  if (isPhone) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, "wave7-checkin-attendance-populated.png"), fullPage: true });
  }

  await main(page).getByRole("button", { name: "إجراءات حاضر مسجَّل" }).click();
  await page.getByRole("menuitem", { name: "ألغِ الحضور" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Names both the member AND the session (REQ-UIX-013).
  await expect(dialog).toContainText("حاضر مسجَّل");
  await expect(dialog).toContainText("جلسة قيد الحضور");
  await expect(dialog.getByRole("button", { name: "ألغِ تسجيل الحضور" })).toBeDisabled();
  await dialog.getByLabel("سبب الإلغاء", { exact: false }).fill("خطأ في تسجيل الحضور — سُجِّل حضور شخص آخر بالخطأ");
  if (isPhone) await page.screenshot({ path: join(SHOTS, "wave7-checkin-attendance-remove-dialog.png"), fullPage: true });

  await dialog.getByRole("button", { name: "ألغِ تسجيل الحضور" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The table shows the revocation with its reason — not a bare no-show.
  const row = rowOf(page, "حاضر مسجَّل");
  await expect(row).toContainText("أُلغي");
  await expect(row).toContainText("خطأ في تسجيل الحضور — سُجِّل حضور شخص آخر بالخطأ");
  if (isPhone) await page.screenshot({ path: join(SHOTS, "wave7-checkin-attendance-removed.png"), fullPage: true });

  const { rows: ciRows } = await db.query<{ removed_at: string | null; removal_reason: string | null }>(
    `select removed_at, removal_reason from public.check_ins where session_id = $1 and member_id = $2 and removed_at is not null`,
    [sessionId, attendeeMemberId],
  );
  expect(ciRows).toHaveLength(1);
  expect(ciRows[0].removal_reason).toBe("خطأ في تسجيل الحضور — سُجِّل حضور شخص آخر بالخطأ");

  const audit = await db.query(`select action from public.audit_log where action = 'check_in.removed' and org_id = $1`, [orgId]);
  expect(audit.rowCount).toBe(1);

  // Removed, not deleted: they are offered again for a manual mark.
  await main(page).getByRole("button", { name: "إجراءات حاضر مسجَّل" }).click();
  await expect(page.getByRole("menuitem", { name: "سجّل حضوره" })).toBeVisible();
});
