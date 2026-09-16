// The 390 px RTL review of the event page's discussion — REQ-UIX-024, DEC-130.
//
// Not a behaviour spec: `event-comments.spec.ts` (content's) proves the
// behaviour. This one exists because the owner's ask for the discussion — «a
// composition surface with proper feedback» — is a judgement about what the
// screen LOOKS like in each state, and jsdom has no layout engine and axe has
// no non-text-contrast rule. So it drives the real screen into each state a
// member meets — a thread with a reply and a reaction, bidi-mixed text, the
// composer near its cap, a post in flight, a post that failed — and captures
// each at 390 px for a person to open. The lead looks at them and writes what
// was seen into STATUS.md.
//
// Captures go to `.qa-shots/rtl/`, not `test-results/` (Playwright empties
// that at the start of every run). Phone project only: one set, touch input.
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
test.use({ viewport: PHONE });
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let cancelledSessionId = "";
const userIds: string[] = [];
let memberEmail = "";
let otherEmail = "";

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one review set, on the touch project");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();

  const tag = `discussion-review-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المراجعة', $1, 'RV', gen_random_uuid()) returning id`,
    [`e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'ذكاء اصطناعي') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);

  memberEmail = `reem@${domain}`;
  otherEmail = `salem@${domain}`;
  for (const [email, name] of [
    [memberEmail, "ريم العتيبي"],
    [otherEmail, "سالم الحربي"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, state, published_at)
     values ($1, 'مدخل إلى نماذج اللغة الكبيرة', 'جلسة تمهيدية عن كيف تعمل نماذج اللغة، وحدودها، ومتى تستخدمها في العمل.', $2, 'introductory',
             now() + interval '3 days', 90, now() + interval '3 days 90 minutes', $3, 40, now() + interval '2 days', 'published', now())
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = rows[0].id;

  // A cancelled session with one comment on it: the discussion is frozen —
  // the composer becomes a notice and replies go (content's `getCommentsPageData`).
  const { rows: cancelled } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, cancellation_reason)
     values ($1, 'جلسة أُلغيت', 'ملخص.', $2, 'introductory', now() + interval '5 days', 60, now() + interval '5 days 1 hour', $3, 40, 'cancelled', now(), 'تعذّر حضور المقدّم')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  cancelledSessionId = cancelled[0].id;
});

test.afterAll(async () => {
  if (!db) return;
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const discussion = (page: Page) => page.locator("#main section#discussion");
const composer = (page: Page) => discussion(page).getByPlaceholder("اكتب تعليقًا…");

/**
 * Waits out React's streamed Suspense boundaries. While one streams, a second
 * copy of its content sits in `body > div#S:n[hidden]` for a few hundred ms
 * beside the copy already in `<main>` — seen under a CPU throttle in wave 6 —
 * and a strict locator counts it.
 */
async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // The section itself, whole — and the viewport as the member sees it, so
  // anything fixed over the discussion (the action bar, a toast) shows too.
  await discussion(page).screenshot({ path: `.qa-shots/rtl/wave6-discussion-${name}-390.png` });
  await page.screenshot({ path: `.qa-shots/rtl/wave6-discussion-${name}-viewport-390.png` });
}

/** Holds, or fails, the next Server Action POST from this page. */
async function interceptNextAction(page: Page, mode: "hold" | "fail") {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname.includes("/app/sessions/"),
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
      if (mode === "fail") return route.abort("failed");
      await held;
      return route.continue();
    },
  );
  return () => release();
}

test("the discussion at 390 px RTL, in the states a member meets", async ({ context, page }) => {
  test.slow();

  // Another member asks first, so the thread has someone else's voice in it.
  await signIn(context, otherEmail);
  await goto(page, `/ar/app/sessions/${sessionId}`);
  await composer(page).fill("هل ستُتاح الشرائح بعد الجلسة؟ وهل يلزم تثبيت شيء مسبقًا؟");
  await page.getByRole("button", { name: "نشر" }).click();
  await expect(discussion(page).getByText("هل ستُتاح الشرائح بعد الجلسة؟", { exact: false })).toBeVisible();

  // ── the empty-to-first state is past; now the member's view ────────────────
  await signIn(context, memberEmail);
  await goto(page, `/ar/app/sessions/${sessionId}`);
  await discussion(page).scrollIntoViewIfNeeded();
  await capture(page, "1-first-visit");

  // A reply, and a comment of their own that mixes scripts and numbers (bidi).
  await discussion(page).getByRole("button", { name: "رد" }).first().click();
  await page.getByPlaceholder("اكتب ردًا…").fill("نعم، سأرفعها في قسم المواد بعد الجلسة مباشرة.");
  await discussion(page).getByRole("button", { name: "رد" }).last().click();
  await expect(discussion(page).getByText("سأرفعها في قسم المواد")).toBeVisible();

  await composer(page).fill("أنصح بقراءة فصل Transformers من كتاب Deep Learning قبل الجلسة — الصفحات 12 إلى 40، ومدته 45 دقيقة تقريبًا.");
  await page.getByRole("button", { name: "نشر" }).click();
  await expect(discussion(page).getByText("Transformers", { exact: false })).toBeVisible();
  // A reaction on the other member's question — the resting reacted state.
  await discussion(page).getByRole("button", { name: "إعجاب" }).first().click();
  await expect(discussion(page).getByRole("button", { name: "إلغاء الإعجاب" }).first()).toBeVisible();
  await page.waitForTimeout(600); // past the whisper, so the capture is the resting state
  await capture(page, "2-thread");

  // The mention list, against the other seeded member.
  await composer(page).fill("شكرًا @سا");
  await page.waitForTimeout(800);
  await capture(page, "2b-mention");
  await composer(page).fill("");

  // The composer near its cap: the counter is silent until 200 characters remain.
  await composer(page).fill("ا".repeat(3890));
  await capture(page, "3-near-cap");
  await composer(page).fill("");

  // A post in flight: the button's pending state is the feedback.
  const release = await interceptNextAction(page, "hold");
  await composer(page).fill("تعليق قيد الإرسال");
  await page.getByRole("button", { name: /نشر|جارٍ/ }).click();
  await page.waitForTimeout(400);
  await capture(page, "4-pending");
  release();
  await expect(discussion(page).getByText("تعليق قيد الإرسال")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });

  // A post that failed: the text is kept, and the member is told next to it.
  await interceptNextAction(page, "fail");
  await composer(page).fill("هذا التعليق لن يصل — يجب أن يبقى نصه في الحقل");
  await page.getByRole("button", { name: "نشر" }).click();
  await page.waitForTimeout(1500);
  await capture(page, "5-failed");
  await expect(composer(page)).toHaveValue("هذا التعليق لن يصل — يجب أن يبقى نصه في الحقل");
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // Frozen: a cancelled session keeps its discussion readable and closes it.
  const { rows: other } = await db.query<{ id: string }>(`select id from public.members where auth_user_id = $1`, [userIds[1]]);
  await db.query(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'هل سيُعاد جدولة هذه الجلسة؟')`, [orgId, cancelledSessionId, other[0].id]);
  await goto(page, `/ar/app/sessions/${cancelledSessionId}`);
  await page.waitForLoadState("networkidle");
  if ((await discussion(page).count()) > 0) {
    await discussion(page).scrollIntoViewIfNeeded();
    await capture(page, "6-frozen");
  } else {
    await page.screenshot({ path: ".qa-shots/rtl/wave6-discussion-6-frozen-no-section-390.png", fullPage: true });
  }
});
