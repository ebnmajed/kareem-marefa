// SCR-059 · /app/admin/branding — against REAL local Supabase
// (REQ-DSG-021, REQ-ADM-015). Proves a moderator gets the not-found page (DEC-134), an admin
// can save a colour and a real uploaded logo and both persist, the kit
// resolves back through public.brand_kit() with the override, and a reset
// deletes the row — the identity override an unauthenticated screenshot or
// a mocked client cannot prove.
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
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let adminEmail = "";
let modEmail = "";
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `branding-${tag}.example`;
  adminEmail = `boss@${domain}`;
  modEmail = `mod@${domain}`;

  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الهوية', $1, 'BR', gen_random_uuid(), $2) returning id`,
    [`branding-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  for (const [email, name] of [
    [adminEmail, "مشرفة الهوية"],
    [modEmail, "منظّم الهوية"],
  ]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  const modClient = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await modClient.auth.signInWithPassword({ email: modEmail, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: provisioned, error: rpcError } = await modClient.rpc("provision_member");
  if (rpcError) throw rpcError;
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [(provisioned as { member_id: string }).member_id]);
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

// ★ DEC-134: `app/loading.tsx` puts every `/app` page inside a Suspense boundary,
// so the status is committed before the gate runs, and a gated page's
// `notFound()` streams 200 with `noindex` and the not-found page. What the gate
// protects is the content, so that is what is asserted: the not-found page is
// the only `h1`, and nothing the page guards rendered.
async function expectGatedNotFound(page: Page) {
  await expect(page.getByRole("heading", { name: "لم نعثر على ما تبحث عنه", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

test("a moderator cannot open the branding screen", async ({ context, page }) => {
  await signIn(context, modEmail);
  await page.goto("/ar/app/admin/branding");
  await expectGatedNotFound(page);
});

test("★ REQ-DSG-021/ADM-015: an admin uploads a real logo, saves a colour, and both persist and resolve through brand_kit()", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/branding");
  await expect(page.getByRole("heading", { name: "هوية المؤسسة", level: 1 })).toBeVisible();

  // Before any save, the screen shows the platform default — the identity
  // override made visible.
  const { rows: beforeRows } = await db.query(`select 1 from public.brand_kits where org_id = $1`, [orgId]);
  expect(beforeRows).toEqual([]);

  // ★ DEC-145: locators under `/app` scope to `#main`, past the shell's own
  // forms and any orphaned streamed copy.
  const main = page.locator("#main");

  // `ui/file-drop`'s own input carries no `aria-label` (the visible
  // affordance is the "اختر ملفات" button it wraps) — the picker only
  // REPORTS the file (`onFiles`); the round trip starts on the separate
  // "رفع شعار" button below, the same pick-then-submit shape
  // `photos/upload-widget.tsx` already uses.
  await main.locator('input[type="file"][name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: TINY_PNG });
  await main.getByRole("button", { name: "رفع شعار" }).click();
  await expect(main.getByRole("status").filter({ hasText: "نقطة/بوصة" })).toBeVisible();

  // "كريم معرفة" is ambiguous on this page (the nav Wordmark carries the
  // same text as the live preview's sample heading) — the live-preview's
  // OWN reactivity to typed colours is a component concern, already proven
  // by tests/components/branding/brand-kit-form.test.tsx. What only a real
  // browser against a real database can prove is the round trip THIS test
  // checks below: save, reload, and the org theme CSS layer (`.brand-org`,
  // DEC-053 decision 3) actually carries the new colour into the shell.
  const headingField = main.getByLabel("لون العناوين").first();
  await headingField.fill("#ff5500");

  await main.getByRole("button", { name: "حفظ" }).click();
  // `ui/toast` (Radix) renders the outcome TWICE: the visible toast
  // (portaled into the Viewport, no explicit role) and a visually-hidden
  // `role="status"` announcer Radix adds for screen readers. Filtering on
  // `role="status"` resolves to the announcer alone, rather than a strict-
  // mode violation over two matches of the same text.
  await expect(page.getByRole("status").filter({ hasText: "تم حفظ هوية المؤسسة." })).toBeVisible();

  const { rows } = await db.query<{ light_fg_heading: string; logo_asset_id: string | null }>(
    `select light_fg_heading, logo_asset_id from public.brand_kits where org_id = $1`,
    [orgId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].light_fg_heading).toBe("#ff5500");
  expect(rows[0].logo_asset_id).not.toBeNull();

  const { rows: kitRows } = await db.query<{ brand_kit: { isOverridden: boolean; light: { fgHeading: string } } }>(
    `select public.brand_kit($1) as brand_kit`,
    [orgId],
  );
  expect(kitRows[0].brand_kit.isOverridden).toBe(true);
  expect(kitRows[0].brand_kit.light.fgHeading).toBe("#ff5500");

  // Reload: the persisted override comes back, not the platform default —
  // both in the form (the DAL round trip) and in the SHELL'S OWN theme
  // layer (the CSS round trip, DEC-053 decision 3): the app layout emits
  // `.brand-org{--fg-heading:#ff5500;…}` only once `isOverridden` is true,
  // over globals.css's platform value, and this page's own `<h1>` carries
  // `text-fg-heading` — so its COMPUTED colour is the org override,
  // resolved through the `@theme inline` layer, not read off a class name
  // or an inline style string.
  await page.reload();
  await expect(page.locator("#main").getByLabel("لون العناوين").first()).toHaveValue("#ff5500");
  await expect(page.getByRole("heading", { name: "هوية المؤسسة", level: 1 })).toHaveCSS("color", "rgb(255, 85, 0)");
});

