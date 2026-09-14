// ★ THE M2 DEMONSTRABLE, and the 390 px RTL review, in one walk.
//
// Every step goes through a real screen against real local Supabase — no
// seeded rows, no SQL shortcuts except where the point IS the SQL (the clock).
// It crosses all three wave-1 tracks: the screens and transitions are
// `sessions`, the RSVP panel and check-in are `checkin`, the comments and the
// rating are `event`. If this passes, M2 works in a room.
//
//   add a venue → propose → approve → create the session → schedule → publish
//   → reserve a seat → the CLOCK starts the session → staff read the code
//   → check in with it → comment → the ADMIN completes → rate
//
// Both transition paths are exercised on purpose: the clock starts it
// (JOB-start_session, REQ-SES-004) and a person completes it (REQ-SES-005),
// so the audit trail shows one row with no actor and one with an admin.
//
// Screens captured: SCR-046 venues, SCR-018 my proposal, SCR-042 sessions,
// SCR-043 schedule and publish, SCR-012 the event page. SCR-017 and SCR-041
// have their own captures in sessions-propose and sessions-admin-proposals.
//
// Every capture is paired with the two things a screenshot review cannot
// judge: that the page does not scroll sideways at 390 px, and that its
// primary action is at least 44 px tall (REQ-SES-013, REQ-NFR-009).
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

