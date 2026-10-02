// SCR-050/052 and SCR-051 — moderation, against REAL local Supabase (REQ-ADM-010, REQ-EVT-008, REQ-EVT-012,
// REQ-EVT-014, REQ-UIX-103, REQ-UIX-104, DEC-005). Rewritten in wave 22 with the two rebuilt screens (each changed
// case is a ledger line in STATUS.md): comment reports are decided on البلاغات, takedowns and photo reports on الصور —
// two chips, never one list — a member gets the streamed not-found on both, `/comments` redirects, a moderator can
// act on both, and a removal reverses the original points award.
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
let memberEmail = "";
let commentId = "";
let commentReportId = "";
let photoTakedownId = "";
let takenDownPhotoId = "";
let reportedPhotoId = "";
let photoReportId = "";
let uploaderMemberId = "";
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
  domain = `admin-mod-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الإشراف', $1, 'MD', gen_random_uuid(), $2) returning id`,
    [`admin-mod-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الإشراف') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الإشراف', 40) returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة الإشراف', 'ملخص الجلسة', $2, 'introductory', now() - interval '1 day', 60, now() - interval '23 hours', $3, 30, 'completed', now() - interval '2 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  const sessionId = sessRows[0].id;

  for (const [email, name] of [
    [adminEmail, "مشرفة الإشراف"],
    [modEmail, "منظّم الإشراف"],
    [memberEmail, "عضو الإشراف"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  uploaderMemberId = await provisionMemberId(memberEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  // A comment, reported and open.
  const { rows: commentRows } = await db.query<{ id: string }>(
    `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق مسيء يستحق المراجعة') returning id`,
    [orgId, sessionId, uploaderMemberId],
  );
  commentId = commentRows[0].id;
  const { rows: commentReportRows } = await db.query<{ id: string }>(
    `insert into public.reports (org_id, target, comment_id, reporter_id, reason) values ($1, 'comment', $2, $3, 'لغة مسيئة') returning id`,
    [orgId, commentId, uploaderMemberId],
  );
  commentReportId = commentReportRows[0].id;

  // A photo, its takedown already hiding it (open).
  const SHA = "0123456789abcdef".repeat(4);
  const { rows: photo1Rows } = await db.query<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 2048, $5, true) returning id`,
    [orgId, sessionId, uploaderMemberId, `${orgId}/sessions/${sessionId}/photos/takedown.jpg`, SHA],
  );
  takenDownPhotoId = photo1Rows[0].id;
  const { rows: takedownRows } = await db.query<{ id: string }>(
    `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
    [orgId, takenDownPhotoId, uploaderMemberId],
  );
  photoTakedownId = takedownRows[0].id;
  await db.query(`update public.photos set hidden_at = now(), hidden_reason = 'طلب إخفاء' where id = $1`, [takenDownPhotoId]);

  // A second photo, reported but never taken down — still visible.
  const { rows: photo2Rows } = await db.query<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 2048, $5, true) returning id`,
    [orgId, sessionId, uploaderMemberId, `${orgId}/sessions/${sessionId}/photos/reported.jpg`, SHA],
  );
  reportedPhotoId = photo2Rows[0].id;
  const { rows: photoReportRows } = await db.query<{ id: string }>(
    `insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'محتوى غير مناسب') returning id`,
    [orgId, reportedPhotoId, uploaderMemberId],
  );
  photoReportId = photoReportRows[0].id;
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

// ★ DEC-134: `app/loading.tsx` wraps every `/app` page in a Suspense boundary, so a gated page answers 200 with
// `noindex` and the not-found page. `page.goto()` bare, then the visible not-found heading is the wait (172bf22).
// ★ Wave 22: two queues, and `/comments` redirects to `/reports`, which then answers the member the same way.
test("a member gets the streamed not-found page on both moderation screens, and /comments redirects (DEC-134, DEC-230 §3)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  for (const path of ["comments", "photos", "reports"]) {
    await page.goto(`/ar/app/admin/moderation/${path}`);
    if (path === "comments") await expect(page).toHaveURL(/\/ar\/app\/admin\/moderation\/reports$/);
    await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 }), path).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
  }
});

test("REQ-ADM-020: a moderator reaches both screens, and DEC-005 keeps takedowns and photo reports in two lists", async ({ context, page }) => {
  await signIn(context, modEmail);
  const main = page.locator("#main");

  await goto(page, "/ar/app/admin/moderation/comments");
  await expect(page).toHaveURL(/\/ar\/app\/admin\/moderation\/reports$/);
  await expect(main.getByRole("heading", { name: "الإشراف — البلاغات", level: 1 })).toBeVisible();
  await expect(main.getByText(/تعليق مسيء يستحق المراجعة/).first()).toBeVisible();

  await goto(page, `/ar/app/admin/moderation/photos/${takenDownPhotoId}`);
  await expect(main.getByRole("heading", { name: "الإشراف — الصور", level: 1 })).toBeVisible();
  await expect(main.getByText("مخفية بانتظار المراجعة")).toBeVisible();
  await expect(main.getByText("طلب الإخفاء", { exact: true })).toBeVisible();

  await goto(page, `/ar/app/admin/moderation/photos/${reportedPhotoId}?kind=reports`);
  await expect(main.getByText("ظاهرة", { exact: true })).toBeVisible();
  await expect(main.getByText("محتوى غير مناسب")).toBeVisible();
  await expect(main.getByText("طلب الإخفاء", { exact: true })).toHaveCount(0);
});

// ★ Before anything below mutates (mode: "serial" runs in file order on every project).
test("SCR-050/052 and SCR-051 at 390 px RTL: each reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, modEmail);
  const dir = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;
  for (const [path, name] of [
    ["reports", "wave22-content-050-open-390"],
    ["photos", "wave22-content-051-queue-390"],
    [`photos/${takenDownPhotoId}`, "wave22-content-051-detail-390"],
  ] as const) {
    await goto(page, `/ar/app/admin/moderation/${path}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // Measured against the layout viewport, naming what escapes (TEAM.md §5; tests/e2e/notify-screens.spec.ts).
    const overflow = await page.evaluate(() => {
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
          if (cs.position === "fixed" || (n !== el && (cs.overflowX === "auto" || cs.overflowX === "scroll"))) {
            contained = true;
            break;
          }
        }
        if (contained) continue;
        offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
      }
      return offenders.slice(0, 6);
    });
    expect(overflow, `${path} must not scroll sideways at 390 px`).toEqual([]);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
});

