// Wave 10, rows D1 and D2, against REAL local Supabase — REQ-CRT-003,
// REQ-CRT-008, REQ-CRT-011, REQ-CHK-017, REQ-DSG-002, DEC-160, DEC-153.
//
// What only a real browser against a real database shows, and what each
// capture is FOR:
//
//   · SCR-045 after a remove → re-add carries the member TWICE — one row under
//     «الملغاة» and one under «المصدَرة», with two different serials. Two rows
//     of one kind for one member had never existed before this wave, and every
//     list on that screen had to be looked at rather than reasoned about.
//   · The eligible list tells the two revocations apart in WORDS: a removal's
//     says a replacement is coming, an admin's FOR CAUSE says none is. The old
//     single sentence promised a replacement in both cases.
//   · `/app/me/certificates` shows the member BOTH documents — the live one
//     first, the revoked one under it with its reason.
//   · `/verify/<code>` resolves each separately: the replacement as «صادرة»,
//     the original as «ملغاة» and WITHOUT its reason (REQ-CRT-007).
//   · The studio's canvas prints a three-day session's date as a RANGE and a
//     one-day session's as exactly what it prints today — asserted against the
//     runtime's own functions, not against a literal, so the spec cannot drift
//     from the renderer it is checking.
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as
// `wave10-designer-<surface>-<state>.png`, phone project, 390 × 844.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { formatBindingDateTime, formatBindingWhen } from "@kareem/designer-runtime";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const ZONE = "Asia/Riyadh";

const SARA = "سارة بنت عبدالله العتيبي";
const KHALID = "خالد الزهراني";
const REISSUE_TITLE = "ورشة إعادة الإصدار";

// ★ ABSOLUTE instants, not `now() + interval`: a capture of a date is worth
// looking at only if the date is the same every time it is taken, and 15:00Z
// is 6:00 م in Riyadh, which is the hour a session actually runs.
const DAY_1 = "2026-11-17T15:00:00Z";
const DAY_2 = "2026-11-18T15:00:00Z";
const DAY_3 = "2026-11-19T15:00:00Z";

test.describe.configure({ mode: "serial" });

// ★ 390 × 844, the row's rule — SET for the phone project, not merely asserted
// in `capture()`. The `phone` project is `devices["Pixel 7"]`, whose default is
// 412 × 839, so every capture here would have been 412 px wide and every
// assertion would have run at a width nobody reviews. `checkin` met exactly
// this in wave 9 and its ten captures came out 1,082 px.
//
// In `beforeEach` rather than inside `capture()`, so the whole case — the
// navigation, the layout it produces and the assertions on it — runs at the
// width the picture is taken at, which is the only reason to look at one. And
// per-project rather than a file-level `test.use()`, because the desktop cases
// are real coverage: `ui/data-table`'s twin hides the OTHER half there, and
// shrinking desktop to a phone would quietly delete that.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize(PHONE);
});

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
const userIds: string[] = [];
const emails = { admin: "", sara: "", khalid: "" };
const members: Record<keyof typeof emails, string> = { admin: "", sara: "", khalid: "" };
const sessions = { reissue: "", threeDay: "", oneDay: "" };
const posters = { threeDay: "", oneDay: "" };
/** Sara's two certificates on the re-issue session: the revoked original and
 *  its replacement, in serial order. */
const certs: { id: string; serial: string; code: string }[] = [];

async function signedInClient(email: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  await client.auth.refreshSession();
  return { client, memberId: (data as { member_id: string }).member_id };
}

/** A completed one-day session with certificates on — the shape every removal
 *  in production has had, and the one D1 is about. */
async function completedSession(title: string): Promise<string> {
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, $2) returning id`, [orgId, `تصنيف ${title}`]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, certificate_mode, published_at, completed_at)
     values ($1, $2, 'نبذة عن الجلسة.', $3, 'introductory', 'ar',
             now() - interval '3 hours', 60, now() - interval '2 hours',
             $4, 30, 'القاعة', 'completed', 'automatic', now() - interval '1 day', now() - interval '2 hours')
     returning id`,
    [orgId, title, cat[0].id, ZONE],
  );
  return rows[0].id;
}

/** A published session at fixed instants. `0100`'s trigger gives it its first
 *  day; each extra day is written with `position` 1 and RENUMBERED by the
 *  trigger — never trusted from here (DEC-150). */