// One org per worker, and the whole walk is one ordered story.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let memberEmail = "";
// A third account who presents nothing: SCR-012's "any member" view.
let attendeeEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-scr-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;
  attendeeEmail = `attendee@${domain}`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاختبار', $1, 'ES', gen_random_uuid(), $2) returning id`,
    [`e2e-scr-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  // rating_min_aggregate 1 so a presenter can see an aggregate built from the
  // single rating this walk produces; the default 3 exists to protect a real
  // presenter from a sample of one (REQ-RAT-004), not to make the walk lie.
  await db.query(`insert into public.org_settings (org_id, rating_min_aggregate) values ($1, 1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1,'فني'), ($1,'درس من تجربة')`, [orgId]);

  for (const [email, name] of [
    [adminEmail, "مشرفة المؤسسة"],
    [memberEmail, "عضو الاختبار"],
    [attendeeEmail, "حاضرة الاختبار"],
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

async function signIn(context: BrowserContext, who: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: who, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** A 390 px RTL page signed in as `who`. */
async function phone(page: Page, who: string): Promise<Page> {
  const context = await page.context().browser()!.newContext({ viewport: PHONE, locale: "ar-SA" });
  await signIn(context, who);
  return context.newPage();
}

/**
 * The half of a 390 px review a screenshot cannot do. `scrollWidth` past
 * `clientWidth` is the failure that makes an RTL page feel broken, and it is
 * invisible in a full-page capture because the capture widens to fit.
 *
 * Captures go to `.qa-shots/rtl/`, not `test-results/`: Playwright empties
 * `test-results/` at the start of every run, so in a shared tree another
 * teammate's run deletes your evidence between taking it and looking at it.
 * Both directories are gitignored.
 */
async function review(p: Page, name: string, primary?: string | RegExp) {
  // Namespaced by project: both device projects run this file concurrently
  // and would otherwise write the same path, last writer winning.
  //
  // They are not the same picture. Both lay out at 390 CSS pixels — the
  // assertion below proves it — but the phone project inherits Pixel 7's
  // 2.625 device pixel ratio, so its PNG is 1024 px wide. Measuring a
  // capture's pixel width is therefore NOT how you check the review width;
  // that is what `viewportSize()` is for.
  const project = test.info().project.name;
  // The review is worthless if it is not actually 390 px, and a wrong
  // viewport is invisible in the result: every assertion below passes more
  // easily at 1024, and the capture just looks like a wide page.
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(0);
  if (primary) {
    const box = (await p.getByRole("button", { name: primary }).first().boundingBox())!;
    expect(box.height, `${name}: the primary action must be at least 44 px tall`).toBeGreaterThanOrEqual(44);
  }
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("the M2 demonstrable, end to end, through the real screens at 390 px RTL", async ({ page }) => {
  test.slow(); // seven screens, three sign-ins, and the whole chain

  // ── SCR-046 · venues ──────────────────────────────────────────────────────
  const boss = await phone(page, adminEmail);
  await boss.goto("/ar/app/admin/venues");
  await expect(boss.getByRole("heading", { level: 1 })).toHaveText("الأماكن");
  await boss.getByLabel("الاسم").fill("قاعة الابتكار");
  await boss.getByLabel("العنوان").fill("الدور الثالث، مبنى الإدارة");
  await boss.getByLabel("السعة").fill("30");
  await boss.getByRole("button", { name: "أضف المكان" }).click();
  await expect(boss.getByText("قاعة الابتكار")).toBeVisible();
  // REQ-SES-006: there is no delete control at all, and the page says why.
  await expect(boss.getByRole("button", { name: /احذف/ })).toHaveCount(0);
  await expect(boss.getByText(/لا يمكن حذف مكان/)).toBeVisible();
  await review(boss, "scr-046-venues", "أضف المكان");

  // ── SCR-018 · my proposal ─────────────────────────────────────────────────
  const member = await phone(page, memberEmail);
  await member.goto("/ar/app/propose");
  const title = "كيف اختصرنا وقت إعداد التقارير إلى النصف";
  await member.getByLabel("عنوان الموضوع المقترح").fill(title);
  await member.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.");
  await member.getByLabel("تصنيف الموضوع").selectOption({ label: "درس من تجربة" });
  await member.getByLabel("المدة المتوقعة").fill("45");
  await member.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(member).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  await expect(member.getByRole("status")).toContainText("وصلنا مقترحك");
  await review(member, "scr-018-my-proposal");

  // ── SCR-041 → approve ─────────────────────────────────────────────────────
  await boss.goto("/ar/app/admin/proposals");
  await boss.getByRole("button", { name: "اعتمد المقترح" }).first().click();
  await expect(boss.getByRole("heading", { name: title })).toHaveCount(0);

  // ── SCR-042 · sessions ────────────────────────────────────────────────────
  await boss.goto("/ar/app/admin/sessions");
  await expect(boss.getByText(title)).toBeVisible(); // waiting under «جاهزة للجدولة»
  await review(boss, "scr-042-sessions", /أنشئ الجلسة/);
  // REQ-NFR-007: the card's control names its proposal, so it is not one of
  // two buttons on the page answering to the same accessible name.
  await expect(boss.getByRole("button", { name: `أنشئ الجلسة — ${title}` })).toHaveCount(1);
  await boss.getByRole("button", { name: `أنشئ الجلسة — ${title}` }).click();
  await expect(boss.getByText("لا مقترحات معتمدة تنتظر.")).toBeVisible();

  const { rows } = await db.query<{ id: string }>(`select id from public.sessions where org_id = $1`, [orgId]);
  expect(rows).toHaveLength(1);
  const sessionId = rows[0].id;

  // ── SCR-043 · schedule and publish ────────────────────────────────────────
  await boss.goto(`/ar/app/admin/sessions/${sessionId}/schedule`);
  // Incomplete first: REQ-SES-001's gate, naming what is missing.
  await expect(boss.getByText("لا يمكن النشر بعد — ينقص:")).toBeVisible();
  await expect(boss.getByRole("button", { name: "انشر الجلسة" })).toBeDisabled();
  await review(boss, "scr-043-schedule", "احفظ الجدولة");

  const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  // SCR-043's field is console's RTL date-time picker since wave 3 (DEC-045's
  // carried-over item): a trigger whose accessible name carries its value, a
  // day grid whose cells are labelled by full date, hour and minute selects.
  await boss.getByRole("button", { name: new RegExp("^التاريخ والوقت:") }).click();
  await boss.getByRole("button", { name: new RegExp(`^${when.getDate()} `) }).first().click();
  await boss.getByLabel("الساعة").selectOption("18");
  await boss.getByLabel("الدقيقة").selectOption("0");
  await boss.getByRole("button", { name: "تم" }).click();
  await boss.getByLabel("المدة").fill("60");
  await boss.getByLabel("المكان", { exact: true }).selectOption({ label: "قاعة الابتكار" });
  await boss.getByRole("button", { name: "احفظ الجدولة" }).click();
  await expect(boss.getByRole("status")).toContainText("حُفظت الجدولة");

  // The gate is satisfied now, so the control is live.
  await expect(boss.getByText("لا يمكن النشر بعد — ينقص:")).toHaveCount(0);
  await boss.getByRole("button", { name: "انشر الجلسة" }).click();
  await expect(boss.getByRole("status").filter({ hasText: "نُشرت الجلسة" })).toBeVisible();

  // 02 §6.2's chain, walked rather than jumped.
  const transitions = await db.query<{ from_state: string | null; to_state: string }>(
    `select from_state, to_state from public.session_state_transitions where session_id = $1 order by occurred_at, ctid`,
    [sessionId],
  );
  expect(transitions.rows.map((r) => `${r.from_state}→${r.to_state}`)).toEqual([
    "null→draft",
    "draft→submitted",
    "submitted→in_review",
    "in_review→approved",
    "approved→published",
  ]);

  // ── SCR-012 · the event page, as the PRESENTER ────────────────────────────
  // The proposer carried across as the session's presenter, so REQ-CHK-011's
  // split starts here: no RSVP panel for them, and «شاشة التقديم» instead.
  await member.goto(`/ar/app/sessions/${sessionId}`);
  await expect(member.getByRole("heading", { level: 1 })).toContainText(title);
  await expect(member.getByRole("link", { name: "شاشة التقديم" })).toBeVisible();
  await expect(member.getByRole("button", { name: /احجز مقعدك/ })).toHaveCount(0);

  // ── SCR-012 · the event page, as any member ───────────────────────────────
  const attendee = await phone(page, attendeeEmail);
  await attendee.goto(`/ar/app/sessions/${sessionId}`);
  await expect(attendee.getByRole("heading", { level: 1 })).toContainText(title);
  await expect(attendee.getByText("قاعة الابتكار")).toBeVisible();
  // REQ-SES-008: no remote-attendance affordance anywhere on the page.
  await expect(attendee.getByText(/بث مباشر|رابط الانضمام|عن بعد|أونلاين/)).toHaveCount(0);
  await expect(attendee.getByText("الحضور في القاعة فقط.")).toBeVisible();
  // Not a presenter, so no host-view entry (OQ-013, REQ-CHK-014).
  await expect(attendee.getByRole("link", { name: "شاشة التقديم" })).toHaveCount(0);

  // REQ-SES-011: the spoken language is above the RSVP action, not below it.
  const language = (await attendee.getByText("لغة الجلسة").first().boundingBox())!;
  const action = (await attendee.locator("aside").first().boundingBox())!;
  expect(language.y, "the spoken language appears before the RSVP action").toBeLessThan(action.y);

  // REQ-SES-013: exactly one primary action, in the thumb zone, ≥ 44 px. The
  // control is `checkin`'s; its presence and its size are this page's promise.
  const rsvp = attendee.getByRole("button", { name: /احجز مقعدك|انضم لقائمة الانتظار|ألغِ حجزي/ });
  await expect(rsvp).toHaveCount(1);
  const rsvpBox = (await rsvp.boundingBox())!;
  expect(rsvpBox.height, "the RSVP action must be at least 44 px tall").toBeGreaterThanOrEqual(44);
  expect(rsvpBox.y + rsvpBox.height, "the RSVP action sits within the first screenful at 390 px").toBeLessThanOrEqual(PHONE.height);
  // …and nothing above it is hidden underneath it, which is what a
  // bottom-pinned panel of this height would do to «لغة الجلسة».
  expect(language.y + language.height, "the spoken language is not covered by the action panel").toBeLessThanOrEqual(action.y);

  await review(attendee, "scr-012-event-page");

  // Before completion the rating section is absent entirely — the slot renders
  // nothing for a viewer with no stake, so the heading has to go too or every
  // published session shows an empty «التقييم» (09 SCR-012 item 11).
  await expect(attendee.getByRole("heading", { name: "التقييم" })).toHaveCount(0);

  // ── RSVP · REQ-RSV-001, through `checkin`'s slot ──────────────────────────
  await expect(attendee.getByText(/يتبقى \d+ مقعد/)).toBeVisible();
  await attendee.getByRole("button", { name: "احجز مقعدك" }).click();
  await expect(attendee.getByText("تم تأكيد حجزك")).toBeVisible();
  await expect(attendee.getByRole("button", { name: "إلغاء الحجز" })).toBeVisible();

  const attendeeId = (
    await db.query<{ id: string }>(`select m.id from public.members m join auth.users u on u.id = m.auth_user_id where u.email = $1`, [attendeeEmail])
  ).rows[0].id;
  const reserved = await db.query<{ status: string }>(`select status from public.rsvps where session_id = $1 and member_id = $2`, [sessionId, attendeeId]);
  expect(reserved.rows).toHaveLength(1);
  expect(reserved.rows[0].status).toBe("confirmed");

  // ── The CLOCK starts it · REQ-SES-004, JOB-start_session ──────────────────
  // The admin is offered the manual start, and does not take it: the clock
  // path is the one 11 §2.1 runs every minute, so that is the one proved.
  await boss.goto("/ar/app/admin/sessions");
  await expect(boss.getByRole("button", { name: "ابدأ الجلسة الآن" })).toBeVisible();

  await db.query(
    `update public.sessions set starts_at = now() - interval '2 minutes', ends_at = now() + interval '58 minutes',
            rsvp_deadline_at = now() - interval '2 minutes', cancellation_cutoff_at = now() - interval '2 minutes'
      where id = $1`,
    [sessionId],
  );
  const started = await db.query<{ session_id: string }>(`select public.clock_start_sessions() as session_id`);
  expect(started.rows.map((r) => r.session_id)).toContain(sessionId);
  expect((await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId])).rows[0].state).toBe("in_progress");
  const clockRow = await db.query<{ actor_id: string | null; is_manual: boolean }>(
    `select actor_id, is_manual from public.session_state_transitions where session_id = $1 and to_state = 'in_progress'`,
    [sessionId],
  );
  expect(clockRow.rows[0], "the clock is not a person").toEqual({ actor_id: null, is_manual: false });

  // ── SCR-016 · the host view issues and shows the code ─────────────────────
  await boss.goto(`/ar/app/sessions/${sessionId}/host`);
  await expect(boss.getByRole("heading", { level: 1 })).toHaveText("رمز الحضور");
  const code = (await boss.locator("p[dir='ltr']").first().textContent())!.trim();
  expect(code, "the alphabet drops 0/O, 1/I/L, 5/S, 2/Z and 8/B").toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);

  // ── SCR-014 · check in with it · REQ-CHK-003 ──────────────────────────────
  await attendee.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(attendee.getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  const boxes = attendee.locator("input[maxlength='1']");
  await expect(boxes).toHaveCount(6);
  for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
  await attendee.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(attendee.getByRole("status")).toHaveText("تم تسجيل حضورك");

  const checkIn = await db.query<{ method: string }>(`select method from public.check_ins where session_id = $1 and member_id = $2`, [sessionId, attendeeId]);
  expect(checkIn.rows).toHaveLength(1);
  expect(checkIn.rows[0].method, "the code path, not a manual mark").toBe("code");

  // ── SCR-012 · comment · REQ-EVT-002, through `event`'s slot ───────────────
  const said = "سؤال عن الأداة التي استخدمتموها في القياس.";
  await attendee.goto(`/ar/app/sessions/${sessionId}`);
  const composer = attendee.getByPlaceholder("اكتب تعليقًا…");
  await composer.fill(said);
  await attendee.getByRole("button", { name: "نشر" }).click();
  // Scoped to the posted list item, not `getByText`. The composer is a
  // CONTROLLED textarea, so React renders the typed text as its DOM child and
  // an unscoped getByText matches the box you just typed into — it passes
  // instantly, waits for nothing, and the database assertion below then races
  // the server action. This waits for the comment to actually exist.
  await expect(composer).toHaveValue("");
  await expect(attendee.locator("li").filter({ hasText: said })).toHaveCount(1);

  const comment = await db.query<{ author_id: string }>(`select author_id from public.comments where session_id = $1 and body = $2`, [sessionId, said]);
  expect(comment.rows).toHaveLength(1);
  expect(comment.rows[0].author_id).toBe(attendeeId);

  // ── SCR-042 · the ADMIN completes it · REQ-SES-005 ────────────────────────
  await boss.goto("/ar/app/admin/sessions");
  await boss.getByRole("button", { name: "أنهِ الجلسة" }).click();
  // Wait for the console to show the new state before reading the database.
  // Clicking a Server Action returns immediately; «أرشف» is only offered on a
  // completed session, so its appearance IS the confirmation.
  await expect(boss.getByRole("button", { name: "أرشف" })).toBeVisible();
  expect((await db.query<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId])).rows[0].state).toBe("completed");
  const manualRow = await db.query<{ is_manual: boolean; actor_id: string | null }>(
    `select is_manual, actor_id from public.session_state_transitions where session_id = $1 and to_state = 'completed'`,
    [sessionId],
  );
  expect(manualRow.rows[0].is_manual, "a person completed it, and the row says so").toBe(true);
  expect(manualRow.rows[0].actor_id).not.toBeNull();
  // REQ-CHK-004: completing closes the check-in window in the same transaction.
  const live = await db.query<{ n: string }>(
    `select count(*) as n from public.check_in_codes where session_id = $1 and valid_until > now() and revoked_at is null`,
    [sessionId],
  );
  expect(Number(live.rows[0].n), "the code stops working the moment the session ends").toBe(0);

  // ── SCR-015 · rate · REQ-RAT-001, through `event` ─────────────────────────
  await attendee.goto(`/ar/app/sessions/${sessionId}/rate`);
  await expect(attendee.getByRole("heading", { name: "قيّم الجلسة" })).toBeVisible();
  const groups = attendee.getByRole("radiogroup");
  await expect(groups).toHaveCount(2);
  // .click(), not .check(): these are <button role="radio">, and Playwright's
  // check() only drives a real input.
  await groups.nth(0).getByRole("radio", { name: "5" }).click();
  await groups.nth(1).getByRole("radio", { name: "4" }).click();
  await attendee.getByLabel("ملاحظات (اختياري)").fill("جلسة عملية ومباشرة.");
  await attendee.getByRole("button", { name: "إرسال التقييم" }).click();
  // The form redirects back to the event page with ?rated=1; waiting for the
  // URL is what stops the database read below racing the action.
  await expect(attendee).toHaveURL(new RegExp(`/ar/app/sessions/${sessionId}\\?rated=1$`));

  const rating = await db.query<{ session_stars: number; presenter_stars: number; check_in_id: string }>(
    `select session_stars, presenter_stars, check_in_id from public.ratings where session_id = $1 and member_id = $2`,
    [sessionId, attendeeId],
  );
  expect(rating.rows).toHaveLength(1);
  expect(rating.rows[0].session_stars).toBe(5);
  expect(rating.rows[0].presenter_stars).toBe(4);
  // REQ-RAT-001 made structural: a rating cannot exist without a check-in.
  expect(rating.rows[0].check_in_id).not.toBeNull();

  // The rating section exists now that the session is complete, and the
  // attendee is told their rating landed.
  await expect(attendee.getByRole("heading", { name: "التقييم" })).toBeVisible();
  // Still inside the rating window, so the slot offers the edit link rather
  // than the «شكرًا على تقييمك» that appears once the window has closed.
  await expect(attendee.getByRole("link", { name: "عدّل تقييمك" })).toBeVisible();

  // REQ-RAT-004, the D36 boundary: the presenter reads an aggregate, never a
  // name and never an attributed score. `member` is this session's presenter.
  await member.goto(`/ar/app/sessions/${sessionId}`);
  await expect(member.getByRole("heading", { name: "التقييم" })).toBeVisible();
  // Scoped to the ratings SECTION, not the page: she also commented, and a
  // comment is attributed by design (REQ-EVT-002). The D36 boundary is that
  // her name never appears beside her SCORE.
  const ratingSection = member.locator("section", { has: member.getByRole("heading", { name: "التقييم" }) });
  await expect(ratingSection.getByText("تقييم الحضور")).toBeVisible();
  await expect(ratingSection.getByText("تقييم الجلسة")).toBeVisible();
  await expect(ratingSection.getByText("جلسة عملية ومباشرة.")).toBeVisible();
  await expect(ratingSection.getByText("حاضرة الاختبار")).toHaveCount(0);
  // No rating CTA for the presenter: they are not an attendee of their own
  // session (REQ-CHK-011's split, again).
  await expect(member.getByRole("link", { name: "قيّم الجلسة" })).toHaveCount(0);

  // ── The audit trail of the whole walk ─────────────────────────────────────
  const chain = await db.query<{ from_state: string | null; to_state: string }>(
    `select from_state, to_state from public.session_state_transitions where session_id = $1 order by occurred_at, ctid`,
    [sessionId],
  );
  expect(chain.rows.map((r) => `${r.from_state}→${r.to_state}`)).toEqual([
    "null→draft",
    "draft→submitted",
    "submitted→in_review",
    "in_review→approved",
    "approved→published",
    "published→in_progress",
    "in_progress→completed",
  ]);
  const audited = await db.query<{ action: string }>(
    `select action from public.audit_log where org_id = $1 and subject_type in ('proposal','session') order by occurred_at, ctid`,
    [orgId],
  );
  expect(audited.rows.map((r) => r.action)).toEqual([
    "proposal.submitted",
    "proposal.in_review",
    "proposal.approved",
    "session.created_from_proposal",
    "session.scheduled",
    "session.published",
    "session.complete",
  ]);

  await boss.context().close();
  await member.context().close();
  await attendee.context().close();
});
