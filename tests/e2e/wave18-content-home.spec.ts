// ★ SCR-010 — HOME IS THE FEED (REQ-UIX-055, STORY-UIX-044, DEC-205 §2, DEC-206, DEC-207), against real local
// Supabase, with the captures the lead holds beside `Home.dc.html` (390) and `HomeDesktop.dc.html` (1280).
//
// Seeded through SQL: one org, a company with a team colour, a presenter, a member with a company and one
// without, an admin; a live session, an open one two days out, one that ended three hours ago; an
// announcement; a session with no time (so the staff strip has something to count).
//
// What it proves, beyond the pictures:
//   · the regions stand in the artboard's order, and the page has one `<h1>`;
//   · a ring is a button that opens the session's story (wave 26, DEC-251 §4 — until then it opened nothing);
//   · ★ DEC-276 (amending §4.57): reserve and waitlist are a form on the post — a member reserves without leaving the home;
//   · the like is written and survives a reload;
//   · with no company, nothing asks for one and a post still offers its seat (wave 27, DEC-255 §4);
//   · staff see «يحتاج انتباهك», a member does not;
//   · from `lg` the week is the game rail's, and the column's copy of it is not displayed.
//
// Every page-level locator comes from `#main` (DEC-145). Captures are taken after the streams settle.
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 1040 };
const LIVE = "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية";
const OPEN = "لوحة تحكم لا يهجرها أحد بعد أسبوع";
const ENDED = "الأرقام التي تكذب";
const NOTICE = "موسم الشتاء يبدأ 12 أكتوبر: ثلاث جلسات كل أسبوع.";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let emptyOrgId = "";
let openId = "";
const emails = { member: "", noCompany: "", staff: "", presenter: "", empty: "" };
const userIds: string[] = [];

async function provision(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: row, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (row as { member_id: string }).member_id;
}

async function newOrg(slug: string, domain: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الساحة', $1, 'HM', gen_random_uuid()) returning id`,
    [slug],
  );
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [rows[0].id]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [rows[0].id, domain]);
  return rows[0].id;
}

async function session(title: string, startOffset: string, minutes: number, state: string, category: string, venue: string, presenter: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, $2, 'خمس شرائح فقط، ولجنة لا تملك أكثر من عشر دقائق.', $3, 'introductory', now() + $4::interval, $5::int, now() + $4::interval + make_interval(mins => $5::int), $6, 40, $7::public.session_state, now() - interval '3 days')
     returning id`,
    [orgId, title, category, startOffset, minutes, venue, state],
  );
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, rows[0].id, presenter]);
  return rows[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `home-e2e-${tag}.example`;
  const emptyDomain = `home-empty-e2e-${tag}.example`;
  orgId = await newOrg(`home-e2e-${tag}`, domain);
  emptyOrgId = await newOrg(`home-empty-e2e-${tag}`, emptyDomain);
  emails.member = `member@${domain}`;
  emails.noCompany = `nocompany@${domain}`;
  emails.staff = `staff@${domain}`;
  emails.presenter = `presenter@${domain}`;
  emails.empty = `member@${emptyDomain}`;

  const { rows: co } = await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#35d0ff') returning id`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الرياض', 40) returning id`, [orgId]);

  const presenterId = await provision(emails.presenter, "سارة القحطاني");
  const memberId = await provision(emails.member, "ريم الشمري");
  await provision(emails.noCompany, "خالد العمري");
  const staffId = await provision(emails.staff, "فهد العنزي");
  await provision(emails.empty, "نورة العتيبي");
  await db.query(`update public.members set company_id = $1 where id = any($2::uuid[])`, [co[0].id, [presenterId, memberId, staffId]]);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [staffId]);

  const liveId = await session(LIVE, "-30 minutes", 90, "in_progress", cat[0].id, venue[0].id, presenterId);
  // Wave 26: a ring is drawn for a session with a visible story frame (REQ-STO-006). The live one has its live frame —
  // a `live` frame is a DAY's (DEC-251 §4.4), and the read model draws none without one, so it names the session's day.
  await db.query(
    `insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at)
     select $1, $2, d.id, 'live', 'e2e-live', now() - interval '30 minutes' from public.session_days d where d.session_id = $2 order by d.position limit 1
     on conflict (session_id, kind, trigger_key) do nothing`,
    [orgId, liveId],
  );
  openId = await session(OPEN, "2 days", 90, "published", cat[0].id, venue[0].id, presenterId);
  await session(ENDED, "-5 hours", 120, "completed", cat[0].id, venue[0].id, presenterId);
  // A session with no time — the staff strip's «جلسة بلا موعد».
  await db.query(`insert into public.sessions (org_id, title, abstract, category_id, level, state) values ($1, 'جلسة تنتظر موعدًا', 'بلا موعد', $2, 'introductory', 'approved')`, [orgId, cat[0].id]);
  await db.query(`insert into public.feed_announcements (org_id, author_id, body, published_at) values ($1, $2, $3, now() - interval '20 hours')`, [orgId, staffId, NOTICE]);
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  for (const id of [orgId, emptyOrgId]) if (id) await db.query(`delete from public.orgs where id = $1`, [id]);
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

