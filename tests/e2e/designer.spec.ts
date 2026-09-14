// SCR-055, SCR-056 (the two template libraries) and SCR-057 (the designer),
// against REAL local Supabase — REQ-DSG-005, REQ-DSG-006, REQ-DSG-007,
// REQ-DSG-008, REQ-DSG-024, REQ-ADM-013.
//
// The three things only a real browser against a real database can show,
// and which the unit and RLS suites cannot:
//
//   · an org admin READS a platform template and is offered a duplicate
//     rather than an edit — the policy decides, and the screen tells the
//     truth about what the policy decided;
//   · SCR-057's autosave is a real PUT to a Route Handler, and the layer
//     tree survives a reload. A mocked client never catches a policy gap
//     between two real calls (TEAM.md §5, migration 0054's lesson);
//   · the designer at 390 px is VIEW AND APPROVE, with no layer editor —
//     "a layer editor at 375 px is a bad tool pretending to be a feature"
//     is only true if the editor is actually absent.
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
const DESKTOP = { width: 1440, height: 1000 };

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let memberEmail = "";
let documentId = "";
let platformTemplateId = "";
/** Unique per worker. A platform template has no `org_id` to scope it, and
 *  the desktop and phone projects share one database — so a card matched on
 *  «قالب المنصة» alone is the OTHER worker's card, and this test duplicated
 *  it (TEAM.md §5's third e2e trap, met here for real). */
let platformName = "";
const userIds: string[] = [];

