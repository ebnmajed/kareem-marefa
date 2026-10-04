// SCR-012 — the event page, rebuilt in wave 18 from `Event`, `EventLive`, `EventDone` and `EventDesktop.dc.html`
// (REQ-UIX-061, STORY-UIX-048, DEC-206 §4.66 – §4.74, DEC-208, DEC-209). The older specs stay as evidence
// (`event-page`, `checkin`, `sessions-screens`, `wave16-sessions-reserve`, …); this one holds what the rebuild adds.
//
//   · open — the regions in the artboard's order (the top row, the poster, the chips with the language before
//     the action, the h1, the presenter card, the action card, the sub-nav, the sections); the rule's amount on
//     the reserve, never a literal (the fixture sets the rule to 35); the primary in the card AND the bar on the
//     phone (DEC-209); the deadlines line for a member with no seat;
//   · live — how many are here, as a count; «تسجيل الحضور» with «مقعدك محجوز»; the rotation read from the org;
//     «شاهد القصة» that opens nothing — this session has no frame (wave 26: an entry is drawn only for a story); the sections in the live order (the photos and the discussion first);
//   · ended, attended — the outcome with the amount, «قيّم الجلسة», the recap; the ribbon in DEC-073's words;
//   · desktop — the shell's bar, the hero band, the full-width action row, the aside with the room.
//
// Captures: `wave18-sessions-event-<open|live|done>-390.png` and `wave18-sessions-event-desktop-1280.png`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
let memberId = "";
const users: string[] = [];
const ids = { open: "", live: "", done: "" };
const T = {
  open: "لوحة تحكم لا يهجرها أحد بعد أسبوع",
  live: "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية",
  done: "الأرقام التي تكذب: قراءة تقارير الأداء",
};
let cookies: { name: string; value: string }[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w18-event-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الجلسة', $1, 'WE', gen_random_uuid()) returning id`, [`w18-event-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  await db.query(`update public.org_settings set check_in_rotation_seconds = 600 where org_id = $1`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // The rule is read, never a literal: 35 here, so a «+50» or a «+20» on screen is a defect.
  await db.query(`update public.scoring_rules set points = 35, enabled = true where org_id = $1 and action_key = 'check_in'`, [orgId]);

  email = `member@${domain}`;
  const member = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (member.error) throw member.error;
  users.push(member.data.user.id);
  memberId = await provision();

  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الرياض', 'الدور الثالث') returning id`, [orgId])).rows[0].id;
  const session = async (title: string, state: string, offset: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id,
                                      time_zone, published_at, completed_at, rsvp_deadline_at, cancellation_cutoff_at, check_in_open)
         values ($1, $2, 'جلسة عملية عن لوحات المتابعة في الشركات الصغيرة.', $3, 'introductory', 'ar', $5::public.session_state,
                 now() + $4::interval, 60, now() + $4::interval + interval '1 hour', 40, $6, 'Asia/Riyadh', now() - interval '10 days',
                 case when $5 = 'completed' then now() + $4::interval + interval '1 hour' end,
                 case when $5 = 'published' and $4::interval > interval '0' then now() + $4::interval - interval '1 day' end,
                 case when $5 = 'published' and $4::interval > interval '0' then now() + $4::interval - interval '6 hours' end,
                 $5 = 'in_progress')
         returning id`,
        [orgId, title, category, offset, state, venue],
      )
    ).rows[0].id;
  ids.open = await session(T.open, "published", "2 days");
  ids.live = await session(T.live, "in_progress", "-12 minutes");
  ids.done = await session(T.done, "completed", "-1 day");

  // A presenter in a company with a team colour, on all three.
  const presenterEmail = `presenter@${domain}`;
  const presenter = await admin.auth.admin.createUser({ email: presenterEmail, password: PASSWORD, email_confirm: true });
  if (presenter.error) throw presenter.error;
  users.push(presenter.data.user.id);
  const company = (await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'صنف', '#ff9a2e') returning id`, [orgId])).rows[0].id;
  const presenterId = (
    await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, job_title, company_id) values ($1, $2, $3, 'نورة العتيبي', 'مديرة العمليات', $4) returning id`,
      [orgId, presenter.data.user.id, presenterEmail, company],
    )
  ).rows[0].id;
  for (const sessionId of Object.values(ids)) {
    await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  }

  // The member holds a seat on the live one and attended the completed one.
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.live, memberId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.done, memberId]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'حضر الجلسة', $4, 'empty'::tstzrange)`,
    [orgId, ids.done, memberId, presenterId],
  );
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function provision(): Promise<string> {
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
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  cookies = [...jar];
  return (data as { member_id: string }).member_id;
}