async function openHome(page: Page) {
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

const shot = (page: Page, state: string, width: 390 | 1280) => page.screenshot({ path: join(SHOTS, `wave18-content-home-${state}-${width}.png`), fullPage: true });

test("★ the regions in the artboard's order, one h1, rings that open the story, links that reserve nothing — 390", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await openHome(page);
  const main = page.locator("#main");

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("الرئيسية");
  const rings = main.getByRole("list", { name: "جلسات اليوم وما حوله" });
  await expect(rings).toBeVisible();
  // ★ Wave 26 (ledger): the ring is no longer an image that opens nothing — it is a button that opens the story.
  await expect(rings.getByRole("button", { name: new RegExp(`${LIVE}، مباشر`) })).toHaveAttribute("aria-haspopup", "dialog");

  // The days: today (the live post), the coming day (the open post), and yesterday or today for the recap.
  await expect(main.getByRole("heading", { level: 2, name: "اليوم" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 3, name: LIVE })).toBeAttached();
  await expect(main.getByText(NOTICE, { exact: true })).toBeVisible();
  await expect(main.getByText("اكتملت", { exact: true })).toBeVisible();

  // ★ DEC-276: the open post's reserve is a button in a form on the home, not a link to the event page.
  const reserve = main.getByRole("button", { name: /احجز مقعدك/ });
  await expect(reserve).toBeVisible();
  await expect(main.getByRole("link", { name: /احجز مقعدك/ })).toHaveCount(0);

  // With a company, there is no status line and no staff strip.
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "يحتاج انتباهك" })).toHaveCount(0);

  // The order of the regions: the ring row, the first day, the propose band last.
  const order = await main.evaluate((el) => {
    const marks = [el.querySelector('ul[aria-label="جلسات اليوم وما حوله"]'), el.querySelector("section h2"), [...el.querySelectorAll("h2")].find((h) => h.textContent === "عندك موضوع؟")];
    return marks.map((m) => (m ? [...el.querySelectorAll("*")].indexOf(m) : -1));
  });
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  await shot(page, "member", 390);
});

test("★ a like is written, and it is still there after a reload", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.member);
  await openHome(page);
  const post = page.locator("#main article", { hasText: OPEN }).first();
  const like = post.getByRole("button", { name: /^إعجاب/ });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toHaveAccessibleName("إعجاب 1");
  await expect.poll(async () => (await db.query(`select count(*)::int as n from public.reactions where session_id = $1 and kind = 'like'`, [openId])).rows[0].n).toBe(1);

  await openHome(page);
  const again = page.locator("#main article", { hasText: OPEN }).first().getByRole("button", { name: /^إعجاب/ });
  await expect(again).toHaveAttribute("aria-pressed", "true");
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "false");
});

// wave 27 (DEC-255 §4, REQ-PRF-012): a member no longer chooses a company, so one with none is asked nothing and
// reserves like anyone else.
test("★ no company: nothing asks for one, and a post still offers its seat", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.noCompany);
  await openHome(page);
  const main = page.locator("#main");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(main.getByText(/اختر شركتك/)).toHaveCount(0);
  await expect(main.getByRole("button", { name: /احجز مقعدك/ }).first()).toBeVisible();
  await shot(page, "no-company", 390);
});

test("★ staff see «يحتاج انتباهك», counts as links to the queues", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.staff);
  await openHome(page);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "يحتاج انتباهك" })).toBeVisible();
  await expect(main.getByRole("link", { name: /بلا موعد/ })).toHaveAttribute("href", "/ar/app/admin/sessions");
  await shot(page, "staff", 390);
});

