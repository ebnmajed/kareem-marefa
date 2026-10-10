// Wave 29, PR B — the picture through the REAL worker (DEC-280 §2, DEC-281; REQ-PRF-017, REQ-PRF-019; STORY-PRF-011, 012).
//
// The demonstrable the brief names: a member uploads and crops a photo and sees it everywhere — measured from the
// route's 202 to the worker's record; «أزل الصورة» deletes the object and shows the library avatar; an SVG labelled
// PNG is refused after it lands. Gated on `E2E_WORKER=1`: with no worker consuming `avatar:{member}`, there is nothing
// to prove. Captures at `.qa-shots/rtl/wave29-lead-upload-*-390.png`, honouring `E2E_SHOTS_DIR`.
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
test.skip(process.env.E2E_WORKER !== "1", "proves the REAL worker pipeline — nothing to assert without one (E2E_WORKER=1)");

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
  const domain = `up29-e2e-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'UPL', gen_random_uuid()) returning id`,
    [`مؤسسة الرفع ${tag}`, `up29-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  memberEmail = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: memberEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الرفع" } });
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

async function openSheet(page: Page) {
  await page.goto("/ar/app/me");
  await settle(page);
  await page.locator("#main").getByRole("button", { name: "صورتك" }).click();
  const sheet = page.getByRole("dialog", { name: "صورتك" });
  await expect(sheet).toBeVisible();
  return sheet;
}

const row = async () =>
  (await db.query<{ avatar_key: string | null; avatar_source: string | null; avatar_version: string | null }>(
    `select avatar_key, avatar_source, avatar_version from public.members where id = $1`,
    [memberId],
  )).rows[0];

/** Every object under the member's prefix in `avatars`, through the service role — what Storage actually holds. */
async function stored(): Promise<string[]> {
  const prefix = `${orgId}/members/${memberId}`;
  const { data: versions } = await admin.storage.from("avatars").list(prefix);
  const out: string[] = [];
  for (const v of versions ?? []) {
    const { data: files } = await admin.storage.from("avatars").list(`${prefix}/${v.name}`);
    for (const f of files ?? []) out.push(`${v.name}/${f.name}`);
  }
  return out.sort();
}

test("★★ a member uploads and crops a photo, and it is their picture everywhere — through the real worker", async ({ context, page }, testInfo) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  const sheet = await openSheet(page);
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "ارفع صورة" }).click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(sheet.getByRole("slider", { name: "تكبير" })).toBeVisible();

  const posted = page.waitForResponse((r) => r.url().endsWith("/api/avatars/upload") && r.request().method() === "POST");
  await sheet.getByRole("button", { name: "حفظ" }).click();
  const response = await posted;
  expect(response.status()).toBe(202);
  const accepted = Date.now();

  // The worker records it: the row says `upload`, the sheet closes, and the time from the route's answer is measured.
  await expect.poll(async () => (await row()).avatar_source, { timeout: 30_000 }).toBe("upload");
  const recordedMs = Date.now() - accepted;
  await expect(sheet).toBeHidden({ timeout: 30_000 });
  const shownMs = Date.now() - accepted;
  testInfo.annotations.push({ type: "upload", description: `recorded ${recordedMs} ms after the route's 202; the sheet closed at ${shownMs} ms` });
  console.log(`UPLOAD recorded ${recordedMs} ms, sheet closed ${shownMs} ms`);

  // Exactly one version is stored — its two WebP sizes — and neither carries EXIF.
  const version = (await row()).avatar_version!;
  await expect.poll(stored, { timeout: 15_000 }).toEqual([`${version}/192.webp`, `${version}/96.webp`]);
  for (const size of [96, 192]) {
    const { data } = await admin.storage.from("avatars").download(`${orgId}/members/${memberId}/${version}/${size}.webp`);
    const bytes = Buffer.from(await data!.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(bytes.includes(Buffer.from("Exif", "latin1")), `${size} carries EXIF`).toBe(false);
  }

  // The shell draws our copy — same-origin, versioned — and it loads.
  await page.goto("/ar/app");
  await settle(page);
  const img = page.getByRole("button", { name: "حسابي" }).locator("img").first();
  await expect(img).toHaveAttribute("src", new RegExp(`^/api/avatars/${memberId}\\?v=${version}&s=96$`));
  const served = await page.request.get((await img.getAttribute("src"))!);
  expect(served.status()).toBe(200);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "wave29-lead-upload-shell-390.png") });
});

test("★ «أزل الصورة» deletes the photo and shows the library avatar the member holds", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  const before = await row();
  expect(before.avatar_source).toBe("upload");
  const sheet = await openSheet(page);
  await page.screenshot({ path: join(SHOTS, "wave29-lead-upload-photo-sheet-390.png") });
  await sheet.getByRole("button", { name: "أزل الصورة" }).click();
  await sheet.getByRole("button", { name: "حفظ" }).click();
  await expect(sheet).toBeHidden();

  const after = await row();
  expect(after).toEqual({ avatar_key: before.avatar_key, avatar_source: null, avatar_version: null });
  // The reconcile deletes the bytes, on the real worker.
  await expect.poll(stored, { timeout: 30_000 }).toEqual([]);
  await page.goto("/ar/app");
  await settle(page);
  await expect(page.getByRole("button", { name: "حسابي" }).locator("img").first()).toHaveAttribute("src", `/avatars/${before.avatar_key}.svg`);
});

test("★ an SVG sent as a PNG is refused AFTER it lands — the worker's sniff, not the route's", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  memberId = await signIn(context);
  await page.goto("/ar/app/me");
  await settle(page);
  const result = await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
    const post = await fetch("/api/avatars/upload", { method: "POST", headers: { "content-type": "image/png" }, body: svg });
    const { uploadId } = (await post.json()) as { uploadId: string };
    for (let i = 0; i < 60; i += 1) {
      const res = await fetch(`/api/avatars/upload/${uploadId}`);
      const body = (await res.json()) as { state: string };
      if (body.state !== "pending") return { status: post.status, state: body.state };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { status: post.status, state: "timeout" };
  });
  expect(result).toEqual({ status: 202, state: "refused" });
  expect((await row()).avatar_source).toBeNull();
  // The staged file is gone too.
  const { data } = await admin.storage.from("avatar-staging").list(`${orgId}/members/${memberId}`);
  expect(data ?? []).toEqual([]);
});