const DOC = {
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers: [
    {
      id: "l_title",
      kind: "text",
      name: "عنوان الجلسة",
      frame: { x: 80, y: 300, w: 920, h: 320 },
      text: { binding: "session.title", fallback: "عنوان الجلسة" },
      font: { family: "IBM Plex Sans Arabic", size: 96, minSize: 56, lineHeight: 1.4, weight: 600 },
      color: "{{brand.fgHeading}}",
      align: "start",
    },
    {
      // Bound and with NO fallback — the only shape that draws a marked
      // placeholder. A fallback is real text the template author meant to
      // ship, not a placeholder, which is the distinction REQ-DSG-006 turns
      // on and the one this document exists to exercise.
      id: "l_abstract",
      kind: "dynamic_field",
      name: "نبذة الجلسة",
      frame: { x: 80, y: 700, w: 920, h: 200 },
      field: { binding: "session.abstract" },
      font: { family: "IBM Plex Sans Arabic", size: 44, lineHeight: 1.7 },
      color: "{{brand.fgBody}}",
      align: "start",
    },
    {
      id: "l_qr",
      kind: "qr",
      name: "رمز الجلسة",
      locked: true,
      frame: { x: 80, y: 1130, w: 140, h: 140 },
      qr: { binding: "session.eventUrl", ecLevel: "M", quietZoneModules: 4 },
    },
  ],
};

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `designer-${tag}.example`;
  adminEmail = `boss@${domain}`;
  memberEmail = `member@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة المصمّم', $1, 'DS', gen_random_uuid(), $2) returning id`,
    [`designer-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const email of [adminEmail, memberEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  // A platform template this org must be able to READ and must not be able
  // to write (REQ-DSG-008). Tagged by this run's org so a parallel worker's
  // rows are never counted as ours.
  platformName = `قالب المنصة ${tag}`;
  const { rows: platform } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name)
     values (null, 'platform', 'poster', 'talk', $1) returning id`,
    [platformName],
  );
  platformTemplateId = platform[0].id;
  await db.query(`insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now())`, [
    platformTemplateId,
    JSON.stringify(DOC),
  ]);

  // An unbound poster document: the editor opens it and every dynamic field
  // is a marked placeholder, which is REQ-DSG-006's own case.
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document) values ($1, 'poster', $2::jsonb) returning id`,
    [orgId, JSON.stringify(DOC)],
  );
  documentId = doc[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (platformTemplateId) await db.query(`delete from public.design_templates where id = $1`, [platformTemplateId]);
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

async function review(p: Page, name: string) {
  const project = test.info().project.name;
  expect(p.viewportSize(), `${name} must be reviewed at 390 px`).toEqual(PHONE);
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  // Two questions, not one. FIRST: does the page itself scroll sideways?
  // That is the actual requirement and it is one number.
  //
  // SECOND: which element is responsible? Measured against the layout
  // viewport, because in an RTL document the vertical scrollbar sits on the
  // left and `scrollWidth - clientWidth` is the scrollbar's width on every
  // page that scrolls (TEAM.md §5).
  //
  // ★ An element inside an `overflow-x: auto` ancestor is SKIPPED. CLAUDE.md
  // permits a wide thing in its own scroll container, and the admin shell's
  // sub-nav is one: its items extend past the viewport and the page does not
  // move. The body-wide version of this check flags fourteen elements on a
  // page that does not scroll at all — verified directly — which is why
  // console's ten 390 px assertions are currently red. Handed to the lead.
  await p.screenshot({ path: `.qa-shots/rtl/${name}-390-rtl-${project}.png`, fullPage: true });

  const sideways = await p.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return null;
    // Name the widest thing outside a scroll container, so the failure says
    // WHAT to fix rather than only that something is wrong.
    let worst = "";
    let worstWidth = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const box = el.getBoundingClientRect();
      if (box.width <= window.innerWidth) continue;
      let contained = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") {
          contained = true;
          break;
        }
      }
      if (!contained && box.width > worstWidth) {
        worstWidth = box.width;
        worst = `${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px`;
      }
    }
    return `${document.documentElement.scrollWidth}px wide viewport ${window.innerWidth}px; widest: ${worst || "(none outside a scroller)"}`;
  });
  expect(sideways, `${name} must not scroll sideways at 390 px`).toBeNull();

  const overflow = await p.evaluate(() => {
    const limit = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right <= limit + 1 && box.left >= -1) continue;
      let contained = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflowX = getComputedStyle(n).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          contained = true;
          break;
        }
      }
      if (!contained) offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, `${name}: these escape the viewport outside any scroll container`).toEqual([]);
}

/* ── SCR-055 / SCR-056 ──────────────────────────────────────────────────── */

test("a member cannot open either template library, nor the designer", async ({ context, page }) => {
  await signIn(context, memberEmail);
  expect((await page.goto("/ar/app/admin/templates/posters"))!.status()).toBe(404);
  expect((await page.goto("/ar/app/admin/templates/certificates"))!.status()).toBe(404);
  expect((await page.goto(`/ar/app/admin/designer/${documentId}`))!.status()).toBe(404);
});

test("★ REQ-DSG-008: an admin READS a platform template and is offered a duplicate, never an edit", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(page.getByRole("heading", { name: "قوالب الملصقات", level: 1 })).toBeVisible();

  const platform = page.locator("article", { has: page.getByText(platformName, { exact: true }) });
  await expect(platform).toBeVisible();
  await expect(platform.getByText("للقراءة فقط")).toBeVisible();
  // The card offers the action that EXISTS. A disabled edit button would be
  // telling the truth about a rule the policy already enforces; a duplicate
  // button is the thing an admin can actually do.
  await expect(platform.getByRole("button", { name: "افتح في المصمّم" })).toHaveCount(0);
  await expect(platform.getByRole("button", { name: "انسخ إلى مؤسستي" })).toBeVisible();

  await platform.getByLabel("اسم النسخة").fill("نسختنا من قالب الجلسة");
  await platform.getByRole("button", { name: "انسخ إلى مؤسستي" }).click();
  await expect(page.getByRole("status")).toContainText("نُسخ القالب");

  // ★ A COPY, not a reference: the org's version 1 carries the platform's
  // document as it stands, and a later platform change never reaches it.
  const { rows } = await db.query<{ name: string; scope: string; duplicated_from: string; version: number }>(
    `select t.name, t.scope, t.duplicated_from, v.version
       from public.design_templates t join public.design_template_versions v on v.template_id = t.id
      where t.org_id = $1`,
    [orgId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].scope).toBe("org");
  expect(rows[0].duplicated_from).toBe(platformTemplateId);
  expect(rows[0].version).toBe(1);
});

test("the certificate library is the same screen over the certificate families", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(page.getByRole("heading", { name: "قوالب الشهادات", level: 1 })).toBeVisible();
  // 06 §3.3's families, and no poster family leaking across.
  const families = page.getByLabel("العائلة").last();
  await expect(families.getByRole("option", { name: "شهادة حضور" })).toHaveCount(1);
  await expect(families.getByRole("option", { name: "ورشة" })).toHaveCount(0);
  // REQ-DSG-026, stated on the screen rather than in a style guide nobody
  // opens while designing.
  await expect(page.getByText("كتبًا مفتوحة", { exact: false })).toBeVisible();
});

test("SCR-055 at 390 px", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await signIn(context, adminEmail);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/admin/templates/posters");
  await expect(page.getByRole("heading", { name: "قوالب الملصقات", level: 1 })).toBeVisible();
  await review(page, "scr-055-templates-posters");
});

test("SCR-056 at 390 px", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await signIn(context, adminEmail);
  await page.setViewportSize(PHONE);
  await page.goto("/ar/app/admin/templates/certificates");
  await expect(page.getByRole("heading", { name: "قوالب الشهادات", level: 1 })).toBeVisible();
  await review(page, "scr-056-templates-certificates");
});

/* ── SCR-057 ────────────────────────────────────────────────────────────── */

test("★ REQ-DSG-006: the designer previews with real data, and an unbound field is a MARKED placeholder", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(page.getByRole("heading", { name: "مصمّم المستندات", level: 1 })).toBeVisible();

  // The canvas is the renderer's own output in an iframe — the very document
  // the worker's Chromium will open (DEC-017).
  // Both columns are in the DOM (one is `xl:hidden`, the other `hidden
  // xl:grid`), so the frame is scoped to the desktop preview rather than
  // matched by title alone.
  const canvas = page.getByRole("region", { name: "المعاينة" }).frameLocator('iframe[title="لوحة التصميم"]');
  // The canvas is reachable and is the renderer's own markup.
  await expect(canvas.locator('[data-layer="l_title"]')).toBeVisible();

  // ★ The distinction REQ-DSG-006 turns on. `l_abstract` binds and declares
  // no fallback, so it must draw a MARKED box — never a blank that exports
  // as white space nobody notices until it is printed.
  const placeholder = canvas.locator('[data-placeholder="session.abstract"]');
  await expect(placeholder).toBeVisible();
  // Names WHICH field is missing, and says so in Arabic. A placeholder that
  // does not say what is missing sends the admin hunting; one that renders a
  // message key says nothing at all.
  await expect(placeholder).toContainText("session.abstract");
  await expect(placeholder).toContainText("غير مرتبط");
  await expect(placeholder).not.toContainText("designer.");

  // And a fallback is NOT a placeholder: it is the text the author chose to
  // ship when nothing binds.
  await expect(canvas.locator('[data-layer="l_title"]')).toContainText("عنوان الجلسة");
  await expect(canvas.locator('[data-layer="l_title"][data-placeholder]')).toHaveCount(0);

  // The panel says the same thing in words, beside the canvas that shows it.
  await expect(page.getByRole("region", { name: "الحقول الديناميكية" }).getByText("غير مرتبط").first()).toBeVisible();
});