test("★ desktop: the week is the game rail's, and the column's copy is not displayed — 1280", async ({ context, page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(context, emails.member);
  await openHome(page);
  const rail = page.getByRole("complementary", { name: "أسبوعك في الساحة" });
  await expect(rail).toBeVisible();
  // The post lays the poster beside the copy: the title is visible text on a wide card.
  await expect(page.locator("#main").getByRole("heading", { level: 3, name: OPEN })).toBeVisible();

  // ★ The poster stands BESIDE the copy at its drawn width — 260 for the live post, 160 for the open one
  // (HomeDesktop.dc.html:58, :83) — whole, 4:5. The first build collapsed it to a 40 px strip: its width class
  // was built from an interpolation and Tailwind never generated it (feed-classes.test.ts now refuses that).
  for (const [title, width] of [[LIVE, 260], [OPEN, 160]] as const) {
    const post = page.locator("#main article", { hasText: title }).first();
    const poster = await post.getByRole("link", { name: `ملصق جلسة ${title}` }).boundingBox();
    const heading = await post.getByRole("heading", { level: 3 }).boundingBox();
    expect(poster, title).not.toBeNull();
    expect(heading, title).not.toBeNull();
    expect(Math.abs(poster!.width - width), `${title}: poster width ${poster!.width}`).toBeLessThan(2);
    expect(Math.abs(poster!.width / poster!.height - 0.8), `${title}: poster ratio`).toBeLessThan(0.02);
    // Side by side: the heading starts beside the poster, not under it.
    expect(heading!.y, `${title}: the copy is beside the poster`).toBeLessThan(poster!.y + poster!.height);
    expect(heading!.width, `${title}: the heading has room`).toBeGreaterThan(160);
  }
  await shot(page, "member", 1280);
});

test("★ an empty org: the home asks for a proposal — 390", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.empty);
  await openHome(page);
  const main = page.locator("#main");
  await expect(main.getByText("لا شيء في الساحة بعد")).toBeVisible();
  await expect(main.getByRole("link", { name: "اقترح موضوعًا" })).toHaveAttribute("href", "/ar/app/propose");
  await expect(main.getByRole("list", { name: "جلسات اليوم وما حوله" })).toHaveCount(0);
  await shot(page, "empty", 390);
});

// ★ DEC-276 (the owner's ruling): pressing «احجز مقعدك» on the home reserves in place — the URL stays the home, the
// post turns into «مقعدك محجوز», and the seat is in `rsvps`. ★ DEC-277: moment 1 plays on the post — the ticket rises
// once, from the action's own result, and a reload shows the static booked face with no ticket.
test("★ reserving from the home holds the seat without leaving it, and the ticket plays once", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, emails.noCompany);
  await openHome(page);
  const post = page.locator("#main article", { hasText: OPEN }).first();
  const ticket = post.locator("[data-moment='ticket']");
  await post.getByRole("button", { name: /احجز مقعدك/ }).click();
  await expect(ticket).toHaveCount(1);
  await expect(post.locator("[data-moment='stamp']")).toHaveText("محجوز");
  // Paused the instant the stamp has landed — the moment's rest — for the capture, then resumed.
  await page.waitForFunction(
    () => {
      if (!document.querySelector("#main [data-moment='ticket'][data-step='leave']")) return false;
      for (const a of document.getAnimations()) a.pause();
      return true;
    },
    undefined,
    { polling: "raf", timeout: 15_000 },
  );
  await post.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, "wave18-content-home-reserve-moment-390.png") });
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await expect(ticket).toHaveCount(0);
  await expect(post.getByText("مقعدك محجوز")).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/app\/?$/);
  await expect
    .poll(async () => (await db.query(`select count(*)::int as n from public.rsvps r join public.members m on m.id = r.member_id where r.session_id = $1 and m.email = $2 and r.status = 'confirmed'`, [openId, emails.noCompany])).rows[0].n)
    .toBe(1);

  await openHome(page);
  const again = page.locator("#main article", { hasText: OPEN }).first();
  await expect(again.getByText("مقعدك محجوز")).toBeVisible();
  await expect(again.locator("[data-moment='ticket']")).toHaveCount(0);
});