async function datedSession(title: string, days: string[]): Promise<string> {
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, $2) returning id`, [orgId, `تصنيف ${title}`]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, certificate_mode, published_at)
     values ($1, $2, 'نبذة عن الجلسة.', $3, 'introductory', 'ar', $4::timestamptz, 120, $4::timestamptz + interval '2 hours',
             $5, 30, 'القاعة', 'published', 'automatic', now() - interval '1 day')
     returning id`,
    [orgId, title, cat[0].id, days[0], ZONE],
  );
  for (const extra of days.slice(1)) {
    await db.query(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, custom_venue_name)
       values ($1, $2, 1, $3::timestamptz, $3::timestamptz + interval '2 hours', 'القاعة')`,
      [orgId, rows[0].id, extra],
    );
  }
  const { rows: check } = await db.query<{ n: string }>(`select count(*)::text as n from public.session_days where session_id = $1`, [rows[0].id]);
  expect(Number(check[0].n), `${title} should have ${days.length} day(s)`).toBe(days.length);
  return rows[0].id;
}

/** A poster bound to a session, on the platform `talk` family's latest
 *  published version — the same version `poster_render_context()` would pick. */
async function bindPoster(sessionId: string): Promise<string> {
  const { rows: version } = await db.query<{ id: string; document: unknown }>(
    `select v.id, v.document from public.design_templates t
       join public.design_template_versions v on v.template_id = t.id
      where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk' and v.published_at is not null
      order by v.version desc limit 1`,
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(version[0].document), version[0].id, sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id, mode, binding) values ($1, $2, $3, 'auto', 'live')`, [
    orgId,
    sessionId,
    doc[0].id,
  ]);
  return doc[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `rei-${tag}.example`;
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) emails[key] = `${key}@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة إعادة الإصدار', $1, 'RE', gen_random_uuid(), $2) returning id`,
    [`rei-${tag}`, emails.admin],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id, time_zone) values ($1, $2)`, [orgId, ZONE]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  const names: Record<keyof typeof emails, string> = { admin: "مشرفة الشهادات", sara: SARA, khalid: KHALID };
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true, user_metadata: { full_name: names[key] } });
    if (error) throw error;
    userIds.push(data.user.id);
    members[key] = (await signedInClient(emails[key])).memberId;
    await db.query(`update public.members set display_name = $2 where id = $1`, [members[key], names[key]]);
  }

  // ── D1's whole story, driven through the REAL RPCs ──────────────────────
  sessions.reissue = await completedSession(REISSUE_TITLE);
  const checkIn = (member: string) =>
    db.query(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
      [orgId, sessions.reissue, member, members.admin],
    );
  await checkIn(members.sara);
  await checkIn(members.khalid);
  const issue = async (member: string) =>
    (
      await db.query<{ id: string; serial: string; verification_code: string }>(
        `select id, serial, verification_code from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`,
        [sessions.reissue, member],
      )
    ).rows[0]!;

  const original = await issue(members.sara);
  const khalidCert = await issue(members.khalid);

  const { client } = await signedInClient(emails.admin);
  // Sara: REMOVED, then re-added. The removal revokes through the hook with
  // the fixed phrase and the `attendance_removed` cause; the re-add makes her
  // attendance complete again, and the issue is then the worker's job — which
  // is not running here, so the job's own RPC is called directly, exactly as
  // `issue_certificates` would call it.
  {
    const { error } = await client.rpc("remove_check_in", { p_session: sessions.reissue, p_member: members.sara, p_reason: "سُجّل حضورها بالخطأ" });
    if (error) throw error;
  }
  {
    const { error } = await client.rpc("mark_checked_in_manually", { p_session: sessions.reissue, p_member: members.sara, p_reason: "حضرت فعلًا" });
    if (error) throw error;
  }
  const replacement = await issue(members.sara);
  expect(replacement.id, "the re-add must produce a SECOND certificate").not.toBe(original.id);

  // Khalid: revoked FOR CAUSE, with his check-in untouched — the case nothing
  // may ever replace.
  {
    const { error } = await client.rpc("revoke_certificate", { p_certificate: khalidCert.id, p_reason: "صدرت باسم غير مكتمل" });
    if (error) throw error;
  }

  const { rows: sarasTwo } = await db.query<{ id: string; serial: string; verification_code: string; state: string }>(
    `select id, serial, verification_code, state from public.certificates
      where session_id = $1 and member_id = $2 and kind = 'attendance' order by serial`,
    [sessions.reissue, members.sara],
  );
  expect(sarasTwo.map((c) => c.state), "the revoked original, then its replacement").toEqual(["revoked", "issued"]);
  for (const c of sarasTwo) certs.push({ id: c.id, serial: c.serial, code: c.verification_code });

  // ── D2's two posters ────────────────────────────────────────────────────
  sessions.threeDay = await datedSession("ورشة ثلاثة أيام", [DAY_1, DAY_2, DAY_3]);
  sessions.oneDay = await datedSession("جلسة يوم واحد", [DAY_1]);
  posters.threeDay = await bindPoster(sessions.threeDay);
  posters.oneDay = await bindPoster(sessions.oneDay);
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

/** ★ DEC-145: under `/app` a page can stream a second, hidden copy of itself
 *  outside `#main`, so page content is found twice. */
