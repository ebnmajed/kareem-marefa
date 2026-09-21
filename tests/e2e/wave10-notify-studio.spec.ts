// SCR-058 · the email studio — REQ-NTF-009, REQ-NTF-010, REQ-NTF-012,
// `16` §11.4, against REAL local Supabase.
//
// What this covers that a unit test cannot: that the three panes render on the
// real screen, that the preview's frame is filled by the ONE renderer over a
// real POST, that the four modes differ, and that the checks panel refuses a
// save an admin should not be able to make.
//
// ★ AND THE ROLE, which `tests/unit/notify-preview-route.test.ts` says it
// cannot prove: `compileEmailPreview()` collapses «not an admin» and «no such
// key» into one null, and a unit test mocking the DAL can only assert what the
// handler does with the answer. A MODERATOR is refused here, beside a member —
// the role most likely to probe, since `/app/admin/emails` is admin-only.
//
// Captures (phone project, 390 × 844, `E2E_SHOTS_DIR`):
//   wave10-notify-editor-phone.png        the three panes at 390 px
//   wave10-notify-preview-desktop.png     the desktop mode
//   wave10-notify-preview-text.png        the plain-text mode
//   wave10-notify-preview-dark.png        the forced-dark SIMULATION
//   wave10-notify-check-binding.png       a binding the key does not offer
//   wave10-notify-check-dropped.png       a stored block the document lost
//   wave10-notify-check-image-alt.png     an image with no alt, save disabled
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

// A design with one of each block that carries text, so every pane has
// something to show and the preview has something to render.
const DESIGN = {
  schemaVersion: 1,
  blocks: [
    { type: "heading", id: "h1", text: "جلستك غدًا", level: 1 },
    { type: "paragraph", id: "p1", text: "نراك في {{venue}} — {{startsAt}}." },
    { type: "detail_list", id: "d1", items: [{ label: "الموعد", value: "{{startsAt}}" }] },
    { type: "button", id: "b1", label: "افتح الجلسة", urlBinding: "url", style: "primary" },
  ],
};

// ★ A document with a block the reader REFUSES — a paragraph with no text.
// `0134` admits it (the constraint checks the envelope, not the contents), so
// this is the state an admin must be told about rather than shown a shorter
// document than the one stored.
const DESIGN_WITH_LOSS = {
  schemaVersion: 1,
  blocks: [
    { type: "heading", id: "h1", text: "عنوان سليم", level: 1 },
    { type: "paragraph", id: "gone" },
  ],
};

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });
// A capture taken mid-scroll shows the top of the page (wave 8's finding).
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
let memberEmail = "";
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

