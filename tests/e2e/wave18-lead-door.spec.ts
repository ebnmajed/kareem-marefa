// Wave 18 — the door, rebuilt (REQ-UIX-058, STORY-UIX-042, DEC-206 §4.37 – §4.41).
//
// `SCR-002`, `SCR-003` and `SCR-004` from `docs/design/screens/m10a/{Main,ChooseOrg,NoAccess}.dc.html`.
// `auth-screens.spec.ts` and `auth.spec.ts` hold the behaviour that survived, with no
// expectation changed; this file holds what the rebuild ADDED and what it refused,
// and takes the captures the lead holds beside the artboards:
//
//   · sign-in names NO org (the artboard writes one under the wordmark);
//   · sign-in's regions stand in the artboard's order: the mark, the panel with
//     one action and the line that explains it, the carried-destination panel,
//     the legal links at the foot;
//   · no-access shows the visitor their OWN address, masked to its first
//     character and isolated left-to-right — and still no org and no listed domain;
//   · choose-org says WHY the choice is permanent, offers «الدخول بحساب آخر», and
//     writes no domain under an org's name.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "platform unconfigured: covered by unconfigured.spec.ts");

const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

async function shot(page: Page, name: string, width: 390 | 1280) {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // ★ wave 26 (ledger E5): sign-in's mark draws itself in on load (REQ-UIX-119) — the picture is of the door at
  // rest, so it waits for the reveal to finish.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await page.screenshot({ path: join(SHOTS, `wave18-lead-door-${name}-${width}.png`), fullPage: true });
}

async function at(page: Page, testInfo: { project: { name: string } }): Promise<390 | 1280> {
  const width = testInfo.project.name === "phone" ? 390 : 1280;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  return width;
}

