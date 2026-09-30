// Wave 18, PR B — SCR-014 and SCR-016 rebuilt from their artboards (REQ-UIX-062, STORY-UIX-049,
// STORY-UIX-050; `CheckIn.dc.html`, `Host.dc.html`; DEC-208, DEC-209), against real local Supabase.
//
//   1. SCR-014 before the check-in: the prompt names the six boxes, the rules line says the org's
//      rotation and «no reservation» (walk-ins are on), the earn panel draws the RULE's amount, the one
//      submit is in the bottom bar.
//   2. ★ A refused code does not move (DEC-206 §4.75): the alert under the boxes, and no animation
//      running anywhere in the check-in form (the live badge's dot, a status, pulses outside it).
//   3. SCR-016 live: the code in two groups whose text is the six characters, the countdown, the
//      count, the switch with its auto-close time; projection shows the code alone.
//
// Captures at `.qa-shots/rtl/wave18-checkin-<scr014|scr016>-<state>-<width>.png`, honouring
// E2E_SHOTS_DIR, on the phone (390) and at 1280 — for the owner's review beside the artboards.
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
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w18-checkin-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة شاشة الحضور', $1, 'WM', gen_random_uuid()) returning id`,
    [`w18-checkin-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // A team colour, so the burst carries it (DEC-195 §6.22).
  await db.query(`insert into public.companies (org_id, name, team_color) values ($1, 'شركة الاختبار', '#35d0ff')`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);
  // Live now, walk-ins allowed: any member of the org may check in with the room's code.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'العرض في 5 شرائح', 'ملخص', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs in a fresh member (or staff), provisions through the real RPC, installs the cookies. */
async function signIn(context: BrowserContext, who: string, asAdmin = false): Promise<void> {
  const email = `${who}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `عضو ${who}` } });
  if (error && !/already/i.test(error.message)) throw error;
  if (data?.user) users.push(data.user.id);
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set company_id = (select id from public.companies where org_id = $2 limit 1) where id = $1`, [memberId, orgId]);
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
// The phone project's device is 412 wide; the artboards and the rule are 390 × 844.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
});
async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(SHOTS, `wave18-checkin-${name}-${width}.png`), fullPage: true });
}

test("SCR-014 before the check-in: the prompt, the rules line, the rule's amount, the bar", async ({ context, page }) => {
  await signIn(context, "member");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("تسجيل الحضور");
  const group = main(page).getByRole("group", { name: "أدخل رمز الحضور الذي أعلنه المُقدِّم" });
  await expect(group.locator("input[maxlength='1']")).toHaveCount(6);
  await expect(main(page).getByText(/الرمز يتغيّر كل 10 دقائق، ويُقبل أثناء الجلسة فقط\. لا حاجة لحجز مسبق\./)).toBeVisible();

  // Every figure is read (contract 7): the sticker says what the org's rule says, or nothing.
  const { rows } = await db.query<{ points: number; enabled: boolean }>(`select points, enabled from public.scoring_rules where org_id = $1 and action_key = 'check_in'`, [orgId]);
  const rule = rows[0];
  if (rule?.enabled && rule.points > 0) await expect(main(page).getByText(`+${rule.points}`, { exact: true })).toBeVisible();
  else await expect(main(page).getByText(/^\+\d+$/)).toHaveCount(0);

  const bar = main(page).getByRole("group", { name: "إرسال رمز الحضور" });
  await expect(bar.getByRole("button", { name: "تسجيل الحضور" })).toBeVisible();
  await expect(bar).toContainText("لم تلتقط الرمز؟");
  await shoot(page, "scr014-form");
});

test("★ SCR-014 a refused code does not move — the alert under the boxes, nothing animating", async ({ context, page }) => {
  await signIn(context, "wrong");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in?error=invalid_code&code=ZZZZZZ`);
  const alert = main(page).getByRole("alert");
  await expect(alert).toContainText("الرمز غير صحيح");
  // ★ Scoped to the check-in FORM — the boxes, the alert, the rules line, the earn panel and the bar.
  // The page carries one legitimate loop outside it: the live badge's pulsing dot in the session row
  // (`SessionStatusBadge`, DEC-073's live dot, off under reduced motion). That is a status, not the
  // refusal; the rule is that the REFUSAL never moves (REQ-UIX-046, DEC-206 §4.75). Every running
  // animation inside the form is named by its target, so a failure says what moves.
  const running = await page.evaluate(() => {
    const form = document.querySelector("#main form");
    if (!form) return ["no form on the page"];
    return document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .filter((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return !!el && form.contains(el);
      })
      .map((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return `${(a as CSSAnimation).animationName ?? "waapi"} on <${el?.tagName.toLowerCase()} class="${el?.getAttribute("class") ?? ""}">`;
      });
  });
  expect(running).toEqual([]);
  await shoot(page, "scr014-refused");
});

test("SCR-016 live: two groups, the countdown, the count, the switch; projection shows the code alone", async ({ context, page }) => {
  await signIn(context, "host", true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("رمز الحضور");
  const code = main(page).locator("p[dir='ltr']").first();
  await expect(code).toHaveText(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  await expect(code.locator("span")).toHaveCount(2);
  await expect(main(page).locator("[data-host-clock]")).toContainText(/يتغيّر بعد \d+:\d{2}/);
  await expect(main(page).getByText("سجَّلوا حضورهم")).toBeVisible();
  await expect(main(page).getByRole("switch", { name: "تسجيل الحضور مفتوح" })).toBeChecked();
  await expect(main(page).getByRole("button", { name: "أبطل هذا الرمز الآن" })).toBeVisible();
  // ★ Nothing overlaps at 390 (the lead's review of d563ee1c): the title and the projection toggle
  // never intersect — the row wraps the toggle under the title when both do not fit — and the two
  // actions are one line each, the same height, as `Host.dc.html` draws them.
  const [title, toggle] = await Promise.all([
    main(page).getByRole("heading", { level: 1 }).boundingBox(),
    main(page).getByRole("button", { name: "اعرض على الشاشة" }).boundingBox(),
  ]);
  const intersects = (a: NonNullable<typeof title>, b: NonNullable<typeof title>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(intersects(title!, toggle!), "the title and the projection toggle overlap").toBe(false);
  const [revoke, manual] = await Promise.all([
    main(page).getByRole("button", { name: "أبطل هذا الرمز الآن" }).boundingBox(),
    main(page).getByRole("button", { name: "تسجيل يدوي" }).boundingBox(),
  ]);
  expect(Math.abs(revoke!.width - manual!.width), "the two actions are equal halves").toBeLessThanOrEqual(1);
  expect(Math.abs(revoke!.height - manual!.height), "revoke's label wraps onto a second line").toBeLessThanOrEqual(1);
  await shoot(page, "scr016-live");

  await main(page).getByRole("button", { name: "اعرض على الشاشة" }).click();
  await expect(main(page).locator("[data-projecting]")).toHaveCount(1);
  await expect(main(page).getByRole("switch")).toBeHidden();
  await expect(code).toBeVisible();
  await shoot(page, "scr016-projecting");
  await main(page).getByRole("button", { name: "إنهاء العرض" }).click();
  await expect(main(page).locator("[data-projecting]")).toHaveCount(0);
});
