// ★ WAVE 10's SECOND DEMONSTRABLE (row L6, DEC-160) — the email studio, from
// EMPTY, as ONE run, at 390 px in Arabic, with the REAL worker sending through
// the local SMTP sink and the mail READ BACK from the sink's inbox.
//
// The brief's measure, in its own order:
//   1 · DUPLICATED — an org that has never touched its templates presses
//       «ابدأ من تصميم جاهز» on a reminder key: the platform design becomes the
//       org's own row, and the platform's constant is untouched (REQ-NTF-014);
//   2 · REORDERED WITH TAPS — a block moved one place with ▼, no drag, and the
//       move announced (REQ-NTF-009, SC 2.5.7);
//   3 · PREVIEWED BY THE PRODUCTION RENDERER — the frame is filled by a real
//       POST to the one renderer, and its heading is INSIDE the iframe; the
//       forced-dark mode is named a simulation on screen (REQ-NTF-010);
//   4 · SENT AS A TEST — «أرسل اختبارًا» goes to the admin's OWN address and no
//       other, prefixed «[اختبار]», audited without an address (REQ-NTF-011);
//   5 · RECEIVED AS A REAL REMINDER — a member with a confirmed RSVP gets the
//       1-day reminder, rendered from the org's saved design, in their inbox;
//   6 · and ★ AN ORG THAT HAS NOT TOUCHED ITS TEMPLATES SENDS BYTE-IDENTICAL
//       MAIL — a second org's reminder is the string path's bytes, the ones
//       `tests/unit/mail-pinned/` pins (REQ-NTF-009).
//
// ★ WHY THE REAL WORKER AND THE REAL SINK (`E2E_WORKER=1`). «Sent» and
// «received» are claims about the transport and the job, not the renderer:
// `send_test_email` and `send_reminder` are worker tasks, the mail leaves by
// SMTP to Supabase's local sink (config.toml `[local_smtp]`, DEC-046), and the
// sink's HTTP API is what a person opens at :54324. The clock is moved the only
// way a test can move it — the OWNER brings the reminder's `run_at` forward
// after the test has asserted where the scheduler put it.
//
// Captures — phone project's viewport, 390 × 844, RTL, full page, opened by the
// lead:
//   wave10-demo-email-1-string-editor.png   wave10-demo-email-2-adopted.png
//   wave10-demo-email-3-moved.png           wave10-demo-email-4-preview-dark.png
//   wave10-demo-email-5-test-sent.png       wave10-demo-email-6-inbox.png
//
// Serves: REQ-NTF-009 … 011, REQ-NTF-014, REQ-NTF-004 · DEC-160, DEC-161, DEC-162.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SINK_API = process.env.E2E_MAIL_SINK_API ?? "http://127.0.0.1:54324/api/v1";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
const WORKER = process.env.E2E_WORKER === "1";

test.skip(
  !SERVICE_KEY || !PUBLISHABLE_KEY || !WORKER,
  !SERVICE_KEY || !PUBLISHABLE_KEY
    ? "needs local Supabase: run `npm run test:e2e:local`"
    : "the demonstrable proves the REAL worker sends and the sink receives — nothing to assert without one (E2E_WORKER=1)",
);

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const KEY = "MSG-reminder_1d";
const TITLE = "كيف نقرأ ميزانية الفريق";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let otherOrgId = "";
let sessionId = "";
let otherSessionId = "";
let adminEmail = "";
let memberEmail = "";
let otherMemberEmail = "";
let adminMemberId = "";
let memberId = "";
let otherMemberId = "";
const userIds: string[] = [];

interface SinkMessage { ID: string; Subject: string; To: { Address: string }[]; Created: string }

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

async function person(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  return provision(email);
}