async function seedTemplate(key: string, blocks: object) {
  await db.query(
    `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks, source_family)
     values ($1, $2, 'email', 'ar', $3, $4, '{}', $5::jsonb, 'reminder')
     on conflict (org_id, key, channel, locale) do update set blocks = excluded.blocks, body = excluded.body`,
    [orgId, key, "غدًا: {{title}}", "جلستك غدًا\n\nنراك في {{venue}}.", JSON.stringify(blocks)],
  );
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w10-studio-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;
  memberEmail = `sara@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاستوديو', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`w10-studio-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [
    [adminEmail, "مشرفة الاستوديو"],
    [modEmail, "منظّم الاستوديو"],
    [memberEmail, "سارة العتيبي"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provision(adminEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [await provision(modEmail)]);
  await provision(memberEmail);
  await seedTemplate("MSG-reminder_1d", DESIGN);
  await seedTemplate("MSG-reminder_7d", DESIGN_WITH_LOSS);
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
  const { error: refreshError } = await client.auth.refreshSession();
  if (refreshError) throw refreshError;
  expect(jar.length, "the refreshed session wrote no cookies").toBeGreaterThan(0);
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  // `DEC-145`: an orphaned streaming segment duplicates ids, so every
  // page-level locator comes from `#main` and nothing is asserted until the
  // streams settle.
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

const editor = (page: Page) => page.locator("#main");

/**
 * One row of the checks panel, by the words its title starts with.
 *
 * ★ `toHaveCount(1)` rather than `toBeVisible()`, because a check's `title`
 * and `titleWithValue` share their opening words and two rows of the SAME
 * check would make a bare `getByText` ambiguous under strict mode. Asserting
 * the count says both things the case means: the check fired, and it fired
 * once. Two builds have already been spent on locators that matched twice.
 */
const check = (page: Page, words: string) =>
  editor(page).locator("li").filter({ hasText: words });

test("★ the three panes at 390 px, with the preview filled by the one renderer", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");

  await expect(editor(page).getByRole("heading", { name: "الكتل", level: 3, exact: true })).toBeVisible();
  await expect(editor(page).getByRole("heading", { name: "معاينة حيّة", level: 3, exact: true })).toBeVisible();
  await expect(editor(page).getByRole("heading", { name: "خصائص الكتلة", level: 3, exact: true })).toBeVisible();

  // Every block of the stored design is a row, named by its own first words.
  await expect(editor(page).getByRole("listitem").filter({ hasText: "جلستك غدًا" })).toBeVisible();

  // ★ The frame is filled by a real POST to the one renderer, not by anything
  // this page drew: the mail's own heading is INSIDE the iframe.
  const frame = page.frameLocator('iframe[name="mail-preview"]');
  await expect(frame.locator("body")).toContainText("جلستك غدًا");
  await expect(frame.locator("body")).toContainText("قاعة");

  // The composed footer is shown as a fixed last row, outside the reorderable
  // set. ★ The WHOLE string, exactly: «تذييل التفضيلات» alone also matches the
  // checks panel's satisfied row, and a locator that matches two things is not
  // asserting the one it names.
  await expect(
    editor(page).getByText("تذييل التفضيلات — يُضاف دائمًا ولا يمكن حذفه أو تحريكه", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave10-notify-editor-phone.png` });
});

test("the four preview modes differ, and the dark one says it is a simulation", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");
  const frame = page.frameLocator('iframe[name="mail-preview"]');

  await editor(page).getByRole("radio", { name: "سطح مكتب" }).click();
  await expect(frame.locator("body")).toContainText("جلستك غدًا");
  await page.screenshot({ path: `${SHOTS}/wave10-notify-preview-desktop.png` });

  // ★ Plain text is what a stripped corporate client shows — no markup at all.
  await editor(page).getByRole("radio", { name: "نص فقط" }).click();
  await expect(frame.locator("body")).toContainText("افتح الجلسة:");
  await page.screenshot({ path: `${SHOTS}/wave10-notify-preview-text.png` });

  // ★ The simulation is NAMED on the screen, not only in the code.
  await editor(page).getByRole("radio", { name: "داكن قسري" }).click();
  await expect(editor(page).getByText("محاكاة:", { exact: false })).toBeVisible();
  await expect(frame.locator("body")).toContainText("جلستك غدًا");
  await page.screenshot({ path: `${SHOTS}/wave10-notify-preview-dark.png` });
});

test("★ a binding the key does not offer is caught in the editor, and the save is disabled", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");

  await editor(page).getByRole("listitem").filter({ hasText: "نراك في" }).getByRole("button").first().click();
  const text = editor(page).getByLabel("النص", { exact: true });
  await text.fill("نراك في {{building}}.");
  await text.blur();

  await expect(check(page, "لا تتيحه هذه الرسالة")).toHaveCount(1);
  // A mail an admin has not seen is a mail they must not be able to approve.
  await expect(editor(page).getByRole("button", { name: "احفظ التصميم" })).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/wave10-notify-check-binding.png` });
});

test("★ a stored block the document LOST is named, not swallowed", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  // This row's second block has no text: `0134` admits it, the reader refuses
  // it, and an editor that swallowed it would show a shorter document than the
  // one stored and let an admin save the loss.
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_7d");

  await expect(check(page, "أُسقطت كتلة")).toHaveCount(1);
  await expect(editor(page).getByRole("button", { name: "احفظ التصميم" })).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/wave10-notify-check-dropped.png` });
});

test("an image with no alt blocks the save, and the check names the block", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await goto(page, "/ar/app/admin/emails?key=MSG-reminder_1d");

  await editor(page).getByRole("button", { name: "أضف صورة" }).click();
  await expect(check(page, "صورة بلا نص بديل")).toHaveCount(1);
  await expect(editor(page).getByRole("button", { name: "احفظ التصميم" })).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/wave10-notify-check-image-alt.png` });
});

test("★ the preview route refuses a MODERATOR and a member alike — the role a unit test cannot prove", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project probes the route");
  for (const [email, who] of [[modEmail, "moderator"], [memberEmail, "member"]] as const) {
    await context.clearCookies();
    await signIn(context, email);
    const response = await page.request.post("/api/admin/emails/preview", {
      form: { key: "MSG-reminder_1d", mode: "html" },
    });
    // 404 and not 403: a preview must not tell a stranger which message keys
    // exist, so «not you» and «no such message» are one answer.
    expect(response.status(), who).toBe(404);
    expect((await response.text()).trim(), who).toBe("not_found");
  }
});
