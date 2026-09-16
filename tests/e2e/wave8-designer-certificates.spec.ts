// SCR-045 on the M9 system — wave 8, D4 (DEC-128, DEC-148), against REAL
// local Supabase. REQ-CRT-001, REQ-CRT-004, REQ-CRT-011, REQ-DSG-031,
// REQ-UIX-013.
//
// What only a real browser against a real database shows:
//
//   · a design saved before completion lands in `session_certificate_designs`
//     with its scheme, and the database locks it once a certificate of that
//     kind has reached a member — the panel says «ثابت», not a control that
//     is refused on save;
//   · «طبّق على المحجوزة» re-pins the held certificates' scheme and nothing
//     else — the serials stay;
//   · release confirms with the count and the session and lands for the rows
//     ticked, and only those;
//   · revocation takes its reason INSIDE the confirm, refuses a blank one at
//     the field (`noValidate`), and the revoked row shows the reason while the
//     eligible list names the member whose check-in is still there;
//   · the serial line is an estimate read from the org's own serials;
//   · a moderator sees the design and the list and no certificate; a member
//     reaches nothing (DEC-134).
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as
// `wave8-designer-certificates-<state>.png`, phone project, 390 × 844.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1000 };

const SARA = "سارة بنت عبدالله العتيبي";
// The preflight measures the longest name on the list; this is it.
const LONG = "عبدالرحمن بن محمد بن عبدالعزيز بن سليمان آل الشيخ الحربي";
const KHALID = "خالد الزهراني";
const REVIEW_TITLE = "ورشة الخط العربي";
const AUTO_TITLE = "لقاء تصميم الخطوط";
const FUTURE_TITLE = "جلسة التصميم القادمة";
const OFF_TITLE = "جلسة بلا شهادات";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
const userIds: string[] = [];
const emails = { admin: "", mod: "", sara: "", long: "", khalid: "" };
const members: Record<keyof typeof emails, string> = { admin: "", mod: "", sara: "", long: "", khalid: "" };
const sessions = { review: "", automatic: "", future: "", off: "" };

async function signedInClient(email: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  // The org claims arrive with the token minted AFTER provisioning.
  await client.auth.refreshSession();
  return { client, memberId: (data as { member_id: string }).member_id };
}

let hours = 0;
async function newSession(title: string, state: "completed" | "published", mode: "review" | "automatic" | "off"): Promise<string> {
  // ★ Each completed session gets its own hours: `check_ins` refuses a second
  // check-in for the same member in an overlapping window (DEC-015).
  const offset = `${3 + 4 * hours++} hours`;
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, $2) returning id`, [orgId, `تصنيف ${hours}`]);
  const completed = state === "completed";
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, certificate_mode, published_at, completed_at)
     values ($1, $2, 'نبذة عن الجلسة.', $3, 'introductory', 'ar',
             now() ${completed ? "-" : "+"} $5::interval, 60, now() ${completed ? "-" : "+"} $5::interval + interval '1 hour',
             'Asia/Riyadh', 30, 'القاعة', $4, $6, now() - interval '1 day', ${completed ? "now() - interval '2 hours'" : "null"})
     returning id`,
    [orgId, title, cat[0].id, state, offset, mode],
  );
  return rows[0].id;
}

async function checkIn(sessionId: string, memberId: string) {
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, memberId, members.admin],
  );
}

async function issue(sessionId: string, memberId: string) {
  const { rows } = await db.query<{ id: string; serial: string }>(
    `select id, serial from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`,
    [sessionId, memberId],
  );
  return rows[0]!;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `crt-${tag}.example`;
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) emails[key] = `${key}@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الشهادات', $1, 'CE', gen_random_uuid(), $2) returning id`,
    [`crt-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const names: Record<keyof typeof emails, string> = { admin: "مشرفة الشهادات", mod: "مشرف المحتوى", sara: SARA, long: LONG, khalid: KHALID };
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emails[key],
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: names[key] },
    });
    if (error) throw error;
    userIds.push(data.user.id);
    members[key] = (await signedInClient(emails[key])).memberId;
    await db.query(`update public.members set display_name = $2 where id = $1`, [members[key], names[key]]);
  }
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [members.mod]);

  // review, completed: three held certificates.
  sessions.review = await newSession(REVIEW_TITLE, "completed", "review");
  for (const m of [members.sara, members.long, members.khalid]) {
    await checkIn(sessions.review, m);
    await issue(sessions.review, m);
  }

  // automatic, completed: one issued, one revoked by the admin's own RPC —
  // the revoked member's check-in stays, which is the gap the list names.
  sessions.automatic = await newSession(AUTO_TITLE, "completed", "automatic");
  await checkIn(sessions.automatic, members.sara);
  await checkIn(sessions.automatic, members.long);
  await issue(sessions.automatic, members.sara);
  const revoked = await issue(sessions.automatic, members.long);
  const { client } = await signedInClient(emails.admin);
  const { error } = await client.rpc("revoke_certificate", { p_certificate: revoked.id, p_reason: "صدرت باسم غير مكتمل" });
  if (error) throw error;

  // published, review: nothing issued yet, one accepted presenter.
  sessions.future = await newSession(FUTURE_TITLE, "published", "review");
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [
    orgId,
    sessions.future,
    members.khalid,
  ]);

  sessions.off = await newSession(OFF_TITLE, "published", "off");
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";
const screen = (id: string) => `/ar/app/admin/sessions/${id}/certificates`;

async function capture(p: Page, name: string, { fullPage = true } = {}) {
  expect(p.viewportSize()).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  if (fullPage) {
    // The previews draw once near the viewport; scroll through first.
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
  }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${SHOTS}/wave8-designer-certificates-${name}.png`, fullPage });
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(1);
}

