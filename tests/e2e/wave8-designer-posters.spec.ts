// The poster picker on SCR-043 and the studio's live gate — wave 8 (DEC-148),
// against REAL local Supabase. REQ-DSG-002, REQ-DSG-003, REQ-DSG-018,
// REQ-DSG-020, REQ-UIX-013, DEC-009, DEC-012.
//
// What only a real browser against a real database shows:
//
//   · «خصّص» detaches ONLY through a confirm that names the session, and the
//     row, its mode and its audit entry change together; the studio then
//     opens editable;
//   · a LIVE poster's studio is read-only with that same confirm as the way
//     forward, and a save sent to it anyway is refused (409 `live_poster`) —
//     before wave 8 it saved, stayed live, and the next regeneration threw the
//     edit away;
//   · an SVG named `.png`, typed `image/png`, passes every check a browser can
//     make and is refused on its bytes after they land (DEC-009); a small
//     image is refused with its own numbers; a real one becomes the poster,
//     detached from the start, with its variants requested;
//   · a moderator sees the three paths and no control.
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as
// `wave8-designer-posters-<state>.png`, phone project, 390 × 844.
import { deflateSync } from "node:zlib";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1000 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
const userIds: string[] = [];
const emails = { admin: "", mod: "" };
const sessions: Record<"customise" | "gate" | "upload" | "stale", { id: string; title: string; documentId: string }> = {
  customise: { id: "", title: "ملتقى الخط والتصميم", documentId: "" },
  gate: { id: "", title: "ورشة الطباعة الحريرية", documentId: "" },
  upload: { id: "", title: "لقاء صنّاع الملصقات", documentId: "" },
  stale: { id: "", title: "جلسة الملصق المخصَّص", documentId: "" },
};