async function signIn(context: BrowserContext) {
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(page: Page, id: string, desktop: boolean) {
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto(`/ar/app/sessions/${id}`);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * ★ Every streamed region has landed before a capture (the lead's review of d563ee1c: the recap and the sub-nav
 * were still skeleton bars). The sections stream behind `<Suspense>`, so the page is settled when no skeleton is
 * left in #main and the sub-nav is there.
 */
async function settled(page: Page) {
  const main = page.locator("#main");
  await expect(main.getByRole("navigation", { name: "أقسام الجلسة" })).toBeVisible();
  await expect(main.locator(".animate-pulse")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page: Page, name: string) {
  await settled(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave18-sessions-event-${name}.png`), fullPage: true });
}

test("open, phone: the regions in the artboard's order, the rule's amount, and the primary in the card and the bar", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone's artboard");
  await signIn(context);
  await open(page, ids.open, false);
  const main = page.locator("#main");

  const order = await main.evaluate((root) => {
    const all = [...root.querySelectorAll("*")];
    const at = (sel: string) => all.indexOf(root.querySelector(sel) as Element);
    return [at('a[href$="/app/sessions"]'), at('[data-slot="poster-placeholder"], figure, img'), at("h1"), at('a[href*="/app/members/"]'), at("section#attend"), at('nav[aria-label="أقسام الجلسة"]'), at("section#about")];
  });
  expect(order.every((n) => n >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // ★ The language before the action (REQ-SES-011).
  const language = await main.evaluate((root) => {
    const all = [...root.querySelectorAll("*")];
    const chip = [...root.querySelectorAll("*")].find((el) => el.textContent === "العربية");
    return all.indexOf(chip as Element) < all.indexOf(root.querySelector("section#attend") as Element);
  });
  expect(language).toBe(true);

  // The phone's chips fit one row: the one-day length is drawn from `lg` only (EventDesktop.dc.html).
  await expect(main.getByText("60 دقيقة")).toBeHidden();

  const attend = main.getByRole("region", { name: "الحضور" });
  // ★ The rule's amount, never a literal (§4.45).
  await expect(attend.getByRole("button", { name: /احجز مقعدك.*\+35 عند الحضور/ })).toBeVisible();
  await expect(main).not.toContainText("+50");
  await expect(attend).toContainText("0 من 40 مقعدًا");
  await expect(attend).toContainText("يُغلق التسجيل");
  // ★ Two primaries on the phone (DEC-209): the card's and the bar's.
  await expect(page.getByRole("group", { name: "إجراءات الجلسة" }).getByRole("button", { name: /احجز مقعدك/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /نورة العتيبي/ })).toHaveAttribute("href", /\/app\/members\//);
  await capture(page, "open-390");
});

test("live, phone: a count, the check-in with «مقعدك محجوز», the rotation, and — with no frame — a story that opens nothing", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone's artboard");
  await signIn(context);
  await open(page, ids.live, false);
  const main = page.locator("#main");
  const attend = main.getByRole("region", { name: "الحضور" });
  await expect(attend).toContainText("حاضرًا الآن");
  await expect(attend.getByRole("link", { name: /تسجيل الحضور.*مقعدك محجوز/ })).toHaveAttribute("href", /\/check-in$/);
  await expect(attend).toContainText("يتغيّر كل 10 دقائق");
  await expect(attend).toContainText("+35 نقطة تصل عند انتهاء الجلسة");
  await expect(main.getByText("شاهد القصة")).toBeVisible();
  await expect(main.getByRole("link", { name: /القصة/ })).toHaveCount(0);
  // ★ The live order: the photos and the discussion before «نبذة» (DEC-209).
  const nav = main.getByRole("navigation", { name: "أقسام الجلسة" });
  const labels = await nav.getByRole("link").allTextContents();
  expect(labels.findIndex((l) => l.startsWith("النقاش"))).toBeLessThan(labels.findIndex((l) => l.startsWith("نبذة")));
  // A member never sees who attends (A33 rule 3).
  await expect(attend.getByRole("group", { name: "من يحضر" })).toHaveCount(0);
  await capture(page, "live-390");
});

test("ended and attended, phone: the outcome with the amount, «قيّم الجلسة», and the ribbon in DEC-073's words", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone's artboard");
  await signIn(context);
  await open(page, ids.done, false);
  const main = page.locator("#main");
  await expect(main.getByText(/انتهت هذه الجلسة يوم/)).toBeVisible();
  await expect(main).not.toContainText("مكتملة");
  const outcome = main.getByRole("group", { name: "نتيجة حضورك" });
  await expect(outcome).toContainText("حضرت");
  await expect(outcome).toContainText("سجّلت حضورك");
  await expect(main.getByRole("link", { name: /قيّم الجلسة/ }).first()).toHaveAttribute("href", /\/rate$/);
  // The recap: attended of reserved, a count and never who.
  await expect(main.getByRole("list", { name: "الجلسة بالأرقام" })).toBeVisible();
  // ★ No «المواد» button in the ended card: the artboard reaches the materials through the sub-nav's chip.
  await expect(main.getByRole("region", { name: "الحضور" }).getByRole("link", { name: "المواد" })).toHaveCount(0);
  await capture(page, "done-390");
});

test("desktop: the shell's bar, the hero band, the full-width action row and the room beside the sections", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop artboard");
  await signIn(context);
  await open(page, ids.open, true);
  const main = page.locator("#main");
  // The action row spans the content: wider than the hero's text column.
  const row = await main.locator("section#attend").boundingBox();
  const h1 = await main.locator("h1").boundingBox();
  expect(row!.width).toBeGreaterThan(h1!.width);
  // ★ The primary is compact, as drawn (`EventDesktop.dc.html:48`), and the facts stand in the row's other column:
  // the row stays one row — the facts' top is not below the primary's bottom.
  const primary = (await main.locator("section#attend").getByRole("button", { name: /احجز مقعدك/ }).boundingBox())!;
  expect(primary.width).toBeLessThan(row!.width / 2);
  const facts = (await main.locator("section#attend dl").boundingBox())!;
  expect(facts.y).toBeLessThan(primary.y + primary.height);
  // The bar is the phone's.
  await expect(page.getByRole("group", { name: "إجراءات الجلسة" })).toBeHidden();
  // The room, its map a link, beside the sections.
  await expect(main.getByRole("region", { name: "القاعة" })).toContainText("قاعة الرياض");
  await expect(main.getByRole("region", { name: "من يحضر" })).toContainText("لا حجوزات بعد");
  await capture(page, "desktop-1280");
});