const main = (page: Page) => page.locator("#main");
const onPhone = () => test.info().project.name === "phone";

async function capture(p: Page, name: string) {
  expect(p.viewportSize()).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // DEC-149 §4: no smooth scroll under a capture.
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  // ★ The whole page as the VIEWPORT, then the phone viewport back: a
  // `fullPage` screenshot paints beyond the viewport, where Chromium throttles
  // iframe painting, and a canvas that had loaded came out an empty box.
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: PHONE.width, height });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/wave10-designer-${name}.png` });
  await p.setViewportSize(PHONE);
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeLessThanOrEqual(1);
}

/* ── D1 · SCR-045 carries the member twice ──────────────────────────────── */

/**
 * ★ `ui/data-table` RENDERS EVERY ROW TWICE — a `<table>` and, below `md`, a
 * stacked card list (`data-table.tsx:143` and `:231`) — and hides one by
 * breakpoint. So a cell's text is in `#main` twice at every viewport, and a
 * bare `.first()` is a coin toss that lands on the HIDDEN twin: the table's
 * cell on the phone project, the card's on desktop. The repo's own answer is
 * `.filter({ visible: true })` (`platform-console.spec.ts:39`), and this
 * helper is it, so no assertion in this file can forget.
 *
 * It is deliberately used for the member's own certificate list too, which is
 * a `<ul>` of cards with no twin: one way of asking is worth more here than
 * knowing which surfaces happen to need it today.
 */
const shown = (scope: Locator, text: string) => scope.getByText(text, { exact: false }).filter({ visible: true });

test("★ SCR-045 after a remove and a re-add: one row under «الملغاة», one under «المصدَرة», two serials", async ({ context, page }) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessions.reissue}/certificates`);

  const [revoked, replacement] = certs;
  // Both serials are on the screen, and they are different — the assertion
  // the old single-row world could not have made.
  expect(revoked.serial).not.toBe(replacement.serial);
  for (const c of certs) await expect(shown(main(page), c.serial).first()).toBeVisible();

  // Sara's name appears under both states. Scoped to each state's own section
  // so «appears twice on the page» cannot pass for «appears in both lists» —
  // which, with the twin above, is a distinction this screen really can lose.
  const issued = main(page).locator('section[aria-labelledby="cert-issued"]');
  const revokedList = main(page).locator('section[aria-labelledby="cert-revoked"]');
  await expect(shown(issued, replacement.serial).first()).toBeVisible();
  await expect(shown(revokedList, revoked.serial).first()).toBeVisible();
  // …and each serial is in ITS OWN section only. The twin makes a count of 2
  // the correct answer for «present», so «absent» is the assertion that has to
  // be exact: 0 visible, whichever half of the table is showing.
  await expect(shown(issued, revoked.serial)).toHaveCount(0);
  await expect(shown(revokedList, replacement.serial)).toHaveCount(0);

  // ★ ONE capture for this screen, and it carries BOTH facts: the two serials
  // in their own sections, and — further down the same page — the eligible
  // list's «مُلغاة نهائيًا». The next test asserts the second half and takes no
  // picture of its own, because it navigates to the same URL in the same state
  // and produced a byte-identical file under a second name (same md5). Two
  // names for one image is a reviewer opening the same screen twice believing
  // they have seen two.
  if (onPhone()) await capture(page, "scr045-reissued-and-revoked-final");
});

test("★ the eligible list tells a removal's revocation from an admin's FOR CAUSE — two sentences, not one", async ({ context, page }) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/sessions/${sessions.reissue}/certificates`);

  // Khalid holds only a for-cause revocation and his check-in is still there,
  // so the list must say NO replacement is coming. The eligible list is a
  // DataTable too, so this sentence has a hidden twin as well.
  await expect(shown(main(page), "مُلغاة نهائيًا — لن يصدر بديل.").first()).toBeVisible();
  // Sara holds a live replacement, so she carries no warning at all: the gap
  // closed, and the screen must stop talking about it.
  await expect(shown(main(page), "مُلغاة لإزالة الحضور")).toHaveCount(0);

  // No capture here on purpose — see the previous test. This screen has one
  // picture, `wave10-designer-scr045-reissued-and-revoked-final.png`, and the
  // sentence asserted above is in it.
});

/* ── D1 · the member's own two documents ────────────────────────────────── */