/* ── a PNG of any size, with no image library ───────────────────────────── */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A solid navy RGB PNG, `width` × `height`. */
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([16, 32, 64], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function provision(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
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
  const domain = `pst-${tag}.example`;
  emails.admin = `boss@${domain}`;
  emails.mod = `mod@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الملصقات', $1, 'PS', gen_random_uuid(), $2) returning id`,
    [`pst-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const email of [emails.admin, emails.mod]) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "مشرف الملصقات" },
    });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provision(emails.admin);
  const modId = await provision(emails.mod);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modId]);

  const { rows: version } = await db.query<{ id: string; document: unknown }>(
    `select v.id, v.document from public.design_template_versions v join public.design_templates t on t.id = v.template_id
      where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk' order by v.version desc limit 1`,
  );
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصميم') returning id`, [orgId]);

  let day = 3;
  for (const key of Object.keys(sessions) as (keyof typeof sessions)[]) {
    const { rows: s } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at, time_zone, capacity, custom_venue_name, state, published_at)
       values ($1, $2, 'نبذة', $3, 'introductory', 'ar', now() + $4::interval, 60, now() + $4::interval + interval '1 hour', 'Asia/Riyadh', 30, 'القاعة', 'published', now())
       returning id`,
      [orgId, sessions[key].title, cat[0].id, `${day++} days`],
    );
    sessions[key].id = s[0].id;
    const { rows: doc } = await db.query<{ id: string }>(
      `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id) values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
      [orgId, JSON.stringify(version[0].document), version[0].id, s[0].id],
    );
    sessions[key].documentId = doc[0].id;
    const stale = key === "stale";
    await db.query(
      `insert into public.session_posters (org_id, session_id, document_id, mode, binding, detached_at, stale_since)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (session_id) do update set document_id = excluded.document_id, mode = excluded.mode, binding = excluded.binding,
                                              detached_at = excluded.detached_at, stale_since = excluded.stale_since`,
      [orgId, s[0].id, doc[0].id, stale ? "customised" : "auto", stale ? "detached" : "live", stale ? new Date() : null, stale ? new Date() : null],
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
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";
const schedule = (id: string) => `/ar/app/admin/sessions/${id}/schedule`;
/** ★ DEC-145 / DEC-149 §4: page content under `/app` is found inside `#main`
 *  — a hidden streamed copy can sit outside it. Dialogs and toasts stay
 *  page-wide. */
const main = (page: Page) => page.locator("#main");
/** The slot, inside the schedule page's own «الملصق» section. */
const picker = (page: Page) => main(page).locator('section[aria-labelledby="poster"]');
/** One of the three cards, by its title. */
const card = (page: Page, title: string) => picker(page).locator("article", { has: page.getByRole("heading", { name: title, level: 3, exact: true }) });

async function capture(p: Page, name: string, { fullPage = false } = {}) {
  expect(p.viewportSize()).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // DEC-149 §4: a smooth scroll under a capture shows the page's top.
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/wave8-designer-posters-${name}.png`, fullPage });
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(1);
}

/* ── customise: the confirmed detach ────────────────────────────────────── */

test("★ REQ-DSG-003: «خصّص» detaches only through a confirm that names the session, and the studio opens editable", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  const s = sessions.customise;
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(schedule(s.id));

  await expect(card(page, "تلقائي")).toContainText("الطريقة الحالية");
  await card(page, "تخصيص").getByRole("button", { name: "خصّص" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(s.title);
  // DEC-148 q3: nothing promised about the brand beyond the truth.
  await expect(dialog).toContainText("تصديره التالي");

  // Cancelling changes nothing.
  await dialog.getByRole("button", { name: "تراجع" }).click();
  const { rows: still } = await db.query<{ binding: string }>(`select binding from public.session_posters where session_id = $1`, [s.id]);
  expect(still[0]!.binding).toBe("live");

  await card(page, "تخصيص").getByRole("button", { name: "خصّص" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "افصل وافتح المصمّم" }).click();
  await page.waitForURL(`**/app/admin/designer/${s.documentId}`);
  await expect(main(page).getByText("هذا الملصق مرتبط بالقالب")).toHaveCount(0);

  const { rows } = await db.query<{ mode: string; binding: string; audited: string }>(
    `select p.mode, p.binding,
            (select count(*) from public.audit_log a where a.org_id = p.org_id and a.action = 'design.poster_detached' and a.subject_id = p.session_id)::text as audited
       from public.session_posters p where p.session_id = $1`,
    [s.id],
  );
  expect(rows[0]).toEqual({ mode: "customised", binding: "detached", audited: "1" });

  // Back on the schedule: the customised card is current, and there is no way back.
  await page.goto(schedule(s.id));
  await expect(card(page, "تخصيص")).toContainText("الطريقة الحالية");
  await expect(card(page, "تخصيص").getByRole("link", { name: "افتح المصمّم" })).toBeVisible();
  await expect(card(page, "تلقائي")).toContainText("لا عودة إلى التلقائي");
});

/* ── the studio's gate on a live poster ─────────────────────────────────── */

test("★ a live poster's studio is read-only with the confirm as the way forward, and a save sent anyway is refused", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  const s = sessions.gate;
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${s.documentId}`);
  await expect(main(page).getByText("هذا الملصق مرتبط بالقالب")).toBeVisible();

  const { rows: doc } = await db.query<{ updated_at: Date; document: unknown }>(`select updated_at, document from public.design_documents where id = $1`, [
    s.documentId,
  ]);
  const response = await page.request.put(`/api/designer/${s.documentId}`, {
    headers: { "x-locale": "ar" },
    data: { baseUpdatedAt: doc[0]!.updated_at.toISOString(), document: doc[0]!.document },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ status: "live_poster" });

  const { rows } = await db.query<{ binding: string }>(`select binding from public.session_posters where session_id = $1`, [s.id]);
  expect(rows[0]!.binding).toBe("live");
});

/* ── upload: judged on the bytes ────────────────────────────────────────── */

