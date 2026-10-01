// Wave 20 — a diagnosis, not a test of behaviour: why `notify-screens.spec.ts:166` met TWO identical «الشهادات»
// rows on `/ar/app/me/notifications` (the gate's e2e run 1, build of `d4ae259c`).
//
// Two explanations, and they are told apart by WHERE the second copy stands:
//   (a) the page rendered the preference matrix twice — both copies inside `#main`, and still two after the streams
//       settle;
//   (b) DEC-204's hard-load duplicate — the streamed segment for the boundary sits hidden beside the committed page,
//       outside `#main` (in a `[hidden]` element), for a window after load, and then it is gone.
// The source reads (a) as impossible: the page calls `PreferenceMatrix` once and nothing else renders a category
// row. This measures it. It asserts nothing about the rate; its lines go to the lead.
//
// Each load records, the moment `goto` resolves and again after 1 s: how many `#main`, how many matrix rows for
// «الشهادات» in the document, how many of those inside `#main`, how many inside a `[hidden]` ancestor, and how many
// level-1 headings the accessibility tree exposes (DEC-204 §3).
//
//   E2E_DUP_LOADS=24 npm run test:e2e:local -- tests/e2e/wave20-notify-inbox-duplicate.spec.ts --project=phone --workers=1
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const LOADS = Number(process.env.E2E_DUP_LOADS ?? 24);
const ROUTE = process.env.E2E_DUP_ROUTE ?? "/ar/app/me/notifications";
const OUT = process.env.E2E_DUP_OUT ?? join(process.cwd(), ".qa-shots", "hard-load", "wave20-notify-inbox.jsonl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.setTimeout(20 * 60_000);

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w20-dup-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القياس', $1, 'DP', gen_random_uuid()) returning id`,
    [`w20-dup-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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

/** Where the «الشهادات» matrix rows stand right now. */
const where = (page: Page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll("li")].filter((li) => li.textContent?.includes("الشهادات") && li.textContent.includes("يصلك دائمًا"));
    return {
      main: document.querySelectorAll("#main").length,
      rows: rows.length,
      inMain: rows.filter((li) => li.closest("#main")).length,
      inHidden: rows.filter((li) => li.closest("[hidden]")).length,
      h1: document.querySelectorAll("h1").length,
    };
  });

test("where the second «الشهادات» row stands on a hard load of the inbox", async ({ context, page }, testInfo) => {
  await signIn(context);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const axH1 = async () => {
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: { ignored?: boolean; role?: { value?: string }; properties?: { name: string; value: { value?: unknown } }[] }[] };
    return nodes.filter((n) => !n.ignored && n.role?.value === "heading" && n.properties?.some((p) => p.name === "level" && p.value.value === 1)).length;
  };

  const results: { atLoad: Awaited<ReturnType<typeof where>> & { ax: number }; settled: Awaited<ReturnType<typeof where>> & { ax: number } }[] = [];
  for (let i = 0; i < LOADS; i++) {
    await page.goto(ROUTE, { waitUntil: "load" });
    const atLoad = { ...(await where(page)), ax: await axH1().catch(() => -1) };
    await page.waitForTimeout(1000);
    await expect(page.locator("#main h1").first()).toBeAttached();
    const settled = { ...(await where(page)), ax: await axH1().catch(() => -1) };
    results.push({ atLoad, settled });
  }

  const twiceAtLoad = results.filter((r) => r.atLoad.rows > 1).length;
  const twiceSettled = results.filter((r) => r.settled.rows > 1).length;
  const bothInMain = results.filter((r) => r.atLoad.inMain > 1 || r.settled.inMain > 1).length;
  const secondHidden = results.filter((r) => r.atLoad.rows > 1 && r.atLoad.inHidden >= 1).length;
  const line = { at: new Date().toISOString(), route: ROUTE, project: testInfo.project.name, loads: LOADS, twiceAtLoad, twiceSettled, bothInMain, secondHidden, results };
  mkdirSync(join(OUT, ".."), { recursive: true });
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  console.log(
    `inbox duplicate ${ROUTE} [${testInfo.project.name}]: two rows at load ${twiceAtLoad}/${LOADS}, of which the second hidden outside #main ${secondHidden}; ` +
      `two rows after 1 s ${twiceSettled}/${LOADS}; both inside #main ${bothInMain}/${LOADS}`,
  );
});
