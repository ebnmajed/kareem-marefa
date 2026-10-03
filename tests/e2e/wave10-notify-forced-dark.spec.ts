// ★ THE FORCED-DARK CONTROL — three cells, one artwork, one variable.
//
// This is not a screenshot of a feature; it is a measurement, and `designer`
// (`0e7ddca`, `863c41f`) designed it so that it can FAIL.
//
// WHY A CONTROL AT ALL. A single logo gives one signal. Two give three
// outcomes, and the middle one is why the row is worth taking:
//
//   · PNG fails, JPEG holds  — the expected result, and F2's defect in one
//                              image.
//   · BOTH pass              — almost certainly a BLANKET INVERSION rather
//                              than two safe logos, because a white-grounded
//                              JPEG on a darkened card should stay visible as
//                              a light box whatever the client does. That is
//                              the false pass, caught by the control rather
//                              than by suspicion — and a single logo cannot
//                              tell it from a genuine result.
//   · BOTH fail              — something other than alpha is wrong. Stop
//                              rather than explain it away.
//
// ★ THE CONDITION THAT MAKES IT VALID: the JPEG must be THE SAME ARTWORK as
// the PNG, differing only in the alpha channel. Two convenient files are two
// observations wearing the costume of a comparison. So one mark is rendered
// twice by Playwright — `omitBackground: true` for the PNG (documented as
// PNG-only, so the JPEG encode flattens onto the page's white ground) — and
// the third cell is that same mark with only its ink colour swapped.
//
// ★ THE PREDICTION, COMMITTED BEFORE THE CAPTURE EXISTS: the transparent
// dark-ink cell should FAIL to read on the darkened card. If it PASSES, suspect
// the simulation before believing the result.
//
// ★ AND IF A CELL COMES BACK EMPTY, look at the door before the dark mode:
// `0126` gates on the SNIFFED mime and admits PNG and JPEG only, so a WebP
// logo yields no row, a null `logoUrl`, and a design that falls back to the
// org's NAME — which renders as no logo at all and reads exactly like «the
// logo vanished under forced dark».
//
// Captures (phone project, `E2E_SHOTS_DIR`):
//   wave10-notify-dark-logo-png-dark-ink.png    transparent, dark ink
//   wave10-notify-dark-logo-jpeg-dark-ink.png   THE SAME ARTWORK, opaque
//   wave10-notify-dark-logo-png-light-ink.png   transparent, light ink
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const SHOTS = process.env.E2E_SHOTS_DIR ?? `${process.cwd()}/.qa-shots/rtl`;

/** The ONE mark, in one ink colour or the other. Nothing else differs between
 *  the three cells. */
const MARK = (ink: string) => `<!doctype html><html><body style="margin:0">
  <div style="width:320px;height:120px;display:flex;align-items:center;justify-content:center;font:bold 44px/1 sans-serif;color:${ink}">
    <span>KAREEM</span>
  </div></body></html>`;

const DESIGN = {
  schemaVersion: 1,
  blocks: [
    { type: "image", id: "logo", src: { kind: "org_logo" }, alt: "شعار المؤسسة", width: 160 },
    { type: "heading", id: "h1", text: "جلستك غدًا", level: 1 },
    { type: "paragraph", id: "p1", text: "نراك في {{venue}}." },
  ],
};

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
const userIds: string[] = [];

