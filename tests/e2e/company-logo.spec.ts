// DEC-298 — a company's logo, and the company board on a podium (REQ-ADM-026, REQ-UIX-079; `0230`).
//
//   · an admin uploads a logo on SCR-048 through the real sniffed path, and Save binds it;
//   · the company board stands its first three on the podium with the cup, the logo on the first's mark;
//   · the logo route answers the org's member with the image, and a signed-out request with a 404.
// Captures: `.qa-shots/rtl/company-logo-<048|028>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

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
let first = "";
const users: string[] = [];
const desktop = () => test.info().project.name === "desktop";

/** A small real PNG: a dark square on a light ground, so the sniff and the decoder see a genuine image. */
function logoPng(size = 256): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = Buffer.alloc((size + 1) * size, 0xf0);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    if (y >= size / 4 && y < (size * 3) / 4) raw.fill(0x12, y * (size + 1) + 1 + size / 4, y * (size + 1) + 1 + (size * 3) / 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `logo-e2e-${tag}.example`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الشعارات', $1, 'LG', gen_random_uuid()) returning id`,
    [`logo-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  // One active member is enough to be ranked here, so all four companies stand in the race.
  await db.query(`insert into public.org_settings (org_id, company_min_active_members) values ($1, 1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const companies: string[] = [];
  for (const [name, colour] of [
    ["صنف", "#ff9a2e"],
    ["مواهب", "#35d0ff"],
    ["أفق", "#9b7cff"],
    ["نماء", "#3be8b0"],
  ] as const) {
    const { rows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, $2, $3) returning id`, [orgId, name, colour]);
    companies.push(rows[0].id);
  }
  first = companies[0];

  for (const [i, points] of [400, 300, 200, 100].entries()) {
    const email = `${points}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, company_id) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, data.user.id, email, `عضو ${i + 1}`, companies[i]],
    );
    await db.query(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, $3, 'manual_adjustment', 'اختبار', $4)`, [orgId, rows[0].id, points, `e2e:logo:${rows[0].id}`]);
  }

  meEmail = `admin@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email: meEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرف" } });
  if (error) throw error;
  users.push(data.user.id);
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<void> {
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
  await db.query(`update public.members set org_role = 'admin', claims_version = claims_version + 1 where id = $1`, [id]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const newContext = (browser: import("@playwright/test").Browser) =>
  browser.newContext(desktop() ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function capture(page: Page, screen: "048" | "028") {
  mkdirSync(SHOTS, { recursive: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: join(SHOTS, `company-logo-${screen}-${desktop() ? 1280 : 390}.png`), fullPage: true });
}

test("★ an admin uploads a company's logo on SCR-048, and Save binds it", async ({ browser }) => {
  const context = await newContext(browser);
  await signIn(context);
  const page = await context.newPage();
  await page.goto(`/ar/app/admin/companies?edit=${first}#company-editor`);
  // The editor is a sheet (a dialog) with JS; the logo is its own group inside it.
  const editor = page.getByRole("dialog", { name: "عدّل الشركة" });
  const field = editor.getByRole("group", { name: "الشعار" });
  await expect(field).toBeVisible();
  await expect(field).toContainText("بلا شعار");
  await field.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logoPng() });
  await expect(field.locator("[data-slot=company-mark] img")).toBeVisible({ timeout: 30_000 });
  await expect(field.getByRole("button", { name: "أزل الشعار" })).toBeVisible();
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `company-logo-048-sheet-${desktop() ? 1280 : 390}.png`) });
  await editor.getByRole("button", { name: "احفظ", exact: true }).click();

  await expect.poll(async () => (await db.query<{ logo_asset_id: string | null }>(`select logo_asset_id from public.companies where id = $1`, [first])).rows[0]?.logo_asset_id, { timeout: 20_000 }).not.toBeNull();
  const { rows: audit } = await db.query<{ action: string }>(`select action from public.audit_log where subject_id = $1 and action = 'company.logo_changed'`, [first]);
  expect(audit).toHaveLength(1);

  await page.goto("/ar/app/admin/companies");
  const mark = page.locator("#main [data-slot=company-mark] img").filter({ visible: true }).first();
  await expect(mark).toBeVisible();
  await expect.poll(() => mark.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await capture(page, "048");
  await context.close();
});

test("★★ the company board: the first three on the podium with the cup, the logo on the first — the route answers members only", async ({ browser, playwright, baseURL }) => {
  await db.query(`select public.snapshot_leaderboard($1, 'company', date_trunc('quarter', now())::date, (date_trunc('quarter', now()) + interval '3 months')::date, null, false)`, [orgId]);
  const context = await newContext(browser);
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/ar/app/leaderboards?board=companies");

  const board = page.locator("#main #company");
  const places = board.locator("[data-slot=podium] > li");
  await expect(places).toHaveCount(3);
  await expect(places.nth(0)).toContainText("صنف");
  await expect(places.nth(1)).toContainText("مواهب");
  await expect(places.nth(2)).toContainText("أفق");
  const logo = places.nth(0).locator("[data-slot=company-mark] img");
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // The others have no logo: their initial on their colour.
  await expect(places.nth(1).locator("[data-slot=company-mark] img")).toHaveCount(0);
  await expect(board.locator("[data-slot=board-rows] > li")).toHaveCount(1);
  await expect(board.locator("[data-slot=board-rows] > li")).toContainText("نماء");
  await capture(page, "028");

  const src = (await logo.getAttribute("src"))!;
  const member = await page.request.get(src);
  expect(member.status()).toBe(200);
  expect(member.headers()["content-type"]).toBe("image/png");

  // Signed out: the same URL is a 404.
  const stranger = await playwright.request.newContext({ baseURL });
  expect((await stranger.get(src)).status()).toBe(404);
  await stranger.dispose();
  await context.close();
});
