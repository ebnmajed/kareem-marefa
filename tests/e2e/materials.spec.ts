// The Materials slot and SCR-013 (the viewer) against REAL local Supabase
// (STORY-MAT-001…012). Seeded directly through SQL — materials/material_
// versions/material_pages rows and their storage objects — never through
// the worker: convert_document/render_pages are covered on their own
// contract in tests/unit/worker-tasks.test.ts, and the lead runs the real
// pipeline once at the gate with the worker image (poppler inside it since
// DEC-058) against local Supabase. What this proves is the app
// layer: the arrows follow the reading direction, the substitution warning
// renders on the material, and the RTL layout holds at 390 px.
//
// Same shape as tests/e2e/checkin.spec.ts / sessions-screens.spec.ts: a
// user minted through the local Auth admin API, provisioned through
// provision_member(), signed in with a captured cookie jar. Skipped when
// the local service key isn't provided (`npm run test:e2e:local`).
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
// A genuine 1×1 WebP (RIFF/WEBP magic bytes, a real VP8L chunk) — small
// enough to inline, real enough that the viewer's <Image> actually loads
// it instead of showing a broken-image icon, matching how a rendered page
// would come back from render_pages in production.
const TINY_WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
let materialId = "";
let versionId = "";
let presenterEmail = "";
let memberEmail = "";
const userIds: string[] = [];

async function uploadObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY!, "content-type": contentType, "x-upsert": "true" },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`seed upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

/** `members` rows do not exist until `provision_member()` runs — there is no
 *  insert trigger on `auth.users`, on purpose (03 §2). beforeAll has no
 *  browser context to sign in through, so this calls the RPC directly on a
 *  throwaway client and reads the member id back from its own envelope —
 *  the same extraction tests/e2e/checkin.spec.ts's `signIn()` does, just
 *  without a `context` to hand cookies to. */
async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `mat-e2e-${tag}.example`;
  presenterEmail = `presenter@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المواد', $1, 'MT', gen_random_uuid()) returning id`,
    [`mat-e2e-${tag}`],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: catRows } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: venueRows } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الاختبار', 40) returning id`, [orgId]);

  const { rows: sessRows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة اختبار المواد', 'ملخص الجلسة', $2, 'introductory', now() - interval '2 days', 60, now() - interval '2 days' + interval '1 hour',
             $3, 30, 'completed', now() - interval '3 days')
     returning id`,
    [orgId, catRows[0].id, venueRows[0].id],
  );
  sessionId = sessRows[0].id;

  for (const [email, name] of [
    [presenterEmail, "مقدّم الاختبار"],
    [memberEmail, "عضو الاختبار"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const presenterMemberId = await provisionMemberId(presenterEmail);
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterMemberId]);

  const { rows: matRows } = await db.query<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, render_status, font_substitution_warning, added_by)
     values ($1, $2, 'pdf', 'الشريحة الافتتاحية', 'after', 'ready', 'Amiri', $3) returning id`,
    [orgId, sessionId, presenterMemberId],
  );
  materialId = matRows[0].id;
  versionId = randomUUID();
  // The source path's own version-id segment matches `versionId` — not
  // exercised by this spec (nothing here downloads the original), but
  // `materials_storage_read` (03 §6) joins on it, so a placeholder segment
  // would silently break a future download assertion.
  await db.query(
    `insert into public.material_versions (id, org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, $3, 1, $4, 1000, 'application/pdf', $5, $6)`,
    [versionId, orgId, materialId, `${orgId}/sessions/${sessionId}/materials/${versionId}/deck.pdf`, "a".repeat(64), presenterMemberId],
  );
  await db.query(`update public.materials set current_version_id = $1 where id = $2`, [versionId, materialId]);

  for (const n of [1, 2, 3]) {
    const imagePath = `${orgId}/sessions/${sessionId}/pages/${versionId}/${n}.webp`;
    const thumbPath = `${orgId}/sessions/${sessionId}/pages/${versionId}/thumbs/${n}.webp`;
    await uploadObject("material-pages", imagePath, TINY_WEBP, "image/webp");
    await uploadObject("material-pages", thumbPath, TINY_WEBP, "image/webp");
    await db.query(
      `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height) values ($1, $2, $3, $4, $5, 1, 1)`,
      [orgId, versionId, n, imagePath, thumbPath],
    );
  }
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

/** The half of a 390 px review a screenshot cannot do — same shape as
 *  tests/e2e/sessions-screens.spec.ts's own `review()`. */