async function provision(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

/** One mark, one encoding. `omitBackground` is PNG-only by documentation, so
 *  the JPEG encode flattens onto the page's white ground — identical ink, with
 *  and without alpha, from one source. */
async function renderMark(page: Page, ink: string, type: "png" | "jpeg"): Promise<Buffer> {
  await page.setViewportSize({ width: 320, height: 120 });
  await page.setContent(MARK(ink));
  return page.screenshot({ type, omitBackground: type === "png" });
}

/** Upload one mark and point the org's brand kit at it. */
async function useLogo(bytes: Buffer, mime: "image/png" | "image/jpeg"): Promise<void> {
  const assetId = randomUUID();
  const path = `${orgId}/design/assets/${assetId}.${mime === "image/png" ? "png" : "jpg"}`;
  const { error } = await admin.storage.from("design-assets").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  await db.query(
    `insert into public.design_assets (id, org_id, storage_path, sniffed_mime, width, height, byte_size)
     values ($1, $2, $3, $4, 320, 120, $5)`,
    [assetId, orgId, path, mime, bytes.byteLength],
  );
  await db.query(`update public.brand_kits set logo_asset_id = $1 where org_id = $2`, [assetId, orgId]);
}

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const domain = `w10-dark-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الوضع الداكن', $1, 'DK', gen_random_uuid(), $2) returning id`,
    [`w10-dark-${tag}`, adminEmail],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "مشرفة" } });
  if (error) throw error;
  userIds.push(data.user.id);
  await provision(adminEmail);
  // A brand kit to hang the logo on. The palette is the platform default;
  // only the logo varies between cells.
  await db.query(
    `insert into public.brand_kits (org_id, light_canvas, light_surface, light_fg_heading, light_fg_body, light_fg_muted,
                                    light_edge, light_edge_strong, light_spine, light_node, light_canvas_raise,
                                    dark_canvas, dark_surface, dark_fg_heading, dark_fg_body, dark_fg_muted,
                                    dark_edge, dark_edge_strong, dark_spine, dark_node, dark_canvas_raise)
     values ($1,'#ffffff','#ffffff','#0b1220','#33415c','#5b6780','#e6eaf0','#767f8c','#d7dce3','#0b1220','#f4f6f9',
                '#0b1220','#111a2c','#ffffff','#c9ced6','#a8b3c4','#252e3d','#4b5464','#252e3d','#ffffff','#1d2a42')
     on conflict (org_id) do nothing`,
    [orgId],
  );
  await db.query(
    `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks, source_family)
     values ($1, 'MSG-reminder_1d', 'email', 'ar', 'غدًا: {{title}}', 'شعار المؤسسة\n\nجلستك غدًا', '{}', $2::jsonb, 'reminder')`,
    [orgId, JSON.stringify(DESIGN)],
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
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  await client.rpc("provision_member");
  jar.length = 0;
  const { error: refreshError } = await client.auth.refreshSession();
  if (refreshError) throw refreshError;
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function captureDark(page: Page, name: string) {
  await page.setViewportSize(PHONE);
  // ★ Wave 23: the preview opens from the builder's bar, «معاينة واختبار» (STATUS ledger: the route and the control
  // moved; the cell's question and its assertions did not).
  await page.goto("/ar/app/admin/emails/MSG-reminder_1d");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.locator("#main").getByRole("button", { name: "معاينة واختبار" }).click();
  await page.getByRole("dialog", { name: "معاينة واختبار" }).getByRole("radio", { name: "داكن قسري" }).click();

  const frame = page.frameLocator('iframe[name="mail-preview"]');
  // The design must have rendered at all — if the heading is missing the cell
  // is empty for a reason that has nothing to do with dark mode.
  await expect(frame.locator("body")).toContainText("جلستك غدًا");
  // ★ And the logo must be PRESENT as an element. A missing <img> is NOT «the
  // logo vanished in the dark» — the two look identical in a picture and are
  // not the same finding. There are three ways it goes missing and only the
  // first was ever guessed:
  //   1. the mime gate refused the asset (`0126`) — refused at the door;
  //   2. the org has no public logo row at all;
  //   3. ★ nobody ASKED. This is what actually happened: the preview resolved
  //      no logo while the worker did, so the cell was empty for a reason that
  //      had nothing to do with dark mode (`8e86487`).
  // The count is asserted rather than the picture read, because a picture
  // cannot tell those three apart.
  // ★ The LOGO, named by its route — not «one image on the page».
  //
  // A bare count was right only while the logo was the sole image the preview
  // could resolve. With `preview_card_session()` (`0141`) the card's image can
  // resolve too, and whether it does depends on whether some other spec left a
  // rendered poster in this shared database — `sessions-public-card.spec.ts`
  // seeds exactly that. A count would then fail here for a reason that has
  // nothing to do with dark mode, which is the mistake this whole cell exists
  // to avoid making twice.
  await expect(frame.locator('img[src*="/api/brand/"]')).toHaveCount(1);
  // ★ THE PICTURE MUST BE THE MAIL.
  //
  // A page screenshot here framed the mode switcher with the iframe in the
  // lower half — a picture of the instrument instead of the measurement. The
  // whole point of these three is to judge whether «كريم معرفة» can be READ on
  // a darkened card, and that cannot be decided from a thumbnail of the pane
  // it sits in.
  //
  // So the element inside the frame, which is the rendered mail and nothing
  // else, at its full height rather than the iframe's box.
  // ★ The IFRAME is scrolled into view first, and that is not a nicety.
  // Screenshotting an element inside a frame makes Playwright scroll it into
  // view WITHIN the frame, which cannot help when the frame itself is half
  // below the fold — the element never settles and the shot times out. One
  // cell failed exactly that way; the other two happened to sit higher.
  await page.locator('iframe[name="mail-preview"]').scrollIntoViewIfNeeded();
  await frame.locator("body").screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
}

test("★ cell 1 — a transparent PNG, DARK ink: the prediction is that this one fails to read", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  await useLogo(await renderMark(page, "#0b1220", "png"), "image/png");
  await signIn(context, adminEmail);
  await captureDark(page, "wave10-notify-dark-logo-png-dark-ink");
});

test("★ cell 2 — THE SAME ARTWORK as a JPEG: the control, and it should hold", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  // Same mark, same ink, same dimensions — only the alpha channel differs,
  // because `omitBackground` is PNG-only and the JPEG flattens onto white.
  await useLogo(await renderMark(page, "#0b1220", "jpeg"), "image/jpeg");
  await signIn(context, adminEmail);
  await captureDark(page, "wave10-notify-dark-logo-jpeg-dark-ink");
});

test("cell 3 — a transparent PNG with LIGHT ink: the org with the opposite problem", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the 390 px review runs on the phone project");
  // Invisible on the LIGHT card in a non-inverting client, fine in dark. It is
  // what makes the root cause visible in the image rather than asserted in a
  // note: the defect is not «transparency is bad», it is ONE ASSET, TWO
  // GROUNDS.
  await useLogo(await renderMark(page, "#ffffff", "png"), "image/png");
  await signIn(context, adminEmail);
  await captureDark(page, "wave10-notify-dark-logo-png-light-ink");
});
