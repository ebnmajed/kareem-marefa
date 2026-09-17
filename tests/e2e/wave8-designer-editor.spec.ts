// SCR-057 on the M9 system — wave 8, D1 (DEC-147, DEC-148), against REAL local
// Supabase. REQ-DSG-006, REQ-DSG-012, REQ-DSG-022, REQ-DSG-028, REQ-DSG-029,
// DEC-093, DEC-096.
//
// What only a real browser against a real database shows:
//
//   · ★ every studio operation this wave ships is performed with `click()`
//     alone — no `mouse.down/move/up` anywhere in this file — and the stored
//     document changed (DEC-093's gate, REQ-DSG-028's first acceptance);
//   · a check names its layer, and «اذهب إلى الطبقة» selects it (REQ-DSG-029);
//   · «اطلب التصدير» is a real action that queues every variant of the SAVED
//     document, and the queue says queued / rendering / failed per variant
//     with a retry (REQ-DSG-012) — and, when a worker is running
//     (`E2E_WORKER=1`), the variants really render and the strip shows the
//     worker's own PNGs (DEC-017);
//   · at 390 px the studio is VIEW AND APPROVE: the canvas, every variant, the
//     checks and the approve action — and no layer editor at all.
//
// Captures land in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`) as
// `wave8-designer-editor-<state>.png`, phone project, 390 × 844.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
/** Set when a worker is consuming the `render` queue against this database —
 *  the only way «a real render through the worker» can be asserted. */
const WORKER = process.env.E2E_WORKER === "1";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1000 };
const SESSION_TITLE = "كيف اختصرنا وقت إعداد التقارير إلى النصف";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let modEmail = "";
let sessionId = "";
let documentId = "";
const userIds: string[] = [];

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
  const domain = `studio-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الاستوديو', $1, 'ST', gen_random_uuid(), $2) returning id`,
    [`studio-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الاستوديو"],
    [modEmail, "منظّم يقدّم الجلسة"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
  await provisionMemberId(adminEmail);
  const modMemberId = await provisionMemberId(modEmail);
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [modMemberId]);

  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف الاستوديو') returning id`, [orgId]);
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes, ends_at,
                                  time_zone, capacity, custom_venue_name, state, published_at)
     values ($1, $2, 'نبذة الجلسة', $3, 'introductory', 'ar', now() + interval '7 days', 60, now() + interval '7 days 1 hour',
             'Asia/Riyadh', 40, 'القاعة الكبرى', 'published', now())
     returning id`,
    [orgId, SESSION_TITLE, cat[0].id],
  );
  sessionId = sess[0].id;
  // The moderator presents this session, so `documents_read` lets them see
  // its poster read-only — the view-only badge's real case.
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, modMemberId]);

  // The platform's own `talk` template, as seeded — a real composition, bound
  // to a real session. `l_where` is stretched edge to edge so a check fails
  // and names it (REQ-DSG-029). Moving it to x = 0 alone no longer does:
  // `derive()` clamps a layer's position into the safe area, and only a frame
  // WIDER than the safe area is still over it — the v1 template failed a
  // check only because its 60 px box was shorter than its own line.
  const { rows: version } = await db.query<{ id: string; document: { layers: Array<{ id: string; frame: { x: number; w: number } }> } }>(
    `select v.id, v.document from public.design_template_versions v
       join public.design_templates t on t.id = v.template_id
      where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk'
      order by v.version desc limit 1`,
  );
  const document = version[0].document;
  for (const layer of document.layers) if (layer.id === "l_where") layer.frame = { ...layer.frame, x: 0, w: 1080 };

  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, bound_session_id)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(document), version[0].id, sessionId],
  );
  documentId = doc[0].id;
  await db.query(
    `insert into public.session_posters (org_id, session_id, document_id, mode, binding, detached_at)
     values ($1, $2, $3, 'customised', 'detached', now())
     on conflict (session_id) do update set document_id = excluded.document_id, mode = 'customised', binding = 'detached', detached_at = now()`,
    [orgId, sessionId, documentId],
  );
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
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const onPhone = () => test.info().project.name === "phone";

/** The 390 px review: the capture at the path the checklist row cites, and the
 *  one number that matters — the page does not scroll sideways. */
/** ★ DEC-145 / DEC-149 §4: page content under `/app` is found inside `#main`
 *  — a hidden streamed copy can sit outside it. Toasts stay page-wide. */
const main = (page: Page) => page.locator("#main");

