// SCR-013, the viewer rebuilt from `Viewer.dc.html` and `ViewerDesktop.dc.html` (wave 19, REQ-UIX-065,
// STORY-UIX-053, DEC-213, DEC-214) — against REAL local Supabase and Storage. Seeded through SQL and the Storage
// API, as `materials.spec.ts` is; the worker's pipeline is not this spec's.
//
// ★★ Two things a jsdom cannot prove, and this spec does:
//   1. «next» advances AND sits at the inline-end — left, in Arabic — measured by its box, at 390 and at 1280;
//      on desktop ← is next and → previous. The old file's «الصفحة التالية» was disabled on page 1 in RTL.
//   2. A member denied download receives NO URL: not merely no button — the document carries no signed
//      `materials` URL, and the exact call `getMaterialDownloadUrl()` makes, made as that member, is refused by
//      Storage, while the session's presenter making it is answered (the control that keeps this from being
//      vacuous). An admin's download is audited (`0049`).
//
// Captures: `.qa-shots/rtl/wave19-content-viewer-<state>-<390|1280>.png`, honouring `E2E_SHOTS_DIR`, after the
// streams settle. Skipped without local Supabase (`npm run test:e2e:local`).
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 820 };
// A genuine 1×1 WebP; the page's box comes from `material_pages.width`/`height`, as a real render's does.
const TINY_WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
const material: Record<"open" | "denied" | "rendering" | "failed", { id: string; sourcePath: string }> = {
  open: { id: "", sourcePath: "" },
  denied: { id: "", sourcePath: "" },
  rendering: { id: "", sourcePath: "" },
  failed: { id: "", sourcePath: "" },
};
const emails = { presenter: "", member: "", admin: "" };
const userIds: string[] = [];

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

async function memberClient(email: string) {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function provisionMemberId(email: string): Promise<string> {
  const client = await memberClient(email);
  const { data, error } = await client.rpc("provision_member");
  if (error) throw error;
  return (data as { member_id: string }).member_id;
}

async function seedMaterial(key: keyof typeof material, presenterId: string, opts: { allowDownload: boolean; renderStatus: string; pages: number }) {
  const titles = { open: "الشرائح — الأرقام التي تكذب", denied: "شرائح لا تُحمَّل", rendering: "شرائح قيد التجهيز", failed: "شرائح تعذّر تجهيزها" } as const;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, render_status, allow_download, added_by)
     values ($1, $2, 'pdf', $3, 'after', $4, $5, $6) returning id`,
    [orgId, sessionId, titles[key], opts.renderStatus, opts.allowDownload, presenterId],
  );
  const id = rows[0].id;
  const versionId = randomUUID();
  const sourcePath = `${orgId}/sessions/${sessionId}/materials/${versionId}/deck.pdf`;
  await uploadObject("materials", sourcePath, Buffer.from("%PDF-1.4\n%seed\n"), "application/pdf");
  await db.query(
    `insert into public.material_versions (id, org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, $3, 1, $4, 15, 'application/pdf', $5, $6)`,
    [versionId, orgId, id, sourcePath, "b".repeat(64), presenterId],
  );
  await db.query(`update public.materials set current_version_id = $1 where id = $2`, [versionId, id]);
  for (let n = 1; n <= opts.pages; n += 1) {
    const imagePath = `${orgId}/sessions/${sessionId}/pages/${versionId}/${n}.webp`;
    const thumbPath = `${orgId}/sessions/${sessionId}/pages/${versionId}/thumbs/${n}.webp`;
    await uploadObject("material-pages", imagePath, TINY_WEBP, "image/webp");
    await uploadObject("material-pages", thumbPath, TINY_WEBP, "image/webp");
    await db.query(
      `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height) values ($1, $2, $3, $4, $5, 1600, 1200)`,
      [orgId, versionId, n, imagePath, thumbPath],
    );
  }
  material[key] = { id, sourcePath };
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `viewer-e2e-${tag}.example`;
  emails.presenter = `presenter@${domain}`;
  emails.member = `member@${domain}`;
  emails.admin = `admin@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة العارض', $1, 'VW', gen_random_uuid()) returning id`,
    [`viewer-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: companyRows } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'جذر', '#3be8b0') returning id`, [orgId]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'بيانات') returning id`, [orgId]);
  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, capacity, state, published_at, custom_venue_name)
     values ($1, 'الأرقام التي تكذب', 'ملخص', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour', 30, 'completed', now() - interval '3 days', 'قاعة الاختبار')
     returning id`,
    [orgId, catRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [emails.presenter, "محمد الدوسري"],
    [emails.member, "ريم العتيبي"],
    [emails.admin, "هند المطيري"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  const presenterId = await provisionMemberId(emails.presenter);
  await provisionMemberId(emails.member);
  const adminId = await provisionMemberId(emails.admin);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminId]);
  await db.query(`update public.members set company_id = $1 where id = $2`, [companyRows[0].id, presenterId]);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);

  await seedMaterial("open", presenterId, { allowDownload: true, renderStatus: "ready", pages: 24 });
  await seedMaterial("denied", presenterId, { allowDownload: false, renderStatus: "ready", pages: 3 });
  await seedMaterial("rendering", presenterId, { allowDownload: true, renderStatus: "rendering", pages: 0 });
  await seedMaterial("failed", presenterId, { allowDownload: true, renderStatus: "failed", pages: 0 });
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const indicator = (page: Page) => main(page).getByTestId("page-indicator");

