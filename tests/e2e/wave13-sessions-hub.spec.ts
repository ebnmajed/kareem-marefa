// The session settings hub and «تنزيل الملصق» — `REQ-SES-020`, `REQ-DSG-027`,
// DEC-176, DEC-178.
//
// What this proves against the real pages, which no unit test can:
//   · `/app/admin/sessions/[id]` — which the survey's breadcrumb linked and
//     404'd — redirects an admin to the schedule and a moderator to attendance,
//     and gives a presenter who is not staff the not-found page;
//   · one strip over the session's screens, the current one `aria-current`,
//     following the route through a client navigation (a layout is not
//     re-rendered, so a server-side marker would stay put);
//   · the strip never scrolls the page sideways at 390 px, and every link is a
//     44 px target;
//   · a moderator is not offered the schedule;
//   · «تنزيل الملصق» on SCR-043 and on the event page: ONE primary link to
//     `designer`'s audited route, the rest behind a disclosure, a pending file
//     never a link; an accepted presenter sees it, a member does not.
//
// It asserts the rendered links, not the file: the route, the signer and the
// audit are `designer`'s and the lead's (`wave13-demo-download`).
//
// Captures, phone project, 390 × 844:
//   wave13-sessions-hub-schedule.png          the strip on SCR-043, «الجدولة» current
//   wave13-sessions-hub-certificates.png      after a tap on «الشهادات»
//   wave13-sessions-hub-moderator.png         a moderator's strip — no «الجدولة»
//   wave13-sessions-download-hub.png          SCR-043's poster section with the download
//   wave13-sessions-download-event.png        the event page's action card, for a presenter
//   wave13-sessions-download-event-open.png   the disclosure open
//   wave13-sessions-download-failed.png       back from a refused download
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const TITLE = "كيف نخطط لربع السنة";
// A 1×1 PNG, `sessions-public-card.spec.ts`'s. The master's object has to EXIST
// for the poster slot to sign it: a ready row with no object reads «يُولَّد
// الملصق…» where the poster goes (sessions.md W13.10, carried). What the poster
// looks like is the parity suite's job, not this one's.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let masterId = "";
let squareId = "";
let masterPath = "";
const emails: Record<"boss" | "mod" | "sara" | "nora", string> = { boss: "", mod: "", sara: "", nora: "" };
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one walk, on the touch project the captures come from");
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave13-hub-${tag}.example`;
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) emails[key] = `${key}@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الإعدادات', $1, 'HB', gen_random_uuid(), $2) returning id`,
    [`wave13-hub-${tag}`, emails.boss],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'التخطيط') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ', 40) returning id`,
    [orgId],
  );

  const members: Partial<Record<keyof typeof emails, string>> = {};
  for (const [key, name, role] of [
    ["boss", "مشرف المؤسسة", "admin"],
    ["mod", "منظِّمة الفعاليات", "moderator"],
    ["sara", "سارة العتيبي", "member"],
    ["nora", "نورة القحطاني", "member"],
  ] as const) {
    const user = await admin.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (user.error) throw user.error;
    userIds.push(user.data.user.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, org_role) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, user.data.user.id, emails[key], name, role],
    );
    members[key] = rows[0].id;
  }

  // A published session a week out, presented by Sara.
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, $2, 'جلسة عملية في التخطيط الربعي.', $3, 'introductory',
             now() + interval '7 days', 60, now() + interval '7 days' + interval '1 hour',
             $4, 30, now() + interval '7 days', now() + interval '6 days', 'published', now() - interval '1 day')
     returning id`,
    [orgId, TITLE, cat[0].id, venue[0].id],
  );
  sessionId = s[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, members.sara]);

  // Its poster: the master and the square rendered, the story still queued.
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', $2::jsonb, $3, null) returning id`,
    [orgId, JSON.stringify({ schemaVersion: 1, layers: [] }), sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc[0].id]);
  const artifact = async (preset: string, w: number, h: number, status: string, bytes: number | null) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
       values ($1, $2, $3, 'png', $4, $5, $6, $7, $8::public.export_status, $9, $10::timestamptz) returning id`,
      // One parameter, one type: `rendered_at` is its own argument rather than a
      // `case` over `$8`, which Postgres would have to type twice.
      [orgId, doc[0].id, preset, w, h, status === "ready" ? `${orgId}/exports/${doc[0].id}/${preset}.png` : null, bytes, status, `fp-${doc[0].id}`, status === "ready" ? new Date().toISOString() : null],
    );
    return rows[0].id;
  };
  masterId = await artifact("master", 1080, 1350, "ready", 1_234_000);
  masterPath = `${orgId}/exports/${doc[0].id}/master.png`;
  const { error: uploadError } = await admin.storage.from("exports").upload(masterPath, PNG, { contentType: "image/png", upsert: true });
  if (uploadError) throw uploadError;
  squareId = await artifact("square", 1080, 1080, "ready", 820_000);
  await artifact("story", 1080, 1920, "queued", null);
});

test.afterAll(async () => {
  if (!db) return;
  if (masterPath) await admin.storage.from("exports").remove([masterPath]);
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
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const strip = (page: Page) => main(page).getByRole("navigation", { name: "إعدادات الجلسة" });

async function settle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/**
 * Where focus sits after a navigation nobody typed into. The lead's review
 * found the admin skip link painted in a capture: if a real navigation (the
 * hub's redirect, or a tap in the strip) leaves focus there, that is a finding,
 * and this names it rather than a picture hinting at it.
 */
async function expectFocusNotOnSkipLink(page: Page, when: string) {
  const active = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} «${(el.textContent ?? "").trim().slice(0, 40)}»` : "none";
  });
  expect(active, `${when}: focus is on ${active}`).not.toMatch(/skip-link/);
}

