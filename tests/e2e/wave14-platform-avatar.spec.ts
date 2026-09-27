// ★ Wave 14's demonstrable M3 (DEC-180 §3, DEC-182; REQ-PRF-008, REQ-PRF-009,
// REQ-PRF-011): Google's photo is COPIED into our storage, never hotlinked.
//
//   · a member who says «نعم» sees their photo in the account menu — served
//     from /api/avatars on our own origin;
//   · a member who says «لا» sees their initial;
//   · a member of ANOTHER org is refused the copy (the same 404 as anything else);
//   · «أزل صورتي» takes it away at once;
//   · ★ no response body anywhere on the member's path carries a Google image
//     URL — asserted, not assumed (DEC-182: bodies — HTML, RSC, JSON).
//
// Both members sign up with a Google `avatar_url` in their metadata, exactly as a
// real Google sign-in writes it, so `provision_member()` stores the source.
//
// ★ THE SPEC PLAYS THE WORKER. CI cannot reach Google, so after the member says
// yes the test does what `import_avatar` does on success: it uploads two WebP
// derivatives under a new version (made by the browser's own canvas encoder —
// no fixture file, no dependency) and calls `record_avatar_copy()`. A live
// worker running beside the suite would fetch the fake source, get a 404 from
// Google, and record nothing — so either state is safe.
//
// Captures (phone project, 390 × 844, viewport screenshots):
//   wave14-platform-account-menu-photo.png     the menu open, our copy in the trigger
//   wave14-platform-account-menu-initials.png  the same for the member who said no
//   wave14-platform-privacy-photo.png          /app/me/privacy's «صورتك الشخصية», a copy
//   wave14-platform-privacy-initials.png       the same, initials and «استخدم صورتي من Google»
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
const PHONE = { width: 390, height: 844 };
const GOOGLE = "googleusercontent";
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
const orgIds: string[] = [];
const userIds: string[] = [];
let tag: string;
let yesEmail: string;
let noEmail: string;
let outsiderEmail: string;
let yesMemberId: string;
let yesSource: string;

async function makeOrg(slug: string, name: string, domain: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'AVT', gen_random_uuid()) returning id`,
    [name, slug],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, domain]);
  orgIds.push(rows[0].id);
  return rows[0].id;
}

async function makeUser(email: string, fullName: string, avatarUrl: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, avatar_url: avatarUrl },
  });
  if (error) throw error;
  userIds.push(data.user.id);
}

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
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const memberIdOf = async (email: string) => (await db.query<{ id: string }>(`select id from public.members where email = $1`, [email])).rows[0].id;

/** Every text body the page receives, for the Google-URL assertion. */
function recordBodies(page: Page): { url: string; body: string }[] {
  const bodies: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    const type = res.headers()["content-type"] ?? "";
    if (!/text|json|javascript|x-component/.test(type)) return;
    try {
      bodies.push({ url: res.url(), body: await res.text() });
    } catch {
      // A redirect or an aborted navigation has no body to read.
    }
  });
  return bodies;
}

async function settle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave14-platform-${name}.png`) });
}

/** What `import_avatar` does on success — two WebP derivatives, then the record. */
async function playTheWorker(page: Page, memberId: string, orgId: string, source: string): Promise<string> {
  const version = String(Date.now());
  for (const size of [96, 192]) {
    const b64 = await page.evaluate((s) => {
      const canvas = document.createElement("canvas");
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, "#1c2b4a");
      g.addColorStop(1, "#c9a45c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "#f6f8fb";
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.4, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(s * 0.25, s * 0.65, s * 0.5, s * 0.35);
      return canvas.toDataURL("image/webp", 0.82).split(",")[1];
    }, size);
    const { error } = await admin.storage
      .from("avatars")
      .upload(`${orgId}/members/${memberId}/${version}/${size}.webp`, Buffer.from(b64, "base64"), { contentType: "image/webp", upsert: true });
    if (error) throw error;
  }
  const { rows } = await db.query<{ r: { status: string } }>(`select public.record_avatar_copy($1, $2::bigint, $3) as r`, [memberId, version, source]);
  expect(rows[0].r.status).toBe("recorded");
  return version;
}

async function accountImage(page: Page) {
  return page.getByRole("button", { name: "حسابي" }).locator("img");
}

let yesOrgId: string;

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  tag = `${testInfo.workerIndex}-${Date.now()}`;

  const domain = `avatar-${tag}.example`;
  yesOrgId = await makeOrg(`avatar-${tag}`, `مؤسسة الصور ${tag}`, domain);
  await makeOrg(`avatar-out-${tag}`, `مؤسسة أخرى ${tag}`, `avatar-out-${tag}.example`);

  yesEmail = `yes@${domain}`;
  noEmail = `no@${domain}`;
  outsiderEmail = `out@avatar-out-${tag}.example`;
  yesSource = `https://lh3.googleusercontent.com/a/ACg8oc-e2e-yes-${tag}=s96-c`;
  await makeUser(yesEmail, "ريم العتيبي", yesSource);
  await makeUser(noEmail, "سالم الحربي", `https://lh3.googleusercontent.com/a/ACg8oc-e2e-no-${tag}=s96-c`);
  await makeUser(outsiderEmail, "عضو من مؤسسة أخرى", `https://lh3.googleusercontent.com/a/ACg8oc-e2e-out-${tag}=s96-c`);
});

