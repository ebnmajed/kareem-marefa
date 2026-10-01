// SCR-017 · /app/propose — rebuilt in wave 19 from `Propose.dc.html` (REQ-UIX-067, STORY-UIX-055, DEC-213, DEC-214).
// The older specs stay as evidence (`sessions-propose`, `forms-propose`, `wave7-sessions-propose`); this one holds
// what the rebuild adds:
//
//   · the regions in the artboard's order — the title row, the lead in the display face, the body, the no-schedule
//     panel, the progress line, the two numbered sections, the earn panel, the bar;
//   · ★ the earn panel's figure is the org's rules (+60 when the two presenter rules are 10 and 50 — never the
//     drawing's «+100»), with the org's own first-session badge, and ABSENT when the rules pay nothing;
//   · the level is three chips; nothing autosaves (no «مسودة محفوظة»);
//   · «مقترحاتي N» and the list ABOVE the form once the member has a proposal;
//   · ★ on the phone the bar stands ON the tab bar, never under it (DEC-214 §3).
//
// Captures: `wave19-sessions-propose-<state>-390.png` — empty, list, error.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let userId = "";
let email = "";
let memberId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w19-propose-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاقتراح', $1, 'WP', gen_random_uuid()) returning id`, [`w19-propose-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.categories (org_id, name) values ($1, 'إداري')`, [orgId]);
  // Read, never a literal: 10 + 50 here, so the drawing's «+100» on screen is a defect.
  await db.query(`update public.scoring_rules set points = 10, enabled = true where org_id = $1 and action_key = 'proposal_accepted'`, [orgId]);
  await db.query(`update public.scoring_rules set points = 50, enabled = true where org_id = $1 and action_key = 'session_delivered'`, [orgId]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;
  memberId = await provision();
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

let cookies: { name: string; value: string }[] = [];

async function provision(): Promise<string> {
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
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  cookies = [...jar];
  return (data as { member_id: string }).member_id;
}

async function signIn(context: BrowserContext) {
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(p: Page) {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto("/ar/app/propose");
  await expect(p.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await p.evaluate(() => document.fonts.ready);
}

async function capture(p: Page, state: string) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `wave19-sessions-propose-${state}-390.png`), fullPage: true });
}

/** The vertical order of the located elements, top first. */
async function tops(locators: ReturnType<Page["locator"]>[]): Promise<number[]> {
  const out: number[] = [];
  for (const l of locators) out.push((await l.boundingBox())!.y);
  return out;
}

test("the regions in the artboard's order, and the earn panel read from the rules", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the artboard is a phone board");
  await signIn(context);
  await open(page);
  const main = page.locator("#main");

  const order = await tops([
    main.getByRole("heading", { level: 1, name: "اقترح موضوعًا" }),
    main.getByText("لست بحاجة لأن تكون خبيرًا."),
    main.getByText(/لا تحتاج لاختيار موعد أو مكان/),
    main.getByText("المتبقّي: 3 حقول مطلوبة"),
    main.getByRole("heading", { level: 2, name: /الموضوع/ }),
    main.getByRole("heading", { level: 2, name: /المُقدِّمون والملاحظات/ }),
    main.getByText("للتقديم، تُدفع عند اكتمال جلستك.", { exact: false }),
  ]);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // ★ +60, the org's two rules — not the drawing's +100 — and the org's own badge by its name.
  await expect(main.getByText("+60", { exact: true })).toBeVisible();
  await expect(main.getByText(/وتنال شارة «أول جلسة» مع أولى جلساتك/)).toBeVisible();
  await expect(main.getByText("+100")).toHaveCount(0);

  // The level is three chips; nothing claims to have autosaved; no list before there is a proposal.
  await expect(main.getByRole("radiogroup", { name: /مستوى الجلسة/ }).getByRole("radio")).toHaveCount(3);
  await expect(main.getByText(/مسودة محفوظة/)).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "مقترحاتي" })).toHaveCount(0);

  // ★ The bar stands ON the tab bar (DEC-214 §3): its bottom edge is at or above the tab bar's top.
  const bar = (await page.getByRole("group", { name: "إجراءات المقترح" }).boundingBox())!;
  const tabs = (await page.locator("[data-tab-bar]").boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(tabs.y + 1);
  await expect(page.getByRole("button", { name: "أرسل المقترح" })).toBeVisible();

  await capture(page, "empty");
});

test("a failed submit: the summary takes focus and says how many", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the artboard is a phone board");
  await signIn(context);
  await open(page);
  await page.getByRole("button", { name: "أرسل المقترح" }).click();
  const summary = page.locator("form[novalidate] [role=alert]");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("لم نستطع إرسال المقترح");
  await capture(page, "error");
});

test("a saved proposal: «مقترحاتي 1» in the title row and the list above the form", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the artboard is a phone board");
  await signIn(context);
  await open(page);
  const main = page.locator("#main");
  await main.getByLabel("عنوان الموضوع المقترح").fill("كيف اختصرنا وقت إعداد التقارير إلى النصف");
  await main.getByLabel("نبذة عن موضوعك").fill("قبل سنة كان تقرير الأداء الشهري يأخذ أربعة أيام من شخصين.");
  await main.getByLabel("تصنيف الموضوع").selectOption({ label: "إداري" });
  await main.getByText("متوسط", { exact: true }).click();
  await page.getByRole("button", { name: "احفظ كمسودة" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("status").filter({ hasText: "حُفظ مقترحك كمسودة" })).toBeVisible();

  const [{ level }] = (await db.query<{ level: string }>(`select level from public.proposals where proposer_id = $1`, [memberId])).rows;
  expect(level).toBe("intermediate");

  await open(page);
  await expect(main.getByRole("link", { name: "مقترحاتي 1" })).toHaveAttribute("href", "#mine");
  const [list, form] = await tops([main.getByRole("heading", { level: 2, name: /مقترحاتي/ }), main.getByRole("heading", { level: 2, name: /الموضوع/ })]);
  expect(list).toBeLessThan(form);
  await expect(main.getByRole("link", { name: /كيف اختصرنا وقت إعداد التقارير/ })).toBeVisible();
  await capture(page, "list");
});

test("★ the earn panel is absent when the rules pay nothing — never a «+0»", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the artboard is a phone board");
  await db.query(`update public.scoring_rules set enabled = false where org_id = $1 and action_key in ('proposal_accepted', 'session_delivered')`, [orgId]);
  try {
    await signIn(context);
    await open(page);
    await expect(page.locator("#main").getByText(/للتقديم، تُدفع/)).toHaveCount(0);
    await expect(page.locator("#main").getByText("+0")).toHaveCount(0);
  } finally {
    await db.query(`update public.scoring_rules set enabled = true where org_id = $1 and action_key in ('proposal_accepted', 'session_delivered')`, [orgId]);
  }
});
