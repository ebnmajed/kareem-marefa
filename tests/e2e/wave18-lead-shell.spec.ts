// Wave 18 — the rebuilt shell (REQ-UIX-054, STORY-UIX-039, DEC-205 §2, DEC-206 §4.30 – §4.36).
//
// Built from `docs/design/screens/m10a/Home.dc.html` (the phone's top row and the
// tab bar) and `HomeDesktop.dc.html` (the top bar and the navigation rail). What is
// held here is the frame's behaviour; the captures beside it are what the lead
// opens against the artboards' own renders.
//
//   · phone: FIVE tabs, by name, the third raised and named «اقترح جلسة»; the
//     current one carries `aria-current`; the bar clears the page's last line;
//   · 1280: no tab bar; the navigation rail with «اقترح جلسة» and four
//     destinations — ★ and from wave 19 «الأعضاء» after «الجلسات», now its route exists (DEC-213 §3.3);
//   · staff: the ruled section with the console's link; a member: no section;
//   · an immersive route wears neither (`shell-routes.ts`, unchanged);
//   · nothing under the root scope is transformed, and the frame causes no
//     sideways scroll at either width.
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const NAV = "التنقّل الرئيسي";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
const users: Record<"member" | "staff", { id: string; email: string }> = { member: { id: "", email: "" }, staff: { id: "", email: "" } };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w18-shell-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الإطار', $1, 'WF', gen_random_uuid()) returning id`,
    [`w18-shell-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [who, name] of [["member", "يمان رضا"], ["staff", "نورة العتيبي"]] as const) {
    const email = `${who}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    users[who] = { id: data.user.id, email };
  }
});

test.afterAll(async () => {
  for (const u of Object.values(users)) if (u.id) await admin.auth.admin.deleteUser(u.id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: "member" | "staff"): Promise<void> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: users[who].email, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  if (who === "staff") {
    await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [(envelope as { member_id: string }).member_id]);
  }
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function settle(page: Page) {
  await expect(page.locator("#main").getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave18-lead-shell-${name}.png`) });
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("phone: five tabs by name, the third raised, and the bar clears the page", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the tab bar is the phone's");
  await signIn(context, "member");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/app/leaderboards");
  await settle(page);

  const bar = page.getByRole("navigation", { name: NAV });
  await expect(bar).toBeVisible();
  const names = await bar.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("aria-label") ?? a.textContent?.trim()));
  expect(names).toEqual(["الرئيسية", "الجلسات", "اقترح جلسة", "الترتيب", "حسابي"]);
  await expect(bar.getByRole("link", { name: "الترتيب" })).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: "الرئيسية" })).not.toHaveAttribute("aria-current", "page");

  // The raised tab stands above the bar's top edge, and is a 56 px target.
  const barBox = (await bar.boundingBox())!;
  const raised = (await bar.getByRole("link", { name: "اقترح جلسة" }).boundingBox())!;
  expect(raised.y).toBeLessThan(barBox.y);
  expect(Math.round(raised.width)).toBe(56);
  expect(Math.round(raised.height)).toBe(56);
  for (const name of ["الرئيسية", "الجلسات", "الترتيب", "حسابي"]) {
    const box = (await bar.getByRole("link", { name }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(44);
  }

  // The page's last line is above the bar — the padding moved with the bar (`16` §3.1).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const mainBottom = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().bottom);
  expect(mainBottom).toBeLessThanOrEqual((await bar.boundingBox())!.y + 1);
  expect(await noSidewaysScroll(page)).toBe(0);

  // The top row: the wordmark leads home (REQ-UIX-027); search and the bell are named.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "كريم معرفة" })).toHaveAttribute("href", "/ar/app");
  await expect(header.getByRole("link", { name: "ابحث في الجلسات" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "phone-390");
});

test("1280: no tab bar; the rail with «اقترح جلسة» and five destinations, «الأعضاء» among them", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the rail is the desktop's");
  await signIn(context, "member");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/ar/app/leaderboards");
  await settle(page);

  const rail = page.getByRole("navigation", { name: NAV });
  await expect(rail).toHaveCount(1); // the tab bar is in the DOM and not displayed: one landmark, not two
  const names = await rail.getByRole("link").evaluateAll((links) => links.map((a) => a.textContent?.trim()));
  expect(names).toEqual(["اقترح جلسة", "الرئيسية", "الجلسات", "الأعضاء", "لوحة الصدارة", "حسابي"]);
  await expect(rail.getByRole("link", { name: "لوحة الصدارة" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByText("الإدارة")).toHaveCount(0); // a member has no staff section

  // 220 px, at the inline start (the right, in Arabic), and the content beside it.
  const railBox = (await rail.boundingBox())!;
  const mainBox = (await page.locator("#main").boundingBox())!;
  expect(Math.round(railBox.width)).toBe(220);
  expect(railBox.x).toBeGreaterThan(mainBox.x + mainBox.width - 1);
  expect(Math.round(railBox.x - (mainBox.x + mainBox.width))).toBe(24);

  // The bar: 64 px, the search field in it, the account menu named.
  const header = page.getByRole("banner");
  expect(Math.round((await header.boundingBox())!.height)).toBe(65); // 64 and its rule
  await expect(header.getByRole("searchbox", { name: "ابحث في الجلسات" })).toBeVisible();
  await expect(header.getByRole("button", { name: "حسابي" })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(0);

  // ★ Nothing under the root scope is transformed, filtered or clipped (DEC-188 §5).
  const moved = await page.evaluate(() => {
    const out: string[] = [];
    for (let el = document.querySelector("#main")?.parentElement; el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.transform !== "none" || s.filter !== "none" || s.overflow !== "visible") out.push(`${el.tagName}.${el.className}`);
    }
    return out;
  });
  expect(moved).toEqual([]);
  await shot(page, "desktop-1280");
});

test("staff: the ruled section with the console's link; an immersive route wears neither bar nor rail", async ({ context, page }, testInfo) => {
  await signIn(context, "staff");
  const desktop = testInfo.project.name === "desktop";
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto("/ar/app/leaderboards");
  await settle(page);

  const nav = page.getByRole("navigation", { name: NAV });
  if (desktop) {
    await expect(nav.getByText("الإدارة", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /لوحة الإدارة/ })).toHaveAttribute("href", "/ar/app/admin");
    await shot(page, "desktop-1280-staff");
  } else {
    // The phone keeps the account menu until `/app/me` carries these (DEC-206 §4.33).
    await page.getByRole("banner").getByRole("button", { name: "حسابي" }).click();
    await expect(page.getByRole("menuitem", { name: "لوحة الإدارة" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "تسجيل الخروج" })).toBeVisible();
    await page.keyboard.press("Escape");
  }

  // The console has its own rail: the member's never stands beside it.
  await page.goto("/ar/app/admin");
  await expect(page.locator("#main").getByRole("heading", { level: 1 }).first()).toBeVisible();
  if (desktop) await expect(page.getByRole("navigation", { name: NAV })).toHaveCount(0);
});
