// content, wave 10 T2·2 (docs/plan/notes/content.md, "Wave 10 plan") — the carried "a save pressed
// before hydration on /app/me" finding, re-examined against the CURRENT form. The implementation
// this was written against (a `redirect()` + `?saved=1` query param) is gone — `profile-form.tsx`/
// `app/me/actions.ts` moved to `useActionState` in wave 7 (`07a2f3b`) and were repaired again at
// wave 8 sync 5 (`bd517f6`, a different bug: the company select after a successful save). The no-JS
// half of the original question is already answered and already skipped, with its reasoning
// attached, in `wave7-content-me.spec.ts`'s own `describe.skip("no-JS save …")`: under `/app`,
// `loading.tsx` streams behind an inline script that only runs with JS on, so no `/app` route can
// even render for a no-JS client — that is `DEC-145`/DEC-087/DEC-134's loading model, not this form.
//
// What is left, JS ON: React 18+'s event-replay queues a click dispatched before hydration finishes
// and replays it once the root attaches — so a save pressed the instant the button is merely VISIBLE
// (no wait for streams to settle, no wait for hydration) is expected to still reach `saveProfile()`
// rather than fall through to a plain, unhandled native POST. This test races that on purpose —
// `page.goto()` waits only for the load event, not for hydration — and proves the outcome rather
// than assumes it: the saved value survives a full page reload afterwards.
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

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let memberEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `me-early-e2e-${tag}.example`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'MEE', gen_random_uuid()) returning id`,
    [`مؤسسة الحفظ المبكر ${tag}`, `me-early-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "عضو الحفظ المبكر" },
  });
  if (error) throw error;
  userIds.push(data.user.id);
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

test("★ T2·2: a save pressed the instant the field is visible — no wait for streams, no wait for hydration — still persists after a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto("/ar/app/me");

  // Deliberately no `waitForStreamsToSettle`/`waitForLoadState("networkidle")` here — the entire
  // point is to race the click against hydration, not to wait it out. Playwright's own locator
  // actions still auto-wait for the element to be attached/visible/stable, which is exactly the
  // "instant the button is visible" the finding describes — not an artificial extra delay, and not
  // an artificial extra rush either.
  const nameField = page.getByLabel("الاسم", { exact: false });
  await nameField.fill("عضو الحفظ الفوري");
  await page.getByRole("button", { name: "حفظ" }).click();

  // The confirmation is the FAST path's own evidence — asserted, but not the only proof (a full
  // reload below re-reads from the database, independent of whatever the client's `useActionState`
  // did or didn't display before this assertion even started).
  await expect(page.getByRole("status")).toContainText("تم الحفظ");
  await expect(nameField).toHaveValue("عضو الحفظ الفوري");

  await page.reload();
  await expect(page.getByLabel("الاسم", { exact: false })).toHaveValue("عضو الحفظ الفوري");
});
