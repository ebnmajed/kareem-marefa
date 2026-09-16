// The Comments slot inside the real event page (SCR-012 item 8), against
// REAL local Supabase — REQ-EVT-002, REQ-EVT-003, REQ-EVT-005. Same shape
// as tests/e2e/event-rate.spec.ts: a service-role admin client plus raw pg
// to seed a published session, a password sign-in with the resulting
// cookies installed in the browser context.
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

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let userId = "";
let email = "";
let publishedSessionId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();

  const tag = `comments-${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EE', gen_random_uuid()) returning id`,
    [`e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
  if (error) throw error;
  userId = data.user.id;

  const { rows: sessionRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, state, published_at)
     values ($1, 'جلسة منشورة للاختبار', 'ملخص الجلسة', $2, 'introductory', now() + interval '2 days', 60, now() + interval '2 days' + interval '1 hour', $3, 30, now() + interval '1 day', 'published', now())
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  publishedSessionId = sessionRows[0].id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  expect(["provisioned", "member"]).toContain((envelope as { status: string }).status);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ The lead's real-build finding (reproduced under a CPU throttle): while a
// Suspense boundary is still streaming, React leaves a HIDDEN copy of it in
// `body>div#S:n[hidden]` alongside the visible copy under `#main` for a few
// hundred ms. Playwright's strict-mode locators count the hidden node too,
// so a `getByText`/`getByRole` right after `goto` can resolve to two
// elements — this spec's own `event-comments:87` was one of three specs that
// hit it. Not a bug in this slot; wait for the stream to finish settling
// before any strict locator.
async function waitForStreamsToSettle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

test("a member with no RSVP can comment on a published session (REQ-EVT-003)", async ({ context, page }) => {
  const { rows } = await db.query<{ id: string }>(`select id from public.rsvps where session_id = $1`, [publishedSessionId]);
  expect(rows).toHaveLength(0); // confirms the condition this test is actually about

  await signIn(context);
  await page.goto(`/ar/app/sessions/${publishedSessionId}`);
  await waitForStreamsToSettle(page);
  await expect(page.getByPlaceholder("اكتب تعليقًا…")).toBeVisible();

  await page.getByPlaceholder("اكتب تعليقًا…").fill("سؤال عن الجلسة");
  await page.getByRole("button", { name: "نشر" }).click();
  await expect(page.getByText("سؤال عن الجلسة")).toBeVisible();

  const { rows: rsvpRows } = await db.query<{ id: string }>(`select id from public.rsvps where session_id = $1`, [publishedSessionId]);
  expect(rsvpRows).toHaveLength(0); // still no RSVP — commenting did not create one
});

test("a reply to a reply attaches to the parent thread, not a third level (REQ-EVT-002)", async ({ context, page }) => {
  await signIn(context);
  await page.goto(`/ar/app/sessions/${publishedSessionId}`);
  await waitForStreamsToSettle(page);

  // Reply to the comment from the previous test.
  await page.getByRole("button", { name: "رد" }).first().click();
  await page.getByPlaceholder("اكتب ردًا…").fill("إجابة أولى");
  await page.getByRole("button", { name: "رد" }).last().click();
  await expect(page.getByText("إجابة أولى")).toBeVisible();

  // The reply itself offers no Reply action — the UI has nowhere to attach a
  // third level, which is what "attaches to the parent thread" means in
  // practice: there is no deeper thread to attach to. (The database refuses
  // the attempt outright regardless — tests/rls/m2-schema.test.ts already
  // proves that at the RLS layer; this is the UI-side half of the same
  // requirement.)
  //
  // ★ The lead's live-build run found `.first()` here resolves to the
  // OUTER (parent) <li> — the reply's own <li> nests INSIDE it
  // (comment-list.tsx), so a plain `hasText` match returns BOTH, and the
  // outer one (which DOES have its own "رد" button, for the top-level
  // comment) comes first in document order. `.last()` is the reply's own,
  // innermost row — the same nesting trap the delete locator above already
  // had to account for.
  const replyRow = page.locator("li", { hasText: "إجابة أولى" }).last();
  await expect(replyRow.getByRole("button", { name: "رد" })).toHaveCount(0);
});

test("deleting a comment with replies leaves a tombstone; a reply-less comment vanishes entirely (REQ-EVT-005)", async ({ context, page }) => {
  await signIn(context);
  await page.goto(`/ar/app/sessions/${publishedSessionId}`);
  await waitForStreamsToSettle(page);

  // "سؤال عن الجلسة" now has one reply ("إجابة أولى") from the previous test.
  // The reply's <li> nests INSIDE the original's <li> (comment-list.tsx), so
  // an `li` locator matching on text would also match the reply's own
  // "حذف" button as a descendant. Scoping to the comment's own body text and
  // walking up TWO levels — ★ wave 6: the body is now `<Prose><p>…</p>
  // </Prose>`, one level deeper than before (a bare `<p>`), so the shared
  // ancestor that also holds the actions row (delete, reaction, reply) is
  // now the body's grandparent, not its immediate parent. `.locator("..")`
  // chained twice, not `"../.."` as a single XPath-ish string, for the same
  // reason `sessions`' own e2e specs chain it: Playwright resolves each
  // segment against its own locator, not a raw XPath expression.
  const originalBody = page.getByText("سؤال عن الجلسة", { exact: true });
  const originalRow = originalBody.locator("..").locator("..");
  // The delete trigger is icon-only now (`ui/icon-button`, REQ-NFR-007's
  // name is the `aria-label`, not visible text) — `getByRole` matches the
  // ACCESSIBLE name regardless, so "حذف" still resolves it.
  await originalRow.getByRole("button", { name: "حذف" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "حذف" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(page.getByText("حُذف هذا التعليق")).toBeVisible();
  await expect(page.getByText("إجابة أولى")).toBeVisible(); // the reply survives, readable

  // A fresh, reply-less comment: delete it and it disappears outright, no tombstone.
  await page.getByPlaceholder("اكتب تعليقًا…").fill("تعليق بلا ردود");
  await page.getByRole("button", { name: "نشر" }).click();
  await expect(page.getByText("تعليق بلا ردود")).toBeVisible();
  const freshBody = page.getByText("تعليق بلا ردود", { exact: true });
  const freshRow = freshBody.locator("..").locator("..");
  await freshRow.getByRole("button", { name: "حذف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "حذف" }).click();
  await expect(page.getByText("تعليق بلا ردود")).toHaveCount(0);
});