async function capture(p: Page, state: string) {
  expect(p.viewportSize()).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // DEC-149 §4: no smooth scroll under a capture.
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.screenshot({ path: `${SHOTS}/wave8-designer-editor-${state}.png`, fullPage: true });
  const width = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width, `wave8-designer-editor-${state} must not scroll sideways at 390 px`).toBeLessThanOrEqual(1);
}

async function storedIndex(id: string): Promise<number> {
  const { rows } = await db.query<{ ids: string[] }>(
    `select array(select l->>'id' from jsonb_array_elements(d.document->'layers') l) as ids from public.design_documents d where d.id = $1`,
    [documentId],
  );
  return rows[0].ids.indexOf(id);
}

async function storedLayer(id: string): Promise<{ frame: { x: number; y: number; w: number; h: number }; z: number | null }> {
  const { rows } = await db.query<{ layer: { frame: { x: number; y: number; w: number; h: number }; z?: number } }>(
    `select l as layer from public.design_documents d, jsonb_array_elements(d.document->'layers') l where d.id = $1 and l->>'id' = $2`,
    [documentId, id],
  );
  return { frame: rows[0].layer.frame, z: rows[0].layer.z ?? null };
}

function saved(page: Page) {
  return page.waitForResponse((r) => r.url().includes(`/api/designer/${documentId}`) && r.request().method() === "PUT" && r.status() === 200);
}

async function openStudio(page: Page) {
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();
}

/* ── desktop: the editor, operated by taps alone ────────────────────────── */

test("★ DEC-093: every studio operation is performable with click() alone, and the stored document changes", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (09); the phone case asserts its absence");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await openStudio(page);

  // The header says what this is and where it came from.
  await expect(main(page).getByText("منفصل عن القالب", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("navigation", { name: "مسار التنقّل" }).getByRole("link", { name: "جدولة الجلسة" })).toHaveAttribute(
    "href",
    `/ar/app/admin/sessions/${sessionId}/schedule`,
  );

  // The canvas is the renderer's own output, with real data (REQ-DSG-006).
  const canvas = main(page).getByRole("region", { name: "المعاينة" }).frameLocator('iframe[title="لوحة التصميم"]');
  await expect(canvas.locator('[data-layer="l_title"]')).toContainText(SESSION_TITLE);

  // ★ REQ-DSG-029 — the check names its layer and selects it: the panel
  // turns to the layer's properties.
  const panel = main(page).getByRole("tablist", { name: "لوحات المحرّر" });
  await panel.getByRole("tab", { name: /الفحوصات/ }).click();
  // By the layer the check NAMES, never by position: checks group per layer,
  // and which layer's group comes first depends on the measurements (the
  // lead's build at 8608cb2 put «الموعد»'s floor finding ahead of this one).
  const goTo = main(page)
    .getByRole("listitem")
    .filter({ hasText: /الطبقة المكان تتجاوز حدّ الأمان/ })
    .getByRole("button", { name: "اذهب إلى الطبقة" });
  await expect(goTo).toBeVisible();
  await goTo.click();
  await expect(panel.getByRole("tab", { name: "الخصائص" })).toHaveAttribute("aria-selected", "true");
  const inspector = main(page).getByRole("region", { name: "الخصائص" });
  await expect(inspector.getByRole("group", { name: "أفقيًا" })).toBeVisible();

  // …and the layer it selected is `l_where`, pressed in the list.
  await panel.getByRole("tab", { name: "الطبقات" }).click();
  const rows = main(page).getByRole("tabpanel");
  await expect(rows.getByRole("button", { name: /المكان/, pressed: true })).toBeVisible();
  await panel.getByRole("tab", { name: "الخصائص" }).click();

  // ★ Align to the safe area's start on the DOCUMENT's axis (DEC-096).
  let done = saved(page);
  await inspector.getByRole("group", { name: "أفقيًا" }).getByRole("button", { name: "البداية" }).click();
  await done;
  expect((await storedLayer("l_where")).frame.x).toBe(80);

  // Vertically to the middle of the page, by tapping the target first.
  done = saved(page);
  await inspector.getByRole("button", { name: "الصفحة" }).click();
  await inspector.getByRole("group", { name: "رأسيًا" }).getByRole("button", { name: "الوسط" }).click();
  await done;
  const middle = await storedLayer("l_where");
  expect(middle.frame.y).toBe(Math.round((1350 - middle.frame.h) / 2));

  // ▲ on the layer's own row (DEC-093's second path). `l_where` and the QR
  // share z = 10, so the tie is broken by array order and the two trade
  // places — the stack changes without renumbering anything.
  await panel.getByRole("tab", { name: "الطبقات" }).click();
  const indexBefore = await storedIndex("l_where");
  done = saved(page);
  await rows
    .locator("li", { has: page.getByText("المكان", { exact: true }) })
    .getByRole("button", { name: "طبقة إلى الأمام" })
    .click();
  await done;
  expect(await storedIndex("l_where")).toBeGreaterThan(indexBefore);
  await panel.getByRole("tab", { name: "الخصائص" }).click();

  // To the back, from the inspector: one z, below every other layer's.
  done = saved(page);
  await inspector.getByRole("button", { name: "إلى الخلفية" }).click();
  await done;
  expect((await storedLayer("l_where")).z).toBeLessThan(2);

  // ★ The numbers exist — closed by default, opened by a tap — and a typed
  // value is saved.
  const position = inspector.getByRole("button", { name: "الموضع والحجم" });
  await expect(position).toHaveAttribute("aria-expanded", "false");
  await position.click();
  const width = inspector.getByLabel("العرض", { exact: true });
  done = saved(page);
  await width.fill("700");
  await done;
  expect((await storedLayer("l_where")).frame.w).toBe(700);

  // «لائم المنطقة الآمنة», after pushing the layer off the page by number.
  done = saved(page);
  await inspector.getByLabel("الإزاحة من البداية", { exact: true }).fill("900");
  await done;
  done = saved(page);
  await inspector.getByRole("button", { name: "لائم المنطقة الآمنة" }).click();
  await done;
  const fitted = await storedLayer("l_where");
  expect(fitted.frame.x + fitted.frame.w).toBeLessThanOrEqual(1000);

  // Undo is a tap too: it saves the step before «لائم».
  done = saved(page);
  await main(page).getByRole("toolbar").getByRole("button", { name: "تراجع" }).click();
  await done;
  expect((await storedLayer("l_where")).frame.x).toBe(900);

  // And the document survives a reload.
  await page.reload();
  await expect(main(page).getByRole("heading", { name: SESSION_TITLE, level: 1 })).toBeVisible();
});