test.describe("signed out", () => {
  test("sign-in: the artboard's regions in its order, one action, and no org named", async ({ page }, testInfo) => {
    const width = await at(page, testInfo);
    await page.goto("/ar/sign-in?next=/ar/app/sessions");
    const main = page.locator("main");

    // Top to bottom: the wordmark, the title, the action, its explanation, the carried panel, the legal links.
    const order = await Promise.all(
      [
        main.getByRole("link", { name: "كريم معرفة" }),
        main.getByRole("heading", { level: 1, name: "الدخول إلى كريم معرفة" }),
        main.getByRole("button", { name: "الدخول عبر Google" }),
        main.getByText("لا كلمة مرور ولا رابط بريد", { exact: false }),
        main.getByText("مسحت ملصق جلسة؟", { exact: false }),
        main.getByRole("link", { name: "سياسة الخصوصية" }),
      ].map(async (l) => (await l.boundingBox())!.y),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await expect(main.getByRole("button")).toHaveCount(1);
    await expect(main.locator('input[name="next"]')).toHaveValue("/ar/app/sessions"); // REQ-AUT-005
    // The action is described by the line under it, so «what happens next» is announced with it.
    await expect(main.getByRole("button", { name: "الدخول عبر Google" })).toHaveAttribute("aria-describedby", "sign-in-explain");
    // ★ DEC-206 §4.37: the door does not know the org.
    await expect(main).not.toContainText("شبه الجزيرة");
    expect(await main.innerText()).not.toMatch(/[٠-٩۰-۹]/);

    // The links are pinned to the foot of a short screen, as drawn.
    const foot = (await main.getByRole("link", { name: "الشروط والأحكام" }).boundingBox())!;
    expect(foot.y + foot.height).toBeGreaterThan((width === 390 ? 844 : 900) - 80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, "sign-in", width);

    await page.goto("/ar/sign-in?error=domain");
    // The error is in the page, above the button — never a toast.
    const alert = main.getByRole("alert");
    expect((await alert.boundingBox())!.y).toBeLessThan((await main.getByRole("button").boundingBox())!.y);
    await shot(page, "sign-in-error", width);
  });

  test("no-access, signed out: the frame, two actions and the way home — and no address to show", async ({ page }, testInfo) => {
    const width = await at(page, testInfo);
    await page.goto("/ar/no-access");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("لا يمكن الدخول");
    await expect(main.getByRole("button", { name: "الدخول بحساب آخر" })).toBeVisible();
    await expect(main.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
    await expect(main.getByRole("link", { name: "العودة للرئيسية" })).toBeVisible();
    await expect(main.getByText("دخلت بـ", { exact: false })).toHaveCount(0);
    await shot(page, "no-access-signed-out", width);
  });
});

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";

test.describe("signed in, with no org or with two", () => {
  test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
  test.describe.configure({ mode: "serial" });

  let db: pg.Client;
  let admin: ReturnType<typeof createClient>;
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let stranger = "";
  let ambiguous = "";

  test.beforeAll(async ({}, testInfo) => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
    db = new pg.Client(DB_URL);
    await db.connect();
    const tag = `${testInfo.workerIndex}-${Date.now()}`;
    const domain = `w18-door-${tag}.example`;
    for (const [name, prefix] of [["شبه الجزيرة", "PP"], ["مؤسسة الشمال", "NO"]] as const) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, $3, gen_random_uuid()) returning id`,
        [name, `w18-door-${prefix.toLowerCase()}-${tag}`, prefix],
      );
      orgIds.push(rows[0].id);
      await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
      await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, domain]);
    }
    ambiguous = `member@${domain}`;
    // A domain on no org's list: the visitor `SCR-004` exists for.
    stranger = `yaman@w18-nowhere-${tag}.example`;
    for (const email of [ambiguous, stranger]) {
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
      if (error) throw error;
      userIds.push(data.user.id);
    }
  });

  test.afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    for (const id of orgIds) await db.query(`delete from public.orgs where id = $1`, [id]);
    await db.end();
  });

  async function signInUnprovisioned(context: BrowserContext, email: string) {
    const jar: { name: string; value: string }[] = [];
    const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
      cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
    });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  }

  test("★ no-access shows the visitor their own address, masked — and names no org and no listed domain", async ({ context, page }, testInfo) => {
    const width = await at(page, testInfo);
    await signInUnprovisioned(context, stranger);
    await page.goto("/ar/no-access");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("لا يمكن الدخول");

    const domain = stranger.slice(stranger.indexOf("@"));
    const address = main.locator("bdi[dir=ltr]");
    await expect(address).toHaveText(`y•••${domain}`);
    await expect(main).not.toContainText("yaman"); // only the first character
    await expect(main.getByText("هذا الحساب ليس على قائمة أي مؤسسة", { exact: false })).toBeVisible();
    // REQ-AUT-006: no org's name, and no domain that is on a list.
    await expect(main).not.toContainText("شبه الجزيرة");
    await expect(main).not.toContainText("مؤسسة الشمال");
    await expect(main).not.toContainText("w18-door-");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, "no-access", width);
  });

  test("choose-org: names with an initial, why the choice is permanent, another account — and no domain under a name", async ({ context, page }, testInfo) => {
    const width = await at(page, testInfo);
    await signInUnprovisioned(context, ambiguous);
    await page.goto("/ar/choose-org");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("اختر مؤسستك");

    const group = main.getByRole("radiogroup", { name: "مؤسستك" });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(group.getByRole("radio").first()).toBeChecked();
    // A radio's name is the org's name alone: the tile's initial is decoration.
    await expect(group.getByRole("radio", { name: "شبه الجزيرة", exact: true })).toHaveCount(1);
    await expect(group.getByRole("radio", { name: "مؤسسة الشمال", exact: true })).toHaveCount(1);
    // ★ DEC-206 §4.39: no domain is written under a name.
    await expect(main).not.toContainText("@");

    await expect(main.getByText("حسابك يبقى في هذه المؤسسة إلى الأبد", { exact: false })).toBeVisible();
    await expect(main.getByRole("button", { name: "تأكيد الاختيار" })).toBeVisible();
    await expect(main.getByRole("button", { name: "الدخول بحساب آخر" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, "choose-org", width);
  });
});
