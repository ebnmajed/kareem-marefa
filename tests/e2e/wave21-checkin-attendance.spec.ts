// Wave 21 · SCR-044 — attendance RUN LIVE from the hub's الحضور tab (REQ-UIX-090, DEC-227 §0.4, DEC-228), against real
// local Supabase. The job, end to end, as an admin does it at a desk:
//   the code is on the card with its rotation · «أبطل» burns it and a new one is out at once (REQ-CHK-007) · the door
//   closes and reopens (REQ-CHK-015) · a member checks in from their phone and the row turns «حاضر» WITHOUT a reload ·
//   a manual mark from the sheet names who marked it (REQ-CHK-008) · on a completed session the card is the final rate,
//   and a revoke writes DEC-172's compensating row through `remove_check_in()` (REQ-CHK-017) · a moderator gets no CSV
//   and no revoke (REQ-ADM-020).
//
// Captures (`E2E_SHOTS_DIR`, default `.qa-shots/rtl`): wave21-checkin-044-{live,completed}-{1280,390}.png
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
const emails: Record<"boss" | "mod" | "reem" | "fahd", string> = { boss: "", mod: "", reem: "", fahd: "" };
const members: Record<"boss" | "mod" | "reem" | "fahd", string> = { boss: "", mod: "", reem: "", fahd: "" };
const userIds: string[] = [];

const main = (page: Page) => page.locator("#main");
const rowOf = (page: Page, name: string) => main(page).getByRole("row", { name: new RegExp(name) }).or(main(page).getByRole("listitem").filter({ hasText: name }));
const codeOf = (page: Page) => main(page).getByRole("region", { name: "رمز الحضور" }).locator('p[dir="ltr"]');

async function memberClient(email: string) {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  await client.rpc("provision_member");
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ The width is the PROJECT's, set here, never read back: the phone project is a Pixel 7 (412 CSS px), so reading the
// viewport named a phone capture «-1280» and it overwrote the desktop one. Desktop is captured at 1280 — the width the
// owner accepts this batch at — and the phone at 390 × 844.
/** The card holds its content: the code (or the final rate) lies wholly inside it, and from `lg` the card is wider than
 *  a figure — the lead's review of the first 1280 capture, where «MXG ANV» ran out past the card's inline-end edge. */
async function expectCardHolds(page: Page, region: string, content: ReturnType<Page["locator"]>) {
  const card = await main(page).getByRole("region", { name: region }).boundingBox();
  const inner = await content.boundingBox();
  expect(card && inner, "both boxes are on screen").toBeTruthy();
  expect(inner!.x).toBeGreaterThanOrEqual(card!.x - 0.5);
  expect(inner!.x + inner!.width).toBeLessThanOrEqual(card!.x + card!.width + 0.5);
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    const figure = await main(page).locator("span", { hasText: /^محجوز$/ }).first().locator("xpath=..").boundingBox();
    expect(card!.width, "the code card is wider than a figure").toBeGreaterThan(figure!.width);
  }
}