async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // Layout-viewport measurement (TEAM.md §5): first, does the page scroll at all
  // (`scrollWidth - clientWidth` is the scrollbar's width on every RTL page that
  // scrolls vertically); then which element is responsible, skipping permitted
  // scroll containers and fixed overlays. Names what to fix.
  // Phone project only: a desktop context at 390 px carries a classic scrollbar
  // that inflates scrollWidth on every page that scrolls vertically.
  const overflow = test.info().project.name !== "phone" ? [] : await p.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [];
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right <= limit + 1 && box.left >= -1) continue;
      let contained = false;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.position === "fixed" || ((n !== el) && (cs.overflowX === "auto" || cs.overflowX === "scroll"))) { contained = true; break; }
      }
      if (contained) continue;
      offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, `${name} must not scroll sideways at 390 px`).toEqual([]);
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });
}

test("the Materials slot shows the substitution warning on the material, and links to the viewer", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, presenterEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "المواد", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText(/استُبدل الخط/)).toBeVisible();
  await expect(page.getByText("Amiri")).toBeVisible();
  await review(page, "materials-event-page");

  // Phone emulation keeps re-scrolling this long page while Playwright waits
  // for the link to hold still (TEAM.md §5); the tap is dispatched to the
  // (visible) link and the viewer page below is the assertion that matters.
  const open = page.getByRole("link", { name: "فتح العارض" });
  await expect(open).toBeVisible();
  await open.dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`/materials/${materialId}$`));
});

test("★ REQ-MAT-003/010: the viewer's arrows follow the RTL reading direction — ArrowLeft advances, ArrowRight retreats", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.goto(`/ar/app/sessions/${sessionId}/materials/${materialId}`);
  await expect(page.getByTestId("page-indicator")).toHaveText(/1.*3/);
  // The arrows are a window keydown handler attached on hydration; a key
  // pressed before the client bundle has run is lost (deterministic on the
  // desktop project since the event page grew heavier in wave 3). Wait for
  // the network to settle — hydration included — before the first press.
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("ArrowLeft"); // RTL: left = forward
  await expect(page.getByTestId("page-indicator")).toHaveText(/2.*3/);

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("page-indicator")).toHaveText(/3.*3/);

  await page.keyboard.press("ArrowRight"); // RTL: right = backward
  await expect(page.getByTestId("page-indicator")).toHaveText(/2.*3/);

  await review(page, "materials-viewer");
});

test("★ REQ-MAT-001/012: the presenter drives a real upload through the form end to end — initiate, PUT, sniff-and-complete, sniffed on content", async ({ context, page }) => {
  const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await signIn(context, presenterEmail);
  await page.goto(`/ar/app/sessions/${sessionId}`);

  await page.getByLabel("نوع المادة").selectOption("image");
  await page.getByLabel("عنوان المادة").fill("صورة من الجلسة");
  // ★ wave 6: the file input moved onto `ui/file-drop` (REQ-UIX-024), whose
  // hidden native input carries no accessible label of its own (the button
  // and the drop zone are the two labelled affordances — file-drop.tsx's
  // own header). Scoped to `#materials-upload-form` (the uploader's own
  // wrapper id, also the EmptyState's anchor target): photos.spec.ts's own
  // UploadWidget shares the same `name="file"` input on the SAME event page.
  await page.locator("#materials-upload-form input[type=\"file\"]").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByRole("button", { name: "رفع" }).click();

  // completeMaterialUpload() downloads the object it just wrote through the
  // uploader's own RLS-bound client to sniff it, before finalize_material_
  // upload() creates the material_versions row materials_storage_read
  // otherwise joins through (supabase/proposed/content/0010) — if that
  // pre-finalize read is ever broken again, this is what catches it: the
  // upload never leaves "تعذّر رفع الملف" for "صورة من الجلسة" to appear.
  await expect(page.getByText("صورة من الجلسة")).toBeVisible();
  await expect(page.getByText("تعذّر رفع الملف")).not.toBeVisible();

  const { rows } = await db.query<{ sniffed_mime: string; render_status: string }>(
    `select mv.sniffed_mime, m.render_status from public.materials m
       join public.material_versions mv on mv.id = m.current_version_id
      where m.title = 'صورة من الجلسة'`,
  );
  expect(rows[0].sniffed_mime).toBe("image/png");
  expect(rows[0].render_status).toBe("not_applicable"); // image — never enqueued for conversion
});