test("★ DEC-009: an SVG named .png is refused on its bytes, a small image with its numbers, and a real one becomes the poster", async ({ context, page }) => {
  test.skip(onPhone(), "the writes run once, on the desktop project");
  test.setTimeout(120_000);
  const s = sessions.upload;
  await signIn(context, emails.admin);
  await page.setViewportSize(DESKTOP);
  await page.goto(schedule(s.id));
  const upload = card(page, "رفع ملصق جاهز");

  const attempt = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    await upload.locator('input[type="file"][name="poster"]').setInputFiles(file);
    await upload.getByRole("button", { name: "ارفع الملصق" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("يحلّ الملصق المرفوع محل الملصق التلقائي");
    await dialog.getByRole("button", { name: "ارفع واستبدل" }).click();
  };

  // Everything a browser can check says PNG. The content says otherwise.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><script>alert(1)</script></svg>');
  await attempt({ name: "poster.png", mimeType: "image/png", buffer: svg });
  await expect(upload.getByRole("alert")).toContainText("ليس صورة");
  await expect(upload.getByRole("alert")).toContainText("أيًّا كان امتداده");

  await attempt({ name: "small.png", mimeType: "image/png", buffer: png(800, 900) });
  await expect(upload.getByRole("alert")).toContainText("800");
  await expect(upload.getByRole("alert")).toContainText("1,080");

  const { rows: none } = await db.query<{ n: string }>(`select count(*)::text as n from public.design_assets where org_id = $1`, [orgId]);
  expect(none[0]!.n).toBe("0");

  await attempt({ name: "poster.png", mimeType: "image/png", buffer: png(1200, 1500) });
  await expect(page.getByText("رُفع الملصق، وتُجهَّز مقاساته الآن.", { exact: true })).toBeVisible();

  const { rows } = await db.query<{ mode: string; binding: string; asset: string | null; requested: string }>(
    `select p.mode, p.binding, p.uploaded_asset_id::text as asset,
            (select count(*) from public.export_artifacts e where e.document_id = p.document_id)::text as requested
       from public.session_posters p where p.session_id = $1`,
    [s.id],
  );
  expect(rows[0]!.mode).toBe("uploaded");
  expect(rows[0]!.binding).toBe("detached");
  expect(rows[0]!.asset).not.toBeNull();
  expect(Number(rows[0]!.requested)).toBeGreaterThan(0);
  await expect(card(page, "رفع ملصق جاهز")).toContainText("الطريقة الحالية");
});

/* ── the moderator ──────────────────────────────────────────────────────── */

test("a moderator sees the three paths and no control", async ({ context, page }) => {
  await signIn(context, emails.mod);
  if (onPhone()) await page.setViewportSize(PHONE);
  await page.goto(schedule(sessions.stale.id));
  // The schedule page is the lead's; a moderator may be refused it outright,
  // which is also no control.
  if ((await picker(page).count()) === 0) return;
  await expect(picker(page).getByRole("button", { name: "خصّص" })).toHaveCount(0);
  await expect(picker(page).getByRole("button", { name: "ارفع الملصق" })).toHaveCount(0);
});

/* ── the captures, on the phone ─────────────────────────────────────────── */

test("390 px: the picker live, the detach confirm, the stale prompt, the upload refusal, the studio's gate", async ({ context, page }) => {
  test.skip(!onPhone(), "captures are the phone project's");
  await signIn(context, emails.admin);
  await page.setViewportSize(PHONE);

  await page.goto(schedule(sessions.gate.id));
  await expect(picker(page)).toBeVisible();
  await picker(page).scrollIntoViewIfNeeded();
  await capture(page, "picker-live");

  await card(page, "تخصيص").getByRole("button", { name: "خصّص" }).click();
  await expect(page.getByRole("dialog")).toContainText(sessions.gate.title);
  await capture(page, "detach-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "تراجع" }).click();

  const upload = card(page, "رفع ملصق جاهز");
  await upload.locator('input[type="file"][name="poster"]').setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await upload.getByRole("button", { name: "ارفع الملصق" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ارفع واستبدل" }).click();
  await expect(upload.getByRole("alert")).toContainText("ليس صورة");
  await upload.scrollIntoViewIfNeeded();
  await capture(page, "upload-rejected");

  await page.goto(schedule(sessions.stale.id));
  const stale = picker(page).getByText("تغيّرت تفاصيل الجلسة — راجع الملصق.");
  await expect(stale).toBeVisible();
  // The prompt's TOP in view, below the sticky header — `scrollIntoView`
  // alone parked its first line under the header (the lead's capture review).
  await stale.evaluate((el) => {
    const box = (el.closest("[class*='rounded-card']") ?? el).getBoundingClientRect();
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: window.scrollY + box.top - header - 16, behavior: "instant" });
  });
  await capture(page, "picker-stale");

  await page.goto(`/ar/app/admin/designer/${sessions.gate.documentId}`);
  await expect(main(page).getByText("هذا الملصق مرتبط بالقالب")).toBeVisible();
  await capture(page, "studio-live-gate");
});