test("REQ-EVT-014: removing a reported comment records the reason, closes the report and audits the removal", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/moderation/reports");
  const main = page.locator("#main");

  // `ui/dialog` portals onto `document.body`, outside `#main` — scoped to the dialog from here on.
  await main.getByRole("button", { name: /^أزل — تعليق مسيء/ }).click();
  const dialog = page.getByRole("dialog", { name: "إزالة تعليق من «جلسة الإشراف»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "أزل", exact: true }).click();
  await expect(dialog.getByText("اكتب السبب أولًا.")).toBeVisible();

  await dialog.getByLabel("السبب — يُسجَّل في سجل التدقيق").fill("لغة غير لائقة");
  await dialog.getByRole("button", { name: "أزل", exact: true }).click();
  await expect(main.getByText(/تعليق مسيء يستحق المراجعة/)).toHaveCount(0);

  const { rows: commentRows } = await db.query<{ deleted_at: string; removal_reason: string }>(`select deleted_at, removal_reason from public.comments where id = $1`, [commentId]);
  expect(commentRows[0].deleted_at).toBeTruthy();
  expect(commentRows[0].removal_reason).toBe("لغة غير لائقة");
  const reportRows = await db.query<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [commentReportId]);
  expect(reportRows.rows[0]).toEqual({ status: "resolved", resolution: "removed" });
  const audit = await db.query(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [commentId]);
  expect(audit.rowCount).toBe(1);

  // ★ «مغلقة» shows the outcome and who decided (REQ-ADM-010).
  await goto(page, "/ar/app/admin/moderation/reports?state=closed");
  await expect(main.getByText(/تعليق مسيء يستحق المراجعة/).first()).toBeVisible();
  await expect(main.getByText("أُزيل", { exact: true }).first()).toBeVisible();
  await expect(main.getByText("مشرفة الإشراف").first()).toBeVisible();
});

test("REQ-EVT-012: restoring a takedown clears the hide and resolves the request, in one write", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await goto(page, `/ar/app/admin/moderation/photos/${takenDownPhotoId}`);
  await page.locator("#main").getByRole("button", { name: "أعدها للعرض" }).click();
  await expect(page.locator("#main").getByText("ظاهرة", { exact: true })).toBeVisible();

  const photoRows = await db.query<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [takenDownPhotoId]);
  expect(photoRows.rows[0].hidden_at).toBeNull();
  const takedownRows = await db.query<{ resolution: string }>(`select resolution from public.photo_takedowns where id = $1`, [photoTakedownId]);
  expect(takedownRows.rows[0].resolution).toBe("restored");
});

test("REQ-PTS-013: removing a reported photo reverses its original points award and resolves the report", async ({ context, page }) => {
  const { rows: photoRow } = await db.query<{ session_id: string }>(`select session_id from public.photos where id = $1`, [reportedPhotoId]);
  await db.query(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
     values ($1, $2, 3, 'photo', $3, $4, 'صورة من الجلسة', 'photo', $5)`,
    [orgId, uploaderMemberId, reportedPhotoId, photoRow[0].session_id, `e2e-photo-award-${reportedPhotoId}`],
  );

  await signIn(context, adminEmail);
  await goto(page, `/ar/app/admin/moderation/photos/${reportedPhotoId}?kind=reports`);
  await page.locator("#main").getByRole("button", { name: "احذف نهائيًا" }).click();
  const dialog = page.getByRole("dialog", { name: "حذف صورة من «جلسة الإشراف»؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("السبب — يُسجَّل في سجل التدقيق").fill("مخالفة صريحة");
  await dialog.getByRole("button", { name: "احذف", exact: true }).click();
  await expect(page.locator("#main").getByText("محذوفة", { exact: true })).toBeVisible();

  const photoRows = await db.query<{ removed_at: string | null }>(`select removed_at from public.photos where id = $1`, [reportedPhotoId]);
  expect(photoRows.rows[0].removed_at).toBeTruthy();
  const reportRows = await db.query<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [photoReportId]);
  expect(reportRows.rows[0]).toEqual({ status: "resolved", resolution: "removed" });
  const reversal = await db.query<{ amount: number }>(
    `select amount from public.points_ledger where source = 'reversal' and source_id in (select id from public.points_ledger where source = 'photo' and source_id = $1)`,
    [reportedPhotoId],
  );
  expect(reversal.rows).toEqual([{ amount: -3 }]);
});