test.afterAll(async () => {
  for (const orgId of orgIds) {
    const { data } = await admin.storage.from("avatars").list(`${orgId}/members`, { limit: 1000 });
    for (const member of data ?? []) {
      const { data: versions } = await admin.storage.from("avatars").list(`${orgId}/members/${member.name}`, { limit: 1000 });
      for (const v of versions ?? []) {
        await admin.storage.from("avatars").remove([96, 192].map((s) => `${orgId}/members/${member.name}/${v.name}/${s}.webp`));
      }
    }
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const orgId of orgIds) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("★ «نعم» — the photo is copied, drawn from our origin in the account menu, and never Google's", async ({ page, context }, testInfo) => {
  const bodies = recordBodies(page);
  await page.setViewportSize(PHONE);
  await signIn(context, yesEmail);
  yesMemberId = await memberIdOf(yesEmail);

  await page.goto("/ar/app");
  await settle(page);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "نستخدم صورتك من Google؟", level: 2 })).toBeVisible();
  // ★ The prompt previews nothing: no image in it at all.
  await expect(main.locator('section[aria-labelledby="avatar-import-title"] img')).toHaveCount(0);
  await main.getByRole("button", { name: "نعم، انسخ صورتي" }).click();
  await expect(main.getByRole("heading", { name: "نستخدم صورتك من Google؟" })).toHaveCount(0);

  const [{ avatar_import }] = (await db.query<{ avatar_import: string }>(`select avatar_import from public.members where id = $1`, [yesMemberId])).rows;
  expect(avatar_import).toBe("accepted");

  await playTheWorker(page, yesMemberId, yesOrgId, yesSource);

  await page.goto("/ar/app");
  await settle(page);
  const img = await accountImage(page);
  await expect(img).toHaveAttribute("src", new RegExp(`^/api/avatars/${yesMemberId}\\?v=[0-9]+&s=96$`));
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  // The prompt, once answered, is gone for good.
  await expect(main.getByRole("heading", { name: "نستخدم صورتك من Google؟" })).toHaveCount(0);

  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "حسابي" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await capture(page, "account-menu-photo");
    await page.keyboard.press("Escape");
  }

  await page.goto("/ar/app/me/privacy");
  await settle(page);
  await expect(main.getByRole("heading", { name: "صورتك الشخصية" })).toBeVisible();
  await expect(main.getByRole("button", { name: "أزل صورتي" })).toBeVisible();
  if (testInfo.project.name === "phone") await capture(page, "privacy-photo");

  await page.goto("/ar/app/me");
  await settle(page);
  await page.goto(`/ar/app/members/${yesMemberId}`);
  await settle(page);

  // ★ No response body on the member's path carries a Google image URL.
  expect(bodies.length).toBeGreaterThan(0);
  const leaks = bodies.filter((b) => b.body.includes(GOOGLE)).map((b) => b.url);
  expect(leaks, "a Google image URL reached the browser").toEqual([]);
});

test("★ a member of ANOTHER org is refused the copy — the same bodiless 404 as a bad id", async ({ page, context }) => {
  await signIn(context, outsiderEmail);
  const [{ avatar_version }] = (await db.query<{ avatar_version: string }>(`select avatar_version from public.members where id = $1`, [yesMemberId])).rows;
  const theirs = await page.request.get(`/api/avatars/${yesMemberId}?v=${avatar_version}&s=96`);
  expect(theirs.status()).toBe(404);
  const nonsense = await page.request.get(`/api/avatars/not-a-member?v=1&s=96`);
  expect(nonsense.status()).toBe(404);
  expect(await theirs.text()).toBe(await nonsense.text());

  // The same URL, for a member of the RIGHT org, is our WebP from our origin.
  await signIn(context, noEmail);
  const ours = await page.request.get(`/api/avatars/${yesMemberId}?v=${avatar_version}&s=96`, { maxRedirects: 0 });
  expect(ours.status()).toBe(200);
  expect(ours.headers()["content-type"]).toBe("image/webp");
  expect(ours.headers()["location"]).toBeUndefined();
});

test("«لا» — the initial stays, in the menu and on the privacy page", async ({ page, context }, testInfo) => {
  const bodies = recordBodies(page);
  await page.setViewportSize(PHONE);
  await signIn(context, noEmail);

  await page.goto("/ar/app");
  await settle(page);
  const main = page.locator("#main");
  await main.getByRole("button", { name: "لا، أبقِ الحرف الأول" }).click();
  await expect(main.getByRole("heading", { name: "نستخدم صورتك من Google؟" })).toHaveCount(0);

  await page.goto("/ar/app");
  await settle(page);
  await expect(await accountImage(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "حسابي" })).toContainText("س");
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "حسابي" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await capture(page, "account-menu-initials");
    await page.keyboard.press("Escape");
  }

  await page.goto("/ar/app/me/privacy");
  await settle(page);
  await expect(main.getByRole("button", { name: "استخدم صورتي من Google" })).toBeVisible();
  if (testInfo.project.name === "phone") await capture(page, "privacy-initials");

  expect(bodies.filter((b) => b.body.includes(GOOGLE)).map((b) => b.url)).toEqual([]);
});

test("«أزل صورتي» — removal is immediate: the next render draws the initial, and the route answers 404", async ({ page, context }) => {
  await signIn(context, yesEmail);
  const [{ avatar_version }] = (await db.query<{ avatar_version: string }>(`select avatar_version from public.members where id = $1`, [yesMemberId])).rows;

  await page.goto("/ar/app/me/privacy");
  await settle(page);
  await page.locator("#main").getByRole("button", { name: "أزل صورتي" }).click();
  await expect(page.locator("#main").getByRole("button", { name: "استخدم صورتي من Google" })).toBeVisible();

  await page.goto("/ar/app");
  await settle(page);
  await expect(await accountImage(page)).toHaveCount(0);
  // The storage policy stopped serving it in the statement that cleared the version.
  expect((await page.request.get(`/api/avatars/${yesMemberId}?v=${avatar_version}&s=96`)).status()).toBe(404);
});