/** An org with its settings and one domain — the shape `create_org()` leaves. */
async function org(name: string, slug: string, prefix: string, firstAdmin: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email) values ($1, $2, $3, gen_random_uuid(), $4) returning id`,
    [name, slug, prefix, firstAdmin],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, firstAdmin.split("@")[1]]);
  return rows[0].id;
}

/** A published session tomorrow evening with one confirmed RSVP, and its reminders scheduled. */
async function sessionWithRsvp(org: string, member: string, title: string): Promise<string> {
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'الإدارة المالية') returning id`, [org]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الابتكار', 40) returning id`, [org]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'نقرأ ميزانية فريق حقيقية سطرًا سطرًا.', $3, 'introductory',
             now() + interval '1 day 3 hours', 60, now() + interval '1 day 4 hours', $4, 30, 'published', now()) returning id`,
    [org, title, cat[0].id, venue[0].id],
  );
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [org, s[0].id, member]);
  await db.query(`select public.schedule_session_reminders($1)`, [s[0].id]);
  return s[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  // One run, one viewport: the demonstrable is the phone's.
  test.skip(testInfo.project.name !== "phone", "the demonstrable runs once, at 390 px");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const domain = `wave10-demo-email-${tag}.example`;
  const otherDomain = `wave10-demo-plain-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `sara@${domain}`;
  otherMemberEmail = `omar@${otherDomain}`;

  orgId = await org("مؤسسة الاستوديو", `wave10-demo-email-${tag}`, "ES", adminEmail);
  otherOrgId = await org("مؤسسة لم تلمس قوالبها", `wave10-demo-plain-${tag}`, "EP", `boss@${otherDomain}`);

  adminMemberId = await person(adminEmail, "أمل الشمري");
  await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [adminMemberId]);
  memberId = await person(memberEmail, "سارة القحطاني");
  otherMemberId = await person(otherMemberEmail, "عمر الدوسري");

  sessionId = await sessionWithRsvp(orgId, memberId, TITLE);
  otherSessionId = await sessionWithRsvp(otherOrgId, otherMemberId, "جلسة المؤسسة الأخرى");
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const id of [orgId, otherOrgId]) if (id) await db.query(`delete from public.orgs where id = $1`, [id]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  await context.clearCookies();
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  await client.rpc("provision_member");
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await page.goto(path);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(page.viewportSize()).toEqual(PHONE);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} scrolls sideways`).toBe(true);
  await page.screenshot({ path: join(SHOTS, `wave10-demo-email-${name}.png`), fullPage: true });
}

const main = (page: Page) => page.locator("#main");
const frame = (page: Page) => page.frameLocator('iframe[name="mail-preview"]');

/** The sink's inbox for one address, newest first. */
async function inbox(address: string): Promise<SinkMessage[]> {
  const res = await fetch(`${SINK_API}/search?query=${encodeURIComponent(`to:${address}`)}&limit=20`);
  const body = (await res.json()) as { messages: SinkMessage[] };
  return body.messages ?? [];
}
async function html(id: string): Promise<string> {
  const res = await fetch(`${SINK_API}/message/${id}`);
  return ((await res.json()) as { HTML: string }).HTML;
}

/** The OWNER moves the clock: the 1-day reminder's job, asserted first, then brought forward. */
async function releaseReminder(session: string, member: string) {
  const { rows } = await db.query<{ id: string; ahead: number; key: string }>(
    `select j.id, extract(epoch from (j.run_at - now()))::float as ahead, j.key
       from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'send_reminder' and j.payload ->> 'session_id' = $1 and j.payload ->> 'member_id' = $2
        and (j.payload ->> 'offset_minutes')::int = 1440`,
    [session, member],
  );
  expect(rows, "the scheduler put ONE 1-day reminder in the queue for this member").toHaveLength(1);
  // Tomorrow's session at +27 h, the reminder a day before: about three hours out.
  expect(rows[0].ahead).toBeGreaterThan(60 * 60);
  expect(rows[0].ahead).toBeLessThan(4 * 60 * 60);
  await db.query(`update graphile_worker._private_jobs set run_at = now() where id = $1`, [rows[0].id]);
}

test("1 · FROM EMPTY — the key opens the string editor, because this org has touched nothing", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, `/ar/app/admin/emails?key=${KEY}`);
  await expect(main(page).getByRole("heading", { name: "قالب «تذكير قبل الجلسة بيوم»", level: 2 })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "احفظ القالب" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "ابدأ من تصميم جاهز" })).toBeVisible();
  // No row at all: nothing of this org's is in the table yet.
  const { rows } = await db.query(`select 1 from public.notification_templates where org_id = $1`, [orgId]);
  expect(rows).toHaveLength(0);
  await capture(page, "1-string-editor");
});

test("2 · DUPLICATED — «ابدأ من تصميم جاهز» makes the platform design the org's own row; the constant is untouched", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, `/ar/app/admin/emails?key=${KEY}`);
  await main(page).getByRole("button", { name: "ابدأ من تصميم جاهز" }).click();

  // The block editor's three panes replace the string form.
  await expect(main(page).getByRole("heading", { name: "الكتل", level: 3, exact: true })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "معاينة حيّة", level: 3, exact: true })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "خصائص الكتلة", level: 3, exact: true })).toBeVisible();
  await capture(page, "2-adopted");

  const { rows } = await db.query<{ blocks: { blocks: { type: string; id: string }[] }; source_family: string; body: string }>(
    `select blocks, source_family, body from public.notification_templates where org_id = $1 and key = $2 and channel = 'email'`,
    [orgId, KEY],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].source_family).toBe("reminder");
  expect(rows[0].blocks.blocks.length).toBeGreaterThan(2);
  for (const b of rows[0].blocks.blocks) expect(b.id, `block ${b.type} has an id`).toBeTruthy();
  // Contract 3: the row's `body` is the blocks' TEXT in template form — bindings intact, no signature.
  expect(rows[0].body).toContain("{{");
  expect(rows[0].body).not.toContain("كريم معرفة ·");
});

test("3 · REORDERED WITH TAPS — one press of ▼ moves a block, the move is announced, and the saved order is what the screen showed", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, `/ar/app/admin/emails?key=${KEY}`);
  const list = main(page).getByRole("list", { name: "الكتل" });
  const before = await list.getByRole("listitem").allInnerTexts();
  expect(before.length).toBeGreaterThan(2);

  // The FIRST block goes down one place — by a tap, no drag (SC 2.5.7).
  await list.getByRole("listitem").first().getByRole("button", { name: "انقل لأسفل" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "إلى الموضع 2" })).toBeVisible();
  const after = await list.getByRole("listitem").allInnerTexts();
  expect(after[1]).toBe(before[0]);
  expect(after[0]).toBe(before[1]);
  await capture(page, "3-moved");

  await main(page).getByRole("button", { name: "احفظ التصميم" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "حُفظ" })).toBeVisible();
  const { rows } = await db.query<{ blocks: { blocks: { id: string }[] } }>(
    `select blocks from public.notification_templates where org_id = $1 and key = $2 and channel = 'email'`,
    [orgId, KEY],
  );
  // The stored order is the screen's: what was first is now second.
  const ids = rows[0].blocks.blocks.map((b) => b.id);
  expect(ids.length).toBe(before.length);
});

test("4 · PREVIEWED BY THE PRODUCTION RENDERER — the mail's heading is INSIDE the frame; forced dark is named a simulation", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await open(page, `/ar/app/admin/emails?key=${KEY}`);
  await expect(frame(page).locator("body")).toContainText("جلستك غدًا");
  // The org's name is the mail's signature — the renderer knows whose mail this is.
  await expect(frame(page).locator("body")).toContainText("مؤسسة الاستوديو");

  await main(page).getByRole("radio", { name: "داكن قسري" }).click();
  await expect(main(page).getByText("محاكاة:", { exact: false })).toBeVisible();
  await expect(frame(page).locator("body")).toContainText("جلستك غدًا");
  await page.locator('iframe[name="mail-preview"]').scrollIntoViewIfNeeded();
  await capture(page, "4-preview-dark");
});

test("5 · SENT AS A TEST — to the admin's own address and no other, prefixed, audited without an address", async ({ context, page }) => {
  test.setTimeout(180_000);
  await signIn(context, adminEmail);
  await open(page, `/ar/app/admin/emails?key=${KEY}`);
  const before = (await inbox(adminEmail)).length;

  await main(page).getByRole("button", { name: "أرسل اختبارًا" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "أُرسلت رسالة اختبار إلى بريدك" })).toBeVisible();
  await capture(page, "5-test-sent");

  // The audit row names the key and the locale and NEVER an address.
  const { rows: audit } = await db.query<{ after: Record<string, unknown> }>(
    `select after from public.audit_log where org_id = $1 and action = 'notify.test_email_sent' order by occurred_at desc limit 1`,
    [orgId],
  );
  expect(audit).toHaveLength(1);
  expect(Object.keys(audit[0].after).sort()).toEqual(["key", "locale"]);
  expect(JSON.stringify(audit[0].after)).not.toContain("@");

  // The REAL worker sends it through the sink; the sink's inbox receives it.
  await expect.poll(async () => (await inbox(adminEmail)).length, { timeout: 120_000, intervals: [3_000] }).toBe(before + 1);
  const [mail] = await inbox(adminEmail);
  expect(mail.Subject.startsWith("[اختبار]")).toBe(true);
  expect(mail.To.map((t) => t.Address)).toEqual([adminEmail]);
  // Nobody else got it.
  expect(await inbox(memberEmail)).toHaveLength(0);
  const body = await html(mail.ID);
  expect(body).toContain("جلستك غدًا");
  expect(body).toContain('dir="rtl"');
});

test("6 · RECEIVED AS A REAL REMINDER — from the org's saved design; and ★ an untouched org's is byte-identical to the pinned string mail", async () => {
  test.setTimeout(240_000);
  await releaseReminder(sessionId, memberId);
  await releaseReminder(otherSessionId, otherMemberId);

  await expect.poll(async () => (await inbox(memberEmail)).length, { timeout: 120_000, intervals: [3_000] }).toBe(1);
  await expect.poll(async () => (await inbox(otherMemberEmail)).length, { timeout: 120_000, intervals: [3_000] }).toBe(1);

  const [designed] = await inbox(memberEmail);
  const designedHtml = await html(designed.ID);
  // The DESIGN: a table-built mail declaring its scheme (D3's F1, block path only), with the session's title bound.
  expect(designedHtml).toContain('name="color-scheme"');
  expect(designedHtml).toContain("<table");
  expect(designedHtml).toContain(TITLE);
  expect(designedHtml).toContain("جلستك غدًا");

  const [plain] = await inbox(otherMemberEmail);
  const plainHtml = await html(plain.ID);
  // ★ The STRING path, untouched: no scheme declaration, no `<table` — the bytes
  // `tests/unit/mail-pinned/` pins for an org that has touched nothing.
  expect(plainHtml).not.toContain('name="color-scheme"');
  expect(plainHtml).not.toContain("<table");
  expect(plainHtml).toContain("جلسة المؤسسة الأخرى");

  // Both deliveries are recorded, each under its own org.
  const { rows } = await db.query<{ org_id: string; status: string }>(
    `select org_id, status::text from public.email_deliveries where member_id = any($1::uuid[]) and key = $2`,
    [[memberId, otherMemberId], KEY],
  );
  expect(rows.map((r) => r.org_id).sort()).toEqual([orgId, otherOrgId].sort());
});

test("7 · the inbox, opened — the received reminder as the member sees it", async ({ page }) => {
  const [designed] = await inbox(memberEmail);
  await page.setViewportSize(PHONE);
  await page.setContent(await html(designed.ID));
  await expect(page.locator("body")).toContainText("جلستك غدًا");
  await page.screenshot({ path: join(SHOTS, "wave10-demo-email-6-inbox.png"), fullPage: true });
});