test("★ /app/me/certificates shows BOTH — the live one and the revoked one with its reason", async ({ context, page }) => {
  await signIn(context, emails.sara);
  await page.goto("/ar/app/me/certificates");

  for (const c of certs) await expect(shown(main(page), c.serial).first()).toBeVisible();
  // The member is the one audience that sees WHY (03 §5.8a); the public page
  // never does.
  await expect(shown(main(page), "أُلغي تسجيل الحضور").first()).toBeVisible();

  if (onPhone()) await capture(page, "me-certificates-both");
});

/* ── D1 · two codes, two public pages ───────────────────────────────────── */

test("★ /verify resolves each certificate separately — «ملغاة» without its reason, and «صادرة»", async ({ page }) => {
  const [revoked, replacement] = certs;

  // ★ The SERIAL is deliberately not asserted here: it is not one of the six
  // fields `verify_certificate()` returns (DEC-010 — the serial is a reference
  // number, never a credential, and the page resolves by code alone).
  await page.goto(`/ar/verify/${revoked.code}`);
  await expect(page.locator('p[role="status"]')).toHaveText("هذه الشهادة ملغاة.");
  await expect(page.getByText(SARA, { exact: false }).first()).toBeVisible();
  // REQ-CRT-007: it verifies AS revoked, and the reason is the member's and
  // the admin's — never the public's.
  await expect(page.getByText("أُلغي تسجيل الحضور", { exact: false })).toHaveCount(0);
  if (onPhone()) await capture(page, "verify-revoked");

  // Same person, same session, a different document — and the second code is
  // «صالحة» while the first stays «ملغاة». Two rows, two independent answers.
  await page.goto(`/ar/verify/${replacement.code}`);
  await expect(page.locator('p[role="status"]')).toHaveText("شهادة صالحة");
  await expect(page.getByText(SARA, { exact: false }).first()).toBeVisible();
  expect(replacement.code).not.toBe(revoked.code);
  if (onPhone()) await capture(page, "verify-issued");
});

/* ── D2 · the date on the canvas ────────────────────────────────────────── */

/**
 * The studio's canvas is the renderer's own output with real data
 * (REQ-DSG-006) — the date layer read from inside the preview iframe.
 *
 * ★ THE CANVAS IS IN THE DOM TWICE, exactly as `ui/data-table`'s rows are.
 * `editor.tsx` builds ONE `canvas` element and renders it in BOTH branches —
 * the phone's «view and approve» column (`:463`) and the desktop editor's
 * `<section aria-labelledby="dr-canvas">` (`:511`) — and hides one with
 * `xl:hidden` / `hidden xl:flex`. So there are always two `iframe`s carrying
 * the same `title`, and only one of them is showing.
 *
 * Scoping by the region «المعاينة» happened to pick the visible one ON
 * DESKTOP, because that section exists only in the desktop branch — which is
 * why the desktop cases passed and why that pass was luck rather than proof.
 * The phone branch wraps the canvas in no region at all, so the same locator
 * found nothing there. Picking the VISIBLE twin is right in both layouts and
 * depends on neither.
 */
function whenLayer(page: Page) {
  return main(page)
    .locator('iframe[title="لوحة التصميم"]')
    .filter({ visible: true })
    .first()
    .contentFrame()
    .locator('[data-layer="l_when"]');
}

test("★ a three-day session's poster prints a RANGE, and it is the runtime's own answer", async ({ context, page }) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/designer/${posters.threeDay}`);

  // ★ Asserted against `formatBindingWhen` rather than against a literal: a
  // spec that hard-codes «19 – 21 نوفمبر 2026» would keep passing if the
  // renderer and the formatter drifted apart, which is the one thing this is
  // here to catch.
  const expected = formatBindingWhen([{ startsAt: DAY_1 }, { startsAt: DAY_2 }, { startsAt: DAY_3 }], ZONE, "ar");
  await expect(whenLayer(page)).toContainText(expected);
  // And it really is a range, not the first day's full date.
  expect(expected).not.toBe(formatBindingDateTime(DAY_1, ZONE, "ar"));

  if (onPhone()) await capture(page, "poster-three-days");
});

test("★ a one-day session's poster prints EXACTLY what it printed before this wave", async ({ context, page }) => {
  await signIn(context, emails.admin);
  await page.goto(`/ar/app/admin/designer/${posters.oneDay}`);

  // ★ THE REGRESSION GUARD. `formatBindingDateTime` is the function `main`
  // renders this layer with and is untouched by wave 10, so this compares the
  // new pipeline's output against the old pipeline's answer — the same
  // comparison the unit suite makes, made here through a real browser, a real
  // database and the real renderer.
  await expect(whenLayer(page)).toContainText(formatBindingDateTime(DAY_1, ZONE, "ar"));

  if (onPhone()) await capture(page, "poster-one-day");
});