/** One kind's design panel — by its own labelled section, not «a section
 *  containing the heading», which the design section around both also is. */
const designPanel = (page: Page, kind: "attendance" | "presenter") => page.locator(`section[aria-labelledby="design-${kind}"]`);

/* ── access ─────────────────────────────────────────────────────────────── */

test("a member reaches nothing here — the gated not-found (DEC-134)", async ({ context, page }) => {
  await signIn(context, emails.sara);
  await page.goto(screen(sessions.review));
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

/* ── the design ─────────────────────────────────────────────────────────── */

test("★ DEC-148: a design chosen before completion is saved with its scheme, and the serial line is an estimate", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(screen(sessions.future));
  await expect(page.getByRole("heading", { name: "شهادات الجلسة", level: 1 })).toBeVisible();
  await expect(page.getByText("الوضع مراجعة", { exact: false })).toBeVisible();

  const panel = designPanel(page, "attendance");
  await expect(panel.getByText("لم يُحفظ", { exact: true })).toBeVisible();
  await panel.getByRole("radio", { name: "شهادة حضور عمودية" }).check();
  await panel.getByRole("radio", { name: "داكنة" }).check();
  await panel.getByRole("button", { name: "احفظ التصميم" }).click();
  await expect(page.getByText("حُفظ التصميم.", { exact: true })).toBeVisible();
  await expect(panel.getByText("لم يُحفظ", { exact: true })).toHaveCount(0);

  const { rows } = await db.query<{ name: string; scheme: string }>(
    `select t.name, d.scheme from public.session_certificate_designs d join public.design_templates t on t.id = d.template_id
      where d.session_id = $1 and d.kind = 'attendance'`,
    [sessions.future],
  );
  expect(rows).toEqual([{ name: "شهادة حضور عمودية", scheme: "dark" }]);

  // The preflight runs, against the longest name the list has.
  await expect(designPanel(page, "presenter").getByRole("heading", { name: "فحص قبل الإصدار", level: 4 })).toBeVisible();
  await expect(designPanel(page, "presenter").getByText(KHALID)).toBeVisible();

  // The estimate is this org's highest serial this year, plus one — read, not held.
  const { rows: last } = await db.query<{ serial: string }>(`select serial from public.certificates where org_id = $1 order by serial desc limit 1`, [orgId]);
  const [prefix, year, n] = last[0]!.serial.split("-");
  const expected = `${prefix}-${year}-${String(Number(n) + 1).padStart(6, "0")}`;
  await expect(page.getByText(expected)).toBeVisible();
  await expect(page.getByText("تقدير لا حجز", { exact: false })).toBeVisible();
});

test("★ held certificates take the saved design, release confirms by count and session, and the design locks", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(screen(sessions.review));

  const panel = designPanel(page, "attendance");
  await panel.getByRole("radio", { name: "داكنة" }).check();
  await panel.getByRole("button", { name: "احفظ التصميم" }).click();
  await expect(page.getByText("حُفظ التصميم.", { exact: true })).toBeVisible();

  const { rows: before } = await db.query<{ serial: string }>(`select serial from public.certificates where session_id = $1 order by serial`, [
    sessions.review,
  ]);
  await panel.getByRole("button", { name: "طبّق على المحجوزة" }).click();
  const apply = page.getByRole("dialog");
  await expect(apply).toContainText("تطبيق التصميم على 3 شهادات محجوزة؟");
  await apply.getByRole("button", { name: "طبّق", exact: true }).click();
  await expect(page.getByText("أُعيد تصميم 3 شهادات", { exact: true })).toBeVisible();
  const { rows: after } = await db.query<{ serial: string; scheme: string }>(
    `select serial, scheme from public.certificates where session_id = $1 order by serial`,
    [sessions.review],
  );
  expect(after.map((r) => r.scheme)).toEqual(["dark", "dark", "dark"]);
  expect(after.map((r) => r.serial)).toEqual(before.map((r) => r.serial));

  await page.getByRole("checkbox", { name: `تحديد الصف ${SARA}` }).check();
  await page.getByRole("checkbox", { name: `تحديد الصف ${KHALID}` }).check();
  await page.getByRole("button", { name: "أطلِق المحدَّدة" }).click();
  const release = page.getByRole("dialog");
  await expect(release).toContainText("إطلاق شهادتين؟");
  await expect(release).toContainText(REVIEW_TITLE);
  await release.getByRole("button", { name: "أطلِق", exact: true }).click();
  await expect(page.getByText("أُطلقت شهادتان", { exact: true })).toBeVisible();

  const { rows: states } = await db.query<{ member_id: string; state: string }>(`select member_id, state from public.certificates where session_id = $1`, [
    sessions.review,
  ]);
  const stateOf = (id: string) => states.find((s) => s.member_id === id)?.state;
  expect([stateOf(members.sara), stateOf(members.khalid), stateOf(members.long)]).toEqual(["issued", "issued", "held"]);

  // A certificate of this kind reached a member: the design is fixed.
  await expect(panel.getByText("ثابت", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "احفظ التصميم" })).toHaveCount(0);
});