async function shoot(page: Page, state: string) {
  const phone = test.info().project.name === "phone";
  const width = phone ? 390 : 1280;
  await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 880 });
  await expect(main(page).getByRole("table").or(main(page).getByRole("list")).first()).toBeVisible();
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave21-checkin-044-${state}-${width}.png`), fullPage: true });
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave21-attendance-${tag}.example`;
  for (const who of Object.keys(emails) as (keyof typeof emails)[]) emails[who] = `${who}@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الحضور المباشر', $1, 'LV', gen_random_uuid(), $2) returning id`,
    [`wave21-attendance-${tag}`, emails.boss],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'القاعة', 40) returning id`, [orgId]);

  for (const [who, name] of [
    ["boss", "عبدالله المشرف"],
    ["mod", "منظّم الجلسة"],
    ["reem", "ريم الشهري"],
    ["fahd", "فهد العنزي"],
  ] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[who], password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const client = await memberClient(emails[who]);
    const { data: m, error: e } = await client.rpc("provision_member");
    if (e) throw e;
    members[who] = (m as { member_id: string }).member_id;
  }
  await db.query(`update public.members set org_role = 'moderator' where id = $1`, [members.mod]);

  // Live now: began 20 minutes ago, ends in 40 — the room is open, the code is out.
  const { rows: sess } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'العرض في 5 شرائح', 'ملخص', $2, 'introductory', now() - interval '20 minutes', 60, now() + interval '40 minutes', $3, 30, 'in_progress', now() - interval '2 days')
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = sess[0].id;
  for (const who of ["reem", "fahd"] as const) {
    await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, sessionId, members[who]]);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

test("the code, its rotation, «أبطل» and the door — run from the console", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(main(page).getByRole("heading", { level: 1 })).toContainText("العرض في 5 شرائح");

  const code = codeOf(page);
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  // The rotation is a bare m:ss — a number that changes, never a motion (REQ-UIX-053).
  await expect(main(page).locator("[data-host-clock]")).toHaveText(/^\d+:\d{2}$/);
  await shoot(page, "live");
  await expectCardHolds(page, "رمز الحضور", code);

  const before = (await code.textContent()) ?? "";
  await main(page).getByRole("button", { name: "أبطل" }).click();
  await expect(code).not.toHaveText(before);
  const revoked = await db.query(`select 1 from public.audit_log where org_id = $1 and action = 'check_in_code.revoked'`, [orgId]);
  expect(revoked.rowCount).toBe(1);

  // ★ The switch's `<input role="switch">` is `sr-only` — a 1 px clipped box, which a pointer never lands on. A person
  // taps its LABEL (the visible track and «مفتوح»), so that is what is clicked; the state is read off the input.
  const door = main(page).getByRole("switch", { name: "مفتوح" });
  const track = door.locator("xpath=ancestor::label[1]");
  const dayOpen = async () =>
    (await db.query<{ open: boolean }>(`select check_in_open as open from public.session_days where session_id = $1`, [sessionId])).rows[0].open;
  await expect(door).toBeChecked();
  await expect(door).toBeEnabled(); // hydrated: `HostSwitch` takes a tap only once it can act on one
  // ★ Each tap is read in order — the database first, then the page — so a failure says WHICH it was: the action never
  // ran (the database did not flip), or it ran and the page did not come back (the UI's state, or an error page).
  const errorPage = page.getByRole("heading", { name: "تعذّر عرض هذه الصفحة" });
  await track.click();
  await expect.poll(dayOpen, { message: "the door's action reached the database" }).toBe(false);
  await expect(errorPage, "the page came back, not the error boundary").toHaveCount(0);
  await expect(door).not.toBeChecked();
  await expect(door).toBeEnabled();
  await track.click();
  await expect.poll(dayOpen, { message: "the door's action reached the database" }).toBe(true);
  await expect(errorPage, "the page came back, not the error boundary").toHaveCount(0);
  await expect(door).toBeChecked();
});

test("a member checks in from their phone, and the row turns «حاضر» without a reload", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(rowOf(page, "ريم الشهري")).toContainText("لم يحضر");
  const code = ((await codeOf(page).textContent()) ?? "").trim();

  const reem = await memberClient(emails.reem);
  const { data, error } = await reem.rpc("check_in", { p_session: sessionId, p_code: code });
  expect(error).toBeNull();
  expect((data as { status: string }).status).toBe("ok");

  // No `page.reload()`: the room's poke refreshes the tab (`HostClock`'s console variant listens).
  await expect(rowOf(page, "ريم الشهري")).toContainText("حاضر", { timeout: 15_000 });
  await expect(rowOf(page, "ريم الشهري")).toContainText("رمز");
});

test("a manual mark from the sheet names who marked it", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await main(page).getByRole("button", { name: "إجراءات فهد العنزي" }).click();
  await page.getByRole("menuitem", { name: "سجّل حضوره" }).click();
  const sheet = page.getByRole("dialog", { name: "تسجيل حضور يدوي" });
  await sheet.getByLabel("السبب", { exact: false }).fill("هاتفه بلا شحن");
  await sheet.getByRole("button", { name: "سجّل حضوره" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rowOf(page, "فهد العنزي")).toContainText("يدوي · عبدالله المشرف");
});

test("a moderator runs the room but gets no CSV and no revoke", async ({ context, page }) => {
  await signIn(context, emails.mod);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(codeOf(page)).toHaveText(/^[A-Z0-9]{6}$/);
  await expect(main(page).getByRole("link", { name: "CSV", exact: true })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "إجراءات ريم الشهري" })).toHaveCount(0);
});

test("completed: the card is the final rate, and a revoke writes DEC-172's reversal through remove_check_in()", async ({ context, page }) => {
  await db.query(`update public.sessions set state = 'completed' where id = $1`, [sessionId]);
  // The award completion would pay — written here as the worker writes it, so the reversal has something to reverse.
  const { rows: award } = await db.query<{ id: string }>(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
     values ($1, $2, 10, 'check_in', gen_random_uuid(), $3, 'حضور', 'check_in', $4) returning id`,
    [orgId, members.reem, sessionId, `e2e:wave21:${sessionId}`],
  );

  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${sessionId}/attendance`);
  await expect(main(page).getByRole("region", { name: "المعدّل النهائي" })).toContainText("100٪");
  await expect(main(page).getByRole("heading", { name: "التقييمات — لكل مُقيِّم" })).toBeVisible();
  await shoot(page, "completed");
  await expectCardHolds(page, "المعدّل النهائي", main(page).getByRole("region", { name: "المعدّل النهائي" }).locator("strong"));

  await main(page).getByRole("button", { name: "إجراءات ريم الشهري" }).click();
  await page.getByRole("menuitem", { name: "ألغِ الحضور" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("تُعكس نقاطه");
  await dialog.getByLabel("سبب الإلغاء", { exact: false }).fill("سُجّل خطأً");
  await dialog.getByRole("button", { name: "ألغِ تسجيل الحضور" }).click();
  await expect(rowOf(page, "ريم الشهري")).toContainText("أُلغي");

  const { rows } = await db.query<{ amount: number; source_id: string }>(
    `select amount, source_id from public.points_ledger where idempotency_key = $1 and source = 'reversal'`,
    [`reversal:${award[0].id}:v1`],
  );
  expect(rows).toEqual([{ amount: -10, source_id: award[0].id }]);
});
