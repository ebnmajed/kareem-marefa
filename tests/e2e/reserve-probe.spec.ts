// The reserve probe — DEC-135's own measure, kept so it can be run again.
//
// React 19.2.4 lost a ping mid-render, and about one «احجز مقعدك» in three never
// committed on a production build: the seat was stored and the whole response
// had arrived, and the page sat busy until something else updated it. The bug
// is PROBABILISTIC, so one green press proves nothing. The wave-6 bisect pressed
// 8 times per build and the fix measured 16 of 16 at ~105 ms; this is that
// probe: sixteen fresh sessions, one press each, and every press must commit.
//
// At a one-in-three hang rate, sixteen clean presses by chance is (2/3)^16 —
// about 0.15 %. A single STUCK is a regression of React's own fix,
// facebook/react#36134, which `next@16.3.5` vendors (DEC-140, DEC-146) — it
// replaced `patches/next+16.2.10.patch` (DEC-136), and the probe outlives both.
//
// Phone project only: one touch-input run is the measure; the desktop project
// would double the seats for no information. Run it on a production build on
// a quiet machine — a loaded one measures the machine:
//
//   npm run build && npm run test:e2e:local -- tests/e2e/reserve-probe.spec.ts --project=phone
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
const PRESSES = 16;
// A press that commits does so in ~105 ms. Ten seconds is not a performance
// budget; it is the line past which the page is not coming back on its own.
const STUCK_AFTER_MS = 10_000;

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let email = "";
const userIds: string[] = [];
const sessionIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one probe run, on the touch project");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();

  const tag = `probe-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القياس', $1, 'PR', gen_random_uuid()) returning id`,
    [`e2e-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'ذكاء اصطناعي') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة الكبرى', 40) returning id`, [orgId]);

  // The same shape as the page the bug was measured on: an open, published
  // session a member can reserve, one per press so every press is a first.
  for (let i = 0; i < PRESSES; i++) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, state, published_at)
       values ($1, $2, 'جلسة تمهيدية عن كيف تعمل نماذج اللغة، وحدودها، ومتى تستخدمها في العمل.', $3, 'introductory',
               now() + interval '6 days', 60, now() + interval '6 days 1 hour', $4, 40, now() + interval '5 days', 'published', now())
       returning id`,
      [orgId, `جلسة القياس ${i + 1}`, cat[0].id, venue[0].id],
    );
    sessionIds.push(rows[0].id);
  }

  email = `reem@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "ريم العتيبي" } });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

test(`★ ${PRESSES} reservations, each on a fresh session, all commit on their own`, async ({ context, page }) => {
  test.setTimeout(PRESSES * (STUCK_AFTER_MS + 8_000));
  await signIn(context);

  const results: string[] = [];
  for (const id of sessionIds) {
    await page.goto(`/ar/app/sessions/${id}`);
    // Streamed sections swapped in, and React owns the form: a press before
    // hydration is a race the member never runs, and not what this measures.
    await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "احجز مقعدك" }).filter({ visible: true }).first().click();
    const pressedAt = Date.now();
    let committedAfter = -1;
    // Polled, not `toBeVisible`: the probe records how long each press took,
    // and nothing else may update the page while it waits — typing, scrolling
    // or a re-query that re-renders would un-stick exactly the hang it measures.
    while (Date.now() - pressedAt < STUCK_AFTER_MS) {
      if ((await page.getByText("تم تأكيد حجزك").filter({ visible: true }).count()) > 0) {
        committedAfter = Date.now() - pressedAt;
        break;
      }
      await page.waitForTimeout(100);
    }
    results.push(committedAfter < 0 ? "STUCK" : `${committedAfter}ms`);
  }

  console.log(`\nreserve probe: ${results.join(" ")}\n`);
  expect(results.filter((r) => r === "STUCK"), `presses: ${results.join(" ")}`).toHaveLength(0);
});