test("★ REQ-DSG-024: a locked region cannot be moved by the align buttons, and the screen says why", async ({ context, page }) => {
  test.skip(onPhone(), "the editor is desktop-only (09)");
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await openStudio(page);

  await main(page).getByRole("tablist", { name: "لوحات المحرّر" }).getByRole("tab", { name: "الطبقات" }).click();
  await main(page)
    .getByRole("tabpanel")
    .getByRole("button", { name: /رمز الجلسة/ })
    .click();
  await main(page).getByRole("tablist", { name: "لوحات المحرّر" }).getByRole("tab", { name: "الخصائص" }).click();
  const inspector = main(page).getByRole("region", { name: "الخصائص" });
  await expect(inspector.getByText("مقفلة في القالب", { exact: false })).toBeVisible();
  await expect(inspector.getByRole("group", { name: "أفقيًا" }).getByRole("button", { name: "البداية" })).toBeDisabled();
  await expect(inspector.getByRole("button", { name: "لائم المنطقة الآمنة" })).toBeDisabled();
});

test("★ «اطلب التصدير» queues every variant of the saved document; a failed one says why and offers a retry", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(onPhone() ? PHONE : DESKTOP);
  await openStudio(page);

  await main(page).getByRole("button", { name: "اطلب التصدير" }).click();
  await expect(page.getByText("أُضيفت المقاسات إلى قائمة التصدير.", { exact: true })).toBeVisible();
  const exports = main(page).getByRole("region", { name: /قائمة التصدير/ });
  await expect(exports.getByText("في الانتظار").first()).toBeVisible();

  const { rows } = await db.query<{ n: string }>(`select count(*)::text as n from public.export_artifacts where document_id = $1`, [documentId]);
  // Seven presets: five screen presets as PNG + WebP, two print presets as PDF.
  expect(Number(rows[0].n)).toBe(12);

  if (WORKER) {
    // The render queue is serial and both projects export twelve variants,
    // so the poll below outlives the 30 s default — and a test that times out
    // runs its afterAll, which deleted the org under the worker mid-render.
    test.setTimeout(12 * 60_000);
    // ★ A real render through the worker (DEC-017): every variant SETTLES,
    // and then every one is ready — a failed render is reported with the
    // worker's own reason at once, not as ten minutes of «expected 12».
    await expect
      .poll(
        async () =>
          Number(
            (
              await db.query<{ n: string }>(
                `select count(*)::text as n from public.export_artifacts where document_id = $1 and status in ('ready', 'failed')`,
                [documentId],
              )
            ).rows[0].n,
          ),
        { timeout: 10 * 60_000, intervals: [5_000] },
      )
      .toBe(12);
    const { rows: failed } = await db.query<{ preset: string; format: string; error: string }>(
      `select preset, format, error from public.export_artifacts where document_id = $1 and status = 'failed' order by preset, format`,
      [documentId],
    );
    expect(failed, "every variant renders through the worker").toEqual([]);
    await page.reload();
    await expect(exports.getByText("جاهز").first()).toBeVisible();
    await expect(main(page).getByRole("navigation", { name: "المقاسات" }).first().locator("img").first()).toBeVisible();
    if (onPhone()) await capture(page, "review");
    else await page.screenshot({ path: `${SHOTS}/wave8-designer-editor-desktop.png`, fullPage: true });
    return;
  }

  // No worker: stage the other two states on the REAL rows the action wrote.
  await db.query(
    `update public.export_artifacts set status = 'rendering' where id = (select id from public.export_artifacts where document_id = $1 order by preset, format limit 1)`,
    [documentId],
  );
  await page.reload();
  await expect(exports.getByText("قيد التوليد").first()).toBeVisible();
  if (onPhone()) await capture(page, "rendering");

  await db.query(
    `update public.export_artifacts set status = 'failed', error = 'tier_a: l_title fitted 88px, expected 96px'
      where id = (select id from public.export_artifacts where document_id = $1 and status = 'queued' order by preset, format limit 1)`,
    [documentId],
  );
  await page.reload();
  // Said in the admin's words first (DEC-149 §4), the worker's own text kept
  // beneath it for whoever debugs the render.
  await expect(exports.getByRole("alert")).toContainText("النص لم يتّسع بالحجم المصمَّم له في هذا المقاس");
  await expect(exports.getByRole("alert")).toContainText("tier_a");
  const retry = exports.getByRole("button", { name: "أعِد المحاولة" });
  await expect(retry).toBeVisible();
  if (onPhone()) await capture(page, "failed");
  else await page.screenshot({ path: `${SHOTS}/wave8-designer-editor-desktop.png`, fullPage: true });

  await retry.click();
  await expect(page.getByText("أُعيدت المحاولة.", { exact: true })).toBeVisible();
  await expect(exports.getByRole("alert")).toHaveCount(0);
});