/**
 * A viewport shot with one element in view between the sticky header and the
 * phone's bottom layers — never an element screenshot, which draws the fixed
 * header and tab bar over the very thing it is meant to show (the lead's first
 * review of download-hub). The target's top is put just under the header, and
 * the shot fails if anything fixed still paints over any part of it.
 */
async function captureAt(page: Page, target: ReturnType<Page["locator"]>, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await target.scrollIntoViewIfNeeded();
  const header = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0);
  const before = await target.boundingBox();
  await page.evaluate((by) => window.scrollBy({ top: by, behavior: "instant" }), before!.y - header - 16);
  const covered = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [
      [r.left + r.width / 2, r.top + 2],
      [r.left + r.width / 2, r.bottom - 2],
      [r.left + 4, r.top + r.height / 2],
      [r.right - 4, r.top + r.height / 2],
    ];
    return points.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && !el.contains(hit);
    });
  });
  expect(covered, `${name}: something fixed paints over the target`).toBe(false);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave13-sessions-${name}.png`) });
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual(PHONE);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, `${name} scrolls sideways at 390 px`).toBe(false);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave13-sessions-${name}.png`), fullPage: true });
}

/** SC 2.5.8 — every link in the strip is at least 24 × 24 (it is drawn at 44). */
async function expectTargets(page: Page) {
  for (const link of await strip(page).getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeGreaterThanOrEqual(24);
  }
}