test("resetting deletes the row — every consumer returns to the platform default", async ({ context, page }) => {
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/branding");

  // The trigger opens `ui/dialog`; the confirm button of the SAME name
  // lives inside it (REQ-UIX-013 — names the object, states the
  // consequence before the click), so it is reached by scoping to the
  // dialog rather than by DOM order.
  await page.locator("#main").getByRole("button", { name: "إعادة الضبط إلى هوية المنصة" }).click();
  const resetDialog = page.getByRole("dialog");
  await resetDialog.getByRole("button", { name: "إعادة الضبط إلى هوية المنصة" }).click();
  // Same disambiguation as the save above.
  await expect(page.getByRole("status").filter({ hasText: "أُعيد ضبط هوية المؤسسة إلى الوضع الافتراضي." })).toBeVisible();

  const { rows } = await db.query(`select 1 from public.brand_kits where org_id = $1`, [orgId]);
  expect(rows).toEqual([]);

  // The identity override, symmetrically: no row means the SHELL'S OWN CSS
  // layer stops emitting `.brand-org` altogether (DEC-053 decision 3), so
  // the heading reverts to the platform default — packages/designer-runtime/
  // src/brand.ts's LIGHT.fgHeading, #0b1220.
  await page.reload();
  await expect(page.getByRole("heading", { name: "هوية المؤسسة", level: 1 })).toHaveCSS("color", "rgb(11, 18, 32)");
});

test("SCR-059 at 390 px RTL: the branding form reads down the page, never sideways", async ({ context, page }) => {
  test.skip(test.info().project.name !== "phone", "the 390 px review runs on the phone project: a desktop context at 390 px carries a classic 12 px scrollbar a mobile one does not (TEAM.md §5)");
  await page.setViewportSize(PHONE);
  await signIn(context, adminEmail);
  await page.goto("/ar/app/admin/branding");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const overflow = await page.evaluate(() => {
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
        if (cs.position === "fixed" || (n !== el && (cs.overflowX === "auto" || cs.overflowX === "scroll"))) {
          contained = true;
          break;
        }
      }
      if (contained) continue;
      offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);
    }
    return offenders.slice(0, 6);
  });
  expect(overflow, "the branding form must not scroll sideways at 390 px").toEqual([]);
  await page.screenshot({ path: `.qa-shots/rtl/scr-059-branding-390-rtl-${test.info().project.name}.png`, fullPage: true });
});