/* ── phone: view and approve ────────────────────────────────────────────── */

test("★ SCR-057 at 390 px is VIEW AND APPROVE — the canvas, every variant, the checks, the approve action, and no editor", async ({ context, page }) => {
  test.skip(!onPhone(), "the 390 px review runs on the phone project (TEAM.md §5: a desktop context carries a 12 px scrollbar)");
  await signIn(context, adminEmail);
  await page.setViewportSize(PHONE);
  await openStudio(page);

  await expect(main(page).getByText("على الهاتف تراجِع ولا تحرّر", { exact: false })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "اطلب التصدير" })).toBeVisible();
  await expect(main(page).getByRole("navigation", { name: "المقاسات" }).first()).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "قبل التصدير", level: 2 })).toBeVisible();
  // The editor is not here: no rail, no inspector, no align buttons.
  await expect(main(page).getByRole("tablist", { name: "لوحات المحرّر" })).toBeHidden();
  await expect(main(page).getByRole("button", { name: "لائم المنطقة الآمنة" })).toBeHidden();

  // A variant is a tap away, and its check a tap further.
  await main(page)
    .getByRole("navigation", { name: "المقاسات" })
    .first()
    .getByRole("button", { name: /بطاقة رابط/ })
    .click();
  await expect(main(page).getByRole("button", { name: "اذهب إلى الطبقة" }).first()).toBeVisible();

  await capture(page, "review");
});

test("a presenter who moderates sees the poster read-only — no approve action, and the badge says so", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.setViewportSize(onPhone() ? PHONE : DESKTOP);
  await openStudio(page);
  await expect(main(page).getByText("للعرض فقط", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "اطلب التصدير" })).toHaveCount(0);
  if (onPhone()) await capture(page, "readonly");
});