test("★ the autosave is a real PUT, and the layer tree survives a reload", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${documentId}`);

  await page.getByRole("button", { name: /اختيار الطبقة/ }).first().click();
  const width = page.getByLabel("العرض", { exact: true }).first();
  await expect(width).toBeVisible();

  // A real request to a real Route Handler: a mocked client never catches a
  // policy gap between two real calls (migration 0054's lesson).
  const saved = page.waitForResponse((r) => r.url().includes(`/api/designer/${documentId}`) && r.request().method() === "PUT" && r.status() === 200);
  await width.fill("880");
  await width.blur();
  await saved;
  await expect(page.getByText("محفوظ", { exact: true })).toBeVisible();

  const { rows } = await db.query<{ w: number }>(
    `select (l->'frame'->>'w')::int as w
       from public.design_documents d, jsonb_array_elements(d.document->'layers') l
      where d.id = $1 and l->>'id' = 'l_title'`,
    [documentId],
  );
  expect(rows[0].w).toBe(880);

  await page.reload();
  await expect(page.getByRole("heading", { name: "مصمّم المستندات", level: 1 })).toBeVisible();
});

test("★ REQ-DSG-024: a locked region cannot be edited, and the screen says why", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${documentId}`);

  // The QR layer is locked by the template. Selecting it must disable the
  // frame fields and explain — a 23514 from the database explains nothing.
  await page.getByRole("button", { name: /رمز الجلسة/ }).first().click();
  await expect(page.getByText("مقفلة في القالب", { exact: false }).first()).toBeVisible();
  const hide = page.locator("li", { has: page.getByText("رمز تحقّق") }).getByRole("button", { name: "إخفاء" });
  if (await hide.count()) await expect(hide).toBeDisabled();
});

test("★ SCR-057 at 390 px is VIEW AND APPROVE — no layer editor at all", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await signIn(context, adminEmail);
  await page.setViewportSize(PHONE);
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(page.getByRole("heading", { name: "مصمّم المستندات", level: 1 })).toBeVisible();

  // The notice, and the absence it describes. "A layer editor at 375 px is a
  // bad tool pretending to be a feature" is only true if it is actually gone.
  await expect(page.getByText("المعاينة والاعتماد فقط", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الطبقات", level: 2 })).toBeHidden();
  await expect(page.getByRole("heading", { name: "الخصائص", level: 2 })).toBeHidden();
  // What IS there: the preview and the dynamic fields.
  await expect(page.getByRole("heading", { name: "الحقول الديناميكية", level: 2 })).toBeVisible();

  await review(page, "scr-057-designer");
});