const PAGES = { open: 24, denied: 3, rendering: 0, failed: 0 } as const;

async function open(page: Page, key: keyof typeof material) {
  await page.goto(`/ar/app/sessions/${sessionId}/materials/${material[key].id}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  const total = PAGES[key];
  if (total > 0) await hydrated(page, total);
}

/** The keys and the buttons are attached on hydration, and `networkidle` never arrives on this page (the gate's
 *  first run, `02cca532`). So wait for what hydration DOES: End and Home are idempotent, and once End reaches the
 *  last page the viewer is live; Home then puts it back on page 1 for the case. */
async function hydrated(page: Page, total: number) {
  const at = (n: number) => new RegExp(`(^|\\D)${n}\\D+${total}(\\D|$)`);
  await expect(async () => {
    await page.keyboard.press("End");
    await expect(indicator(page)).toHaveText(at(total), { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press("Home");
  await expect(indicator(page)).toHaveText(at(1));
}

async function shoot(page: Page, state: string, width: 390 | 1280) {
  await page.screenshot({ path: join(SHOTS, `wave19-content-viewer-${state}-${width}.png`), fullPage: false });
}


test("★★ ar at 390: «الصفحة التالية» moves the page from 1 to 2, sits LEFT of «السابقة» and points left", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, "open");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(indicator(page)).toHaveText(/1.*24/);

  const next = main(page).getByRole("button", { name: "الصفحة التالية", exact: true });
  const previous = main(page).getByRole("button", { name: "الصفحة السابقة", exact: true });
  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();

  // At the inline-end: in Arabic that is the LEFT edge of the row.
  const nextBox = (await next.boundingBox())!;
  const previousBox = (await previous.boundingBox())!;
  expect(nextBox.x).toBeLessThan(previousBox.x);
  // The forward chevron mirrors in RTL: it points left.
  const glyph = next.locator("svg");
  await expect(glyph).toHaveAttribute("data-direction", "forward");
  // Tailwind 4's `-scale-x-100` writes the individual `scale` property, not `transform`; either is a mirror.
  const mirror = await glyph.evaluate((el) => ({ scale: getComputedStyle(el).scale, transform: getComputedStyle(el).transform }));
  expect(/^-1(\s|$)/.test(mirror.scale) || /^matrix\(-1, 0, 0, 1/.test(mirror.transform), JSON.stringify(mirror)).toBe(true);

  await next.click();
  await expect(indicator(page)).toHaveText(/2.*24/);
  await next.click();
  await expect(indicator(page)).toHaveText(/3.*24/);
  await previous.click();
  await expect(indicator(page)).toHaveText(/2.*24/);

  // Never sideways at 390.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await previous.click();
  await shoot(page, "ready", 390);
});

test("the phone's chrome: a tap hides the bars, a key brings them back; under reduced motion nothing slides", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, "open");
  const header = main(page).locator("header");
  const pageImage = main(page).locator(`img[alt^="الشرائح"]`);

  await pageImage.click();
  await expect(header).toHaveCSS("opacity", "0");
  await expect(header).not.toHaveAttribute("aria-hidden", /.*/);
  await shoot(page, "chrome-hidden", 390);
  await page.keyboard.press("Shift");
  await expect(header).toHaveCSS("opacity", "1");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await pageImage.click();
  await expect(header).toHaveCSS("opacity", "0");
  await expect(header).toHaveCSS("transform", "none");
  await page.keyboard.press("Tab");
  await expect(header).toHaveCSS("opacity", "1");
});

test("★★ at 1280: ← is next and → previous; Page Down/Up and Home/End; the rail at the inline-start", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.member);
  await open(page, "open");
  const scrubberless = main(page).locator("footer");
  await expect(scrubberless).toContainText(/صفحة\s*1\s*من\s*24/);

  await page.keyboard.press("ArrowLeft");
  await expect(scrubberless).toContainText(/صفحة\s*2\s*من\s*24/);
  await page.keyboard.press("ArrowRight");
  await expect(scrubberless).toContainText(/صفحة\s*1\s*من\s*24/);
  await page.keyboard.press("PageDown");
  await expect(scrubberless).toContainText(/صفحة\s*2\s*من\s*24/);
  await page.keyboard.press("PageUp");
  await expect(scrubberless).toContainText(/صفحة\s*1\s*من\s*24/);
  await page.keyboard.press("End");
  await expect(scrubberless).toContainText(/صفحة\s*24\s*من\s*24/);
  await page.keyboard.press("Home");
  await expect(scrubberless).toContainText(/صفحة\s*1\s*من\s*24/);

  // Alt+← is the browser's Back, never the viewer's: the viewer leaves it alone and turns no page.
  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(scrubberless).toContainText(/صفحة\s*1\s*من\s*24/);

  // The rail at the inline-start — the RIGHT, in Arabic — with the next control at the left.
  const rail = main(page).getByRole("list", { name: "الصفحات" });
  const railBox = (await rail.boundingBox())!;
  const pageBox = (await main(page).locator(`img[alt^="الشرائح"]`).boundingBox())!;
  expect(railBox.x).toBeGreaterThan(pageBox.x + pageBox.width);
  const nextBox = (await main(page).getByRole("button", { name: "الصفحة التالية", exact: true }).boundingBox())!;
  expect(nextBox.x + nextBox.width).toBeLessThanOrEqual(pageBox.x);

  // Every presenter on the line, with the company (contract 8).
  await expect(main(page).locator("header")).toContainText("محمد الدوسري");
  await expect(main(page).locator("header")).toContainText("جذر");
  await shoot(page, "ready", 1280);
});

test("★★ REQ-MAT-005: a member denied download receives no signed URL — not merely no button", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);

  // The payload the document carried, RSC included.
  const bodies: string[] = [];
  page.on("response", async (res) => {
    if (res.url().startsWith("http://localhost") && /text\/(html|x-component)/.test(res.headers()["content-type"] ?? "")) bodies.push(await res.text().catch(() => ""));
  });
  await open(page, "denied");
  await expect(indicator(page)).toHaveText(/1.*3/);

  // (1) No control.
  await expect(main(page).getByRole("button", { name: /تحميل/ })).toHaveCount(0);
  // (2) No URL in anything the page was sent.
  bodies.push(await page.content());
  for (const body of bodies) expect(body).not.toContain("/object/sign/materials/");

  // (3) The URL itself: the exact call getMaterialDownloadUrl() makes, made AS this member, is refused…
  const asMember = await memberClient(emails.member);
  const refused = await asMember.storage.from("materials").createSignedUrl(material.denied.sourcePath, 300);
  expect(refused.data?.signedUrl ?? null).toBeNull();
  expect(refused.error).not.toBeNull();
  // …while the session's presenter, whom the policy names, is answered — so the refusal is the policy's.
  const asPresenter = await memberClient(emails.presenter);
  const answered = await asPresenter.storage.from("materials").createSignedUrl(material.denied.sourcePath, 300);
  expect(answered.data?.signedUrl).toMatch(/\/object\/sign\/materials\//);

  await shoot(page, "denied", 390);
});

test("an admin's download is audited, and offered even with download off (DEC-214 §3, N2, N3)", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.admin);
  await open(page, "denied");
  const before = await db.query<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1 and action = 'material.downloaded' and subject_id = $2`, [orgId, material.denied.id]);

  await expect(main(page).getByText("سيُسجَّل هذا التحميل في سجل التدقيق.")).toBeVisible();
  const signed = page.waitForRequest((req) => req.url().includes("/object/sign/materials/"));
  await main(page).getByRole("button", { name: "تحميل", exact: true }).click();
  await signed;

  const after = await db.query<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1 and action = 'material.downloaded' and subject_id = $2`, [orgId, material.denied.id]);
  expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n) + 1);
  await open(page, "denied");
  await shoot(page, "admin", 1280);
});

// ★ DEC-266 (the owner's ruling): a member never downloads a material's original — the viewer is theirs, with download
// on or off — so they are offered no control and told nothing about an audit.
test("a member reads the material and is offered no download, download on or off", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.member);
  await open(page, "open");
  await expect(main(page).getByRole("button", { name: "تحميل", exact: true })).toHaveCount(0);
  await expect(main(page).getByText("سيُسجَّل هذا التحميل في سجل التدقيق.")).toHaveCount(0);
});

test("the rendering and failed states, at 390", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await open(page, "rendering");
  await expect(main(page).getByText("جارٍ تجهيز الصفحات…").first()).toBeVisible();
  await shoot(page, "rendering", 390);

  await open(page, "failed");
  await expect(main(page).getByText("تعذّر تجهيز صفحات هذا الملف.", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "أعد المحاولة" })).toBeVisible();
  await shoot(page, "failed", 390);
});

test("★ a material of another session is not found under this one (DEC-214 §1)", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  // The segment has its own loading.tsx, so the response streams and its status is already 200 when `notFound()`
  // runs — the boundary's page is the evidence, and the material's pages are not.
  await page.goto(`/ar/app/sessions/${randomUUID()}/materials/${material.open.id}`);
  await expect(page.getByText("لم نعثر على ما تبحث عنه").first()).toBeVisible();
  await expect(page.locator(`img[alt^="الشرائح"]`)).toHaveCount(0);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
});
