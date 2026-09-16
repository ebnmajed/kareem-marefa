// SCR-011 · /app/sessions — the timeline on its canonical, filterable address
// (REQ-UIX-022, REQ-DSC-003 … REQ-DSC-006, DEC-112, DEC-130). Rewritten in wave
// 6 against the new controls.
//
// What this proves against the real page:
//   · a filter is a URL: a category toggle, a tag chip from the sheet, and
//     removing one of two filters keeps the other (REQ-UIX-022);
//   · applied filters are NAMED, never a raw id;
//   · the phone's filter sheet opens as a bottom sheet with the house fields;
//   · a bookmark toggles in place, keeps its name, and survives a reload.
//
// The 390 px captures — the chip row, and the phone sheet open — are taken on
// the phone project, last in their test.
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
// `E2E_SHOTS_DIR` lets a look-only run against a dev server keep its pictures
// out of the directory the review reads.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

// These pages stream several server reads after a navigation or a server
// action, and the gate runs them while other suites share one local Supabase.
// Five seconds measured the machine, not the page.
const expect = baseExpect.configure({ timeout: 15_000 });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let categoryAiId = "";
let venueId = "";
const userIds: string[] = [];

const AI = "جلسة الذكاء الاصطناعي التوليدي";
const TIME = "جلسة إدارة الوقت الفعّالة";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `browse-e2e-${tag}.example`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة التصفّح', $1, 'BR', gen_random_uuid()) returning id`,
    [`browse-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'ذكاء اصطناعي'), ($1, 'إدارة الوقت') returning id`, [orgId]);
  categoryAiId = catRows[0].id;
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة التصفّح', 40) returning id`, [orgId]);
  venueId = venueRows[0].id;

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values
       ($1, $5, 'نظرة عملية على أدوات الذكاء الاصطناعي.', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days' + interval '1 hour', $4, 30, 'published', now() - interval '1 day'),
       ($1, $6, 'أدوات وعادات لإدارة وقتك بذكاء.', $3, 'advanced', now() + interval '4 days', 60, now() + interval '4 days' + interval '1 hour', $4, 30, 'published', now() - interval '1 day')
     returning id`,
    [orgId, categoryAiId, catRows[1].id, venueId, AI, TIME],
  );
  const { rows: tagRows } = await db.query<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'تقارير', 'تقارير') returning id`, [orgId]);
  await db.query(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [orgId, sessRows[0].id, tagRows[0].id]);

  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو التصفّح" } });
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
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function capture(p: Page, name: string) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // The page must not scroll sideways at 390 px; row A scrolls inside itself.
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} must not scroll sideways`).toBe(true);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `wave6-sessions-${name}.png`), fullPage: true });
}

test("both sessions are on the unfiltered timeline, under one h1", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  await expect(page.getByRole("heading", { level: 1, name: "الجلسات" })).toBeVisible();
  await expect(page.getByText(AI)).toBeVisible();
  await expect(page.getByText(TIME)).toBeVisible();
});

test("★ a category toggle is a link to the filtered URL, pressed once applied, and its × removes it", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  const nav = page.getByRole("navigation", { name: "تصفية الجلسات" });
  // `exact`: once applied, the chip's × is also a link whose name contains the
  // category («أزل عامل التصفية: ذكاء اصطناعي»).
  await nav.getByRole("link", { name: "ذكاء اصطناعي", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`category=${categoryAiId}`));
  await expect(page.getByText(AI)).toBeVisible();
  await expect(page.getByText(TIME)).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "ذكاء اصطناعي", exact: true })).toHaveAttribute("aria-current", "true");

  await page.getByRole("link", { name: "أزل عامل التصفية: ذكاء اصطناعي" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/sessions$/);
  await expect(page.getByText(TIME)).toBeVisible();
});

test("★ two filters, named not by id; removing one keeps the other (REQ-UIX-022)", async ({ context, page }, testInfo) => {
  await signIn(context, memberEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/sessions?venue=${venueId}&level=introductory`);

  const applied = page.getByRole("list", { name: "عوامل التصفية المطبّقة" });
  await expect(applied.getByText("المكان: قاعة التصفّح")).toBeVisible();
  await expect(applied.getByText("المستوى: تمهيدي")).toBeVisible();
  await expect(applied).not.toContainText(venueId);
  await expect(page.getByText(AI)).toBeVisible();
  await expect(page.getByText(TIME)).toHaveCount(0);

  if (testInfo.project.name === "phone") await capture(page, "browse-chips");

  await applied.getByRole("link", { name: "أزل عامل التصفية: المستوى: تمهيدي" }).click();
  await expect(page).toHaveURL(new RegExp(`venue=${venueId}$`));
  await expect(page.getByRole("list", { name: "عوامل التصفية المطبّقة" }).getByText("المكان: قاعة التصفّح")).toBeVisible();
  await expect(page.getByText(TIME)).toBeVisible();
});

test("the filter sheet applies a tag, and the phone gets a bottom sheet", async ({ context, page }, testInfo) => {
  await signIn(context, memberEmail);
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
  await page.goto("/ar/app/sessions");

  await page.getByRole("button", { name: "المزيد من عوامل التصفية" }).click();
  const sheet = page.getByRole("dialog", { name: "عوامل التصفية" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radiogroup", { name: "لغة الجلسة" })).toBeVisible();
  await sheet.getByLabel("الوسم").selectOption({ value: "تقارير" });

  if (testInfo.project.name === "phone") {
    const box = (await sheet.boundingBox())!;
    expect(Math.abs(box.y + box.height - PHONE.height), "a bottom sheet on the phone").toBeLessThan(2);
    await capture(page, "browse-sheet-open");
  }

  await sheet.getByRole("button", { name: "اعرض النتائج" }).click();
  await expect(page).toHaveURL(/tag=/);
  await expect(page.getByRole("list", { name: "عوامل التصفية المطبّقة" }).getByText("الوسم: تقارير")).toBeVisible();
  await expect(page.getByText(AI)).toBeVisible();
  await expect(page.getByText(TIME)).toHaveCount(0);
});

test("a bookmark toggles on the card without navigating, keeps its name, and survives a reload (REQ-DSC-006)", async ({ context, page }) => {
  await signIn(context, memberEmail);
  await page.goto("/ar/app/sessions");
  // Hydrated first: the toggle is a client control.
  await page.waitForLoadState("networkidle");
  const card = page.locator("article", { has: page.getByText(AI) });
  const save = card.getByRole("button", { name: "احفظ الجلسة" });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/ar\/app\/sessions$/);
  // The press is optimistic; the write is the server action behind it. Reload
  // only once it has landed, or the reload races the write.
  await page.waitForLoadState("networkidle");

  await page.reload();
  await expect(page.locator("article", { has: page.getByText(AI) }).getByRole("button", { name: "احفظ الجلسة" })).toHaveAttribute("aria-pressed", "true");
  // Leave it as found, for the other project.
  await page.locator("article", { has: page.getByText(AI) }).getByRole("button", { name: "احفظ الجلسة" }).click();
});
