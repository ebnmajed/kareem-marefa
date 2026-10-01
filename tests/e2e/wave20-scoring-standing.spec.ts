// Wave 20 — the hub's standing (contract 3; REQ-UIX-070, DEC-216 §5.10, DEC-218 §3.5, §3.7), over `content`'s
// placement on `/app/me` and the lead's band in `me/layout.tsx`. scoring's spec, read-only on the screens; the lead
// runs it on a production build at 390 (phone) and 1280 (desktop).
//
// ★ Both forms are in the document at every width — the card `lg:hidden`, the band `hidden lg:block`:
//   · exactly ONE standing copy is visible at each width;
//   · ★ the hidden copy renders NO `[data-slot=delta]` node at all — a count meets hidden nodes too;
//   · moment 3 plays ONCE, in the visible copy, on the app's own arrival, and the mark is written; a reload is silent.
// Captures: `.qa-shots/rtl/wave20-scoring-standing-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial", timeout: 120_000 });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let meEmail = "";
let meId = "";
const users: string[] = [];

const desktop = () => test.info().project.name === "desktop";
const STANDING = "مكانتك في الساحة";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `standing-e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المكانة', $1, 'ST', gen_random_uuid()) returning id`,
    [`standing-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  // A colleague with points this week, above the member: the week ranks two.
  const colleague = `colleague@${domain}`;
  const { data: c, error: cError } = await admin.auth.admin.createUser({ email: colleague, password: PASSWORD, email_confirm: true });
  if (cError) throw cError;
  users.push(c.user.id);
  const { rows: cRows } = await db.query<{ id: string }>(`insert into public.members (org_id, auth_user_id, email, display_name) values ($1, $2, $3, 'سارة القحطاني') returning id`, [orgId, c.user.id, colleague]);
  await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 300, 'manual_adjustment', 'اختبار', $3)`, [orgId, cRows[0].id, `e2e:standing:${cRows[0].id}`]);

  meEmail = `me@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان" } });
  if (error) throw error;
  users.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: meEmail, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

async function countAnimations(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __deltaAnimations: number };
    w.__deltaAnimations = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      if ((this as Element).getAttribute("data-slot") === "delta") w.__deltaAnimations += 1;
      return original.apply(this, args);
    };
  });
}
const deltaAnimations = (page: Page) => page.evaluate(() => (window as unknown as { __deltaAnimations: number }).__deltaAnimations);

async function navigateInApp(page: Page, link: ReturnType<Page["locator"]>, url: RegExp) {
  await expect.poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"))), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => ((window as unknown as { __inApp: boolean }).__inApp = true));
  await link.click();
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => (window as unknown as { __inApp?: boolean }).__inApp), "the navigation was the app's own, not a page load").toBe(true);
}

const mark = async () => (await db.query<{ points_total: number | null }>(`select points_total from public.member_seen_marks where member_id = $1`, [meId])).rows[0]?.points_total ?? null;

/** The standing copies on `/app/me`: the one shown at this width, and the one in the HTML that is not. */
function copies(page: Page) {
  const shown = desktop() ? "band" : "card";
  const hidden = desktop() ? "card" : "band";
  return { shown: page.locator(`#main [data-form=${shown}]`), hidden: page.locator(`#main [data-form=${hidden}]`) };
}

test("★★ one copy visible; the hidden one renders no «+N» node; moment 3 plays once on the app's own arrival", async ({ browser }) => {
  const context = await browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await countAnimations(context);
  meId = await signIn(context);
  // A completion row the member has not seen: the mark says 0, the balance says 120.
  await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 120, 'check_in', 'تسجيل حضور مؤكَّد', $3)`, [orgId, meId, `e2e:standing:me:${meId}`]);
  await db.query(`insert into public.member_seen_marks (member_id, org_id, points_total) values ($1, $2, 0) on conflict (member_id) do update set points_total = 0, points_entry_id = null`, [meId, orgId]);

  const page = await context.newPage();
  await page.goto("/ar/app");
  await navigateInApp(page, page.getByRole("link", { name: "حسابي", exact: true }).filter({ visible: true }).first(), /\/ar\/app\/me$/);

  const { shown, hidden } = copies(page);
  await expect(shown).toBeVisible();
  await expect(hidden).toBeAttached();
  await expect(hidden).toBeHidden();
  expect(await page.locator(`#main section[aria-label="${STANDING}"]`).evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0).length)).toBe(1);

  // ★ The hidden copy renders no «+N» node — not a hidden one.
  await expect(hidden.locator("[data-slot=delta]")).toHaveCount(0);
  await expect(shown.locator("[data-slot=delta] bdi[dir=ltr]")).toHaveText("+120");
  await expect(shown).toContainText("#2");

  // It played once, in the visible copy, and told the server what it showed.
  await expect.poll(() => deltaAnimations(page), { timeout: 15_000 }).toBe(1);
  await expect.poll(mark, { timeout: 20_000 }).toBe(120);

  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave20-scoring-standing-${desktop() ? 1280 : 390}.png`), fullPage: true });

  // ★ A reload is silent: the mark is the balance now, so there is no occurrence and no «+N» anywhere.
  await page.reload();
  await expect(copies(page).shown).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator("#main [data-slot=delta]")).toHaveCount(0);
  expect(await deltaAnimations(page)).toBe(0);
  await context.close();
});