test("★ REQ-CRT-011: revocation takes its reason inside the confirm, refuses a blank one at the field, and the list names who is still checked in", async ({
  context,
  page,
}) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(screen(sessions.review));

  const issued = page.getByRole("table", { name: "الشهادات الصادرة" });
  await issued
    .getByRole("row", { name: new RegExp(KHALID) })
    .getByRole("button", { name: "ألغِ" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(KHALID);
  await expect(dialog).toContainText(REVIEW_TITLE);

  await dialog.getByRole("button", { name: "ألغِ الشهادة" }).click();
  await expect(dialog.getByText("اكتب سبب الإلغاء، ثلاثة أحرف على الأقل.")).toBeVisible();

  const reason = "صدرت لحضور لم يكتمل";
  await dialog.getByLabel(/سبب الإلغاء/).fill(reason);
  await dialog.getByRole("button", { name: "ألغِ الشهادة" }).click();
  await expect(page.getByText("أُلغيت الشهادة.", { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("table", { name: "الشهادات الملغاة" }).getByRole("row", { name: new RegExp(KHALID) })).toContainText(reason);
  await expect(page.getByRole("table", { name: "المستحقّون" }).getByRole("row", { name: new RegExp(KHALID) })).toContainText("شهادته ملغاة");
});

/* ── the moderator ──────────────────────────────────────────────────────── */

test("a moderator sees the design and who is eligible, and no certificate and no control", async ({ context, page }) => {
  await signIn(context, emails.mod);
  if (onPhone()) await page.setViewportSize(PHONE);
  await page.goto(screen(sessions.review));
  await expect(page.getByRole("heading", { name: "شهادات الجلسة", level: 1 })).toBeVisible();
  await expect(page.getByText("من صلاحيات مشرف المؤسسة", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "احفظ التصميم" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "أطلِق المحدَّدة" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "الشهادات المحجوزة" })).toHaveCount(0);
  if (onPhone()) await capture(page, "moderator");
});

/* ── the captures, on the phone ─────────────────────────────────────────── */

test("390 px: held, the release confirm, the design in both compositions, revoked, the revoke dialog, locked, off", async ({ context, page }) => {
  test.skip(!onPhone(), "captures are the phone project's");
  await signIn(context, emails.admin);
  await page.setViewportSize(PHONE);

  await page.goto(screen(sessions.review));
  await expect(page.getByRole("heading", { name: "الشهادات المحجوزة", level: 3 })).toBeVisible();
  await capture(page, "held");

  await page.getByRole("checkbox", { name: `تحديد الصف ${SARA}` }).check();
  await page.getByRole("checkbox", { name: `تحديد الصف ${LONG}` }).check();
  await page.getByRole("button", { name: "أطلِق المحدَّدة" }).click();
  await expect(page.getByRole("dialog")).toContainText("إطلاق شهادتين؟");
  await capture(page, "release-confirm", { fullPage: false });
  await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();

  await page.goto(screen(sessions.future));
  const attendance = designPanel(page, "attendance");
  await attendance.scrollIntoViewIfNeeded();
  await capture(page, "design-landscape");
  await attendance.getByRole("radio", { name: "شهادة حضور عمودية" }).check();
  await attendance.getByRole("figure").scrollIntoViewIfNeeded();
  await capture(page, "design-portrait", { fullPage: false });

  await page.goto(screen(sessions.automatic));
  await expect(page.getByRole("heading", { name: "الشهادات الملغاة", level: 3 })).toBeVisible();
  // `automatic` has nothing to hold, so no held table at all.
  await expect(page.getByRole("heading", { name: "الشهادات المحجوزة", level: 3 })).toHaveCount(0);
  await capture(page, "revoked");

  await designPanel(page, "attendance").scrollIntoViewIfNeeded();
  await expect(designPanel(page, "attendance").getByText("ثابت", { exact: true })).toBeVisible();
  await capture(page, "design-locked", { fullPage: false });

  await page.getByRole("button", { name: "ألغِ" }).first().click();
  await expect(page.getByRole("dialog")).toContainText(SARA);
  await capture(page, "revoke-dialog", { fullPage: false });
  await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();

  await page.goto(screen(sessions.off));
  // Twice, on purpose: under the title, and in place of two empty tables —
  // «none, ever» rather than «none yet».
  await expect(page.getByText("الوضع معطّل", { exact: false })).toHaveCount(2);
  await capture(page, "mode-off");
});