test("an admin: the hub's address lands on the schedule, the strip follows the route, the download sits under the poster", async ({ page, context }) => {
  await signIn(context, emails.boss);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/admin/sessions/${sessionId}`);
  await page.waitForURL(`**/ar/app/admin/sessions/${sessionId}/schedule`);
  await settle(page);
  await expectFocusNotOnSkipLink(page, "after the hub's redirect");

  const links = strip(page).getByRole("link");
  // wave 21 (ledger L21-S4, an expectation named in W21.7): REQ-SES-020's order, the event page as «المحتوى» — and
  // «صفحة الجلسة» in the hub's one header, still to the event page.
  await expect(links).toHaveText(["الجدولة", "المحتوى", "الحضور", "الاستبانة", "الشهادات"]);
  await expect(main(page).getByRole("link", { name: "صفحة الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await expect(strip(page).getByRole("link", { name: "الجدولة" })).toHaveAttribute("aria-current", "page");
  await expect(strip(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(strip(page).getByRole("link", { name: "المحتوى" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await expectTargets(page);
  // ★ The mode's one writer is SCR-045 (DEC-178); SCR-043 does the schedule's job.
  await expect(main(page).locator('[name="certificateMode"]')).toHaveCount(0);
  await expect(main(page).getByRole("radio", { name: "تُصدَر تلقائيًا لكل من سجّل حضوره" })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include('[data-session-settings]').analyze();
  expect(axe.violations).toEqual([]);
  await capture(page, "hub-schedule");

  // ★ «تنزيل الملصق» under the picker: one primary, the audited route's href.
  const poster = main(page).locator('section[aria-labelledby="poster"]');
  const primary = poster.getByRole("link", { name: "تنزيل الملصق" });
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", `/api/designer/downloads/${masterId}`);
  await expect(poster.getByText("PNG · 4:5 · 1.2 ميغابايت")).toBeVisible();
  await expect(poster.locator("summary", { hasText: "صيغتان أخريان" })).toBeVisible();
  await expectFocusNotOnSkipLink(page, "before the download capture");
  // The download block, not the whole section: its heading and the picker are
  // above it, and a phone shows one or the other.
  await captureAt(page, poster.locator("[data-session-download]"), "download-hub");

  // A client navigation: the layout stays, the marker moves.
  await strip(page).getByRole("link", { name: "الشهادات" }).click();
  await page.waitForURL(`**/ar/app/admin/sessions/${sessionId}/certificates`);
  await settle(page);
  await expectFocusNotOnSkipLink(page, "after a tap in the strip");
  await expect(strip(page).getByRole("link", { name: "الشهادات" })).toHaveAttribute("aria-current", "page");
  await expect(strip(page).getByRole("link", { name: "الجدولة" })).not.toHaveAttribute("aria-current", "page");
  await capture(page, "hub-certificates");
});

test("a moderator: the hub's address lands on attendance, and the schedule is not offered", async ({ page, context }) => {
  await signIn(context, emails.mod);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/admin/sessions/${sessionId}`);
  await page.waitForURL(`**/ar/app/admin/sessions/${sessionId}/attendance`);
  await settle(page);
  // wave 21 (ledger L21-S4): the same order and label.
  await expect(strip(page).getByRole("link")).toHaveText(["المحتوى", "الحضور", "الاستبانة", "الشهادات"]);
  await expect(strip(page).getByRole("link", { name: "الحضور" })).toHaveAttribute("aria-current", "page");
  await expectTargets(page);
  await capture(page, "hub-moderator");
});

test("an accepted presenter: the download on the event page, and no way into the hub", async ({ page, context }) => {
  await signIn(context, emails.sara);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await settle(page);
  const primary = main(page).getByRole("link", { name: "تنزيل الملصق" });
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", `/api/designer/downloads/${masterId}`);
  // The rest behind a disclosure, closed; a queued file is never a link.
  const summary = main(page).locator("summary", { hasText: "صيغتان أخريان" });
  await expect(summary).toBeVisible();
  await expect(main(page).getByRole("link", { name: "تنزيل مربّع بصيغة PNG" })).toBeHidden();
  const block = main(page).locator("[data-session-download]");
  await captureAt(page, block, "download-event");

  await summary.click();
  const square = main(page).getByRole("link", { name: "تنزيل مربّع بصيغة PNG" });
  await expect(square).toBeVisible();
  await expect(square).toHaveAttribute("href", `/api/designer/downloads/${squareId}`);
  await expect(main(page).getByRole("link", { name: /ستوري/ })).toHaveCount(0);
  await expect(main(page).getByText("قيد الإعداد", { exact: true })).toBeVisible();
  await captureAt(page, block, "download-event-open");

  // Not staff: the hub is not theirs, and says so the way every admin screen does.
  await page.goto(`/ar/app/admin/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "إعدادات الجلسة" })).toHaveCount(0);
});

test("a member who neither presents nor manages sees no download", async ({ page, context }) => {
  await signIn(context, emails.nora);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/sessions/${sessionId}`);
  await settle(page);
  await expect(main(page).getByRole("heading", { level: 1 })).toContainText(TITLE);
  await expect(main(page).getByRole("link", { name: "تنزيل الملصق" })).toHaveCount(0);
});

test("back from a refused download, the page says so beside the control", async ({ page, context }) => {
  await signIn(context, emails.sara);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/sessions/${sessionId}?download=failed`);
  await settle(page);
  const alert = main(page).getByRole("alert").filter({ hasText: "تعذّر التنزيل. حاول مرة أخرى." });
  await expect(alert).toBeVisible();
  await captureAt(page, main(page).locator("[data-session-download]"), "download-failed");
});
