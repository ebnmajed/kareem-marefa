// Wave 29 — the sheet «صورتك» on SCR-021 (DEC-280, DEC-281; REQ-PRF-016 … 019; AVA-04 … 12).
//
//   ★ Every step a member takes is `page.click()` (DEC-093): the way in, the chips, an avatar, «حفظ». The one non-click
//     step is the file chooser's answer (`setInputFiles`), which no pointer can type.
//   1. A pick, saved, is the member's picture in the shell — and after a reload.
//   2. A pick, then a close by a tap on the scrim, changes nothing — not even after a reload.
//   3. «ارفع صورة» opens the crop; «إلغاء» returns to the sheet with nothing changed.
//   The upload end to end with the real worker is `platform`'s spec.
//
// Real local Supabase, one org of its own. Page-level locators from `#main` (DEC-145); the sheet portals into the
// scope, so its locators come from its dialog. Captures land at `.qa-shots/rtl/wave29-content-picture-<state>-390.png`,
// honouring `E2E_SHOTS_DIR`, beside `docs/design/screens/avatars/png/`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
// A 1×1 PNG: enough for the crop to decode and draw.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let memberEmail = "";
let memberId = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `pic29-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'PIC', gen_random_uuid()) returning id`,
    [`مؤسسة الصورة ${tag}`, `pic29-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الصورة" } });
  if (error) throw error;
  userIds.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: memberEmail, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#main [aria-busy=true]")).toHaveCount(0);
}

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `wave29-content-picture-${state}-${page.viewportSize()!.width}.png`) });
}

async function heldKey(): Promise<string> {
  const { rows } = await db.query<{ avatar_key: string }>(`select avatar_key from public.members where id = $1`, [memberId]);
  return rows[0].avatar_key;
}

/** The shell's account avatar, read on the home feed where the phone's top bar draws it. */
async function shellAvatar(page: Page): Promise<string | null> {
  await page.goto("/ar/app");
  await settle(page);
  return page.getByRole("button", { name: "حسابي" }).locator("img").first().getAttribute("src");
}

async function openSheet(page: Page) {
  await page.goto("/ar/app/me");
  await settle(page);
  await page.locator("#main").getByRole("button", { name: "صورتك" }).click();
  const sheet = page.getByRole("dialog", { name: "صورتك" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("★ a library avatar, picked and saved, is the member's picture in the shell", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  const held = await heldKey();
  expect(held, "0221 assigns a library key at creation").toMatch(/^(characters|objects)\//);
  const target = held === "objects/clapper" ? { key: "objects/megaphone", name: "المكبّر" } : { key: "objects/clapper", name: "الكلاكيت" };

  const sheet = await openSheet(page);
  // State C — Google gave nothing: «من Google» is absent; state A — no photo: «أزل الصورة» is absent.
  await expect(sheet.getByRole("button", { name: "من Google" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "أزل الصورة" })).toHaveCount(0);
  await capture(page, "nogoogle");

  await sheet.getByRole("button", { name: "أشياء" }).click();
  await sheet.getByRole("button", { name: target.name }).click();
  await expect(sheet.getByRole("button", { name: target.name })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "حفظ" }).click();
  await expect(sheet).toBeHidden();

  expect(await heldKey()).toBe(target.key);
  expect(await shellAvatar(page)).toBe(`/avatars/${target.key}.svg`);
  await page.reload();
  await settle(page);
  expect(await page.getByRole("button", { name: "حسابي" }).locator("img").first().getAttribute("src")).toBe(`/avatars/${target.key}.svg`);
});

test("★ a pick closed without «حفظ» changes nothing", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  const before = await heldKey();
  // «من Google» appears when Google gave a picture (state A with Google — the artboard's `AvatarPicker`).
  await db.query(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/e2e' where id = $1`, [memberId]);

  const sheet = await openSheet(page);
  await expect(sheet.getByRole("button", { name: "من Google" })).toBeVisible();
  await capture(page, "library");
  const other = before.startsWith("characters/") ? { set: "أشياء", name: "الكشّاف" } : { set: "شخصيات", name: "الممثل" };
  await sheet.getByRole("button", { name: other.set }).click();
  await sheet.getByRole("button", { name: other.name }).click();
  // A tap on the scrim, above the sheet — a pointer, not a key.
  await page.mouse.click(PHONE.width / 2, 24);
  await expect(sheet).toBeHidden();

  expect(await heldKey()).toBe(before);
  expect(await shellAvatar(page)).toBe(`/avatars/${before}.svg`);
});

test("«ارفع صورة» opens the crop, and «إلغاء» returns to the sheet unchanged", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  const before = await heldKey();
  const sheet = await openSheet(page);
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "ارفع صورة" }).click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });

  await expect(sheet.getByRole("slider", { name: "تكبير" })).toBeVisible();
  await capture(page, "crop");
  await sheet.getByRole("button", { name: "إلغاء" }).click();
  await expect(sheet.getByRole("button", { name: "ارفع صورة" })).toBeVisible();
  expect(await heldKey()).toBe(before);
});
