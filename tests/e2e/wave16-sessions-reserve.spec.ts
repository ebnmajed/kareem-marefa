// Wave 16 — moment 1, الحجز, on the event page's action card (REQ-UIX-045,
// REQ-UIX-044, REQ-UIX-020, DEC-195 §2.1 / §2.7 / §7, DEC-197 §7).
//
// ★★ The trigger is the reserve action's own result, in the client that
// pressed. So the moment plays once on the press, and a reload, a back
// navigation and another device all show the static state. A repeat submit, a
// refused reservation and reduced motion never animate.
//
// ★ The lead runs the trace case (`@trace`) and the captures on a PRODUCTION
// build, phone project, 390 × 844, honouring `E2E_SHOTS_DIR`:
//   .qa-shots/rtl/wave16-sessions-reserve-{animated,static}.png
//   .qa-shots/rtl/wave16-sessions-reserve-waitlist-{animated,static}.png
// `animated` is taken with every animation paused at the stamp's rest, `static`
// under reduced motion once the whisper is up.
//
// Every page-level locator comes from `#main` (DEC-145). A toast is asserted by
// its exact text (it lives in the shell's region, outside `#main`).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");
const PASSWORD = "correct-horse-battery-staple-9";
const FRAME_MS = 1000 / 60;
const JITTER_MS = 1;

const WHISPER_MANUAL = "حُجز مقعدك — أضِف الجلسة إلى تقويمك من الزرّ";
const WHISPER_WAITLIST = "سنُعلمك فور توفّر مقعد لك";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let openId = "";
let fullId = "";
let closingId = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // Desktop and phone workers share one database: tag by worker, project AND time.
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w16-reserve-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة لحظة الحجز', $1, 'WR', gen_random_uuid()) returning id`,
    [`w16-reserve-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  // `sessions.category_id` is NOT NULL: the fixture org needs a category.
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId]);
  const session = async (title: string, capacity: number) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, published_at, custom_venue_name)
       values ($1, $2, 'ملخص الجلسة.', $4, 'introductory', 'ar', 'published', now() + interval '5 days', 60, now() + interval '5 days 1 hour', $3, now() - interval '1 day', 'قاعة الابتكار')
       returning id`,
      [orgId, title, capacity, cat[0].id],
    );
    return rows[0].id;
  };
  openId = await session("كيف اختصرنا وقت التقارير الشهرية", 40);
  fullId = await session("ورشة قراءة القوائم المالية", 1);
  closingId = await session("جلسة يُغلق حجزها", 40);
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

/** Signs a new member in; returns the member's id. */
async function signIn(context: BrowserContext, who: string): Promise<string> {
  const email = `${who}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `عضو ${who}` } });
  if (error && !/already/i.test(error.message)) throw error;
  if (data?.user) users.push(data.user.id);
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach(({ name, value }) => jar.push({ name, value })) },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (envelope as { member_id: string }).member_id;
}

/** Waits out React's streamed Suspense containers (DEC-145), then hydration. */
async function settled(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

/**
 * Counts every ticket that ever appears on the page, from the first script on. A moment that plays is one
 * ticket; the static state is none. A MutationObserver sees a ticket even if it lived for one frame.
 */
async function countTickets(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tickets: number };
    w.__tickets = 0;
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("[data-moment='ticket']")) {
        if (!seen.has(el)) {
          seen.add(el);
          w.__tickets += 1;
        }
      }
    }).observe(document, { subtree: true, childList: true });
  });
}
const tickets = (page: Page) => page.evaluate(() => (window as unknown as { __tickets: number }).__tickets);

const reserveButton = (page: Page) => page.locator("#main").getByRole("button", { name: /احجز مقعدك|انضم لقائمة الانتظار/ }).filter({ visible: true });
const ticket = (page: Page) => page.locator("#main [data-moment='ticket']");

async function capture(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave16-sessions-${name}.png`) });
}

/** Pauses every animation the instant the stamp has landed — the moment's rest — and returns once paused. */
async function pauseAtRest(page: Page) {
  await page.waitForFunction(
    () => {
      const t = document.querySelector("[data-moment='ticket'][data-step='leave']");
      if (!t) return false;
      for (const a of document.getAnimations()) a.pause();
      return true;
    },
    undefined,
    { polling: "raf", timeout: 15_000 },
  );
}
const resume = (page: Page) => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

test("★★ moment 1 plays once, on the press — and a reload, a back navigation and another device show the static state", async ({ context, page, browser }, testInfo) => {
  test.slow();
  const phone = testInfo.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await countTickets(page);
  await signIn(context, `once-${testInfo.project.name}`);
  await page.goto(`/ar/app/sessions/${openId}`);
  await settled(page);
  const main = page.locator("#main");
  const region = main.getByRole("region", { name: "الحضور" });

  // Nothing moves before the server answers (REQ-UIX-007).
  await reserveButton(page).click();
  await expect(ticket(page)).toHaveCount(1);
  if (phone) {
    await pauseAtRest(page);
    await expect(main.locator("[data-moment='stamp']")).toHaveText("محجوز");
    await capture(page, "reserve-animated");
    await resume(page);
  }
  await expect(ticket(page)).toHaveCount(0);
  await expect(region.getByText("تم تأكيد حجزك")).toBeVisible();
  await expect(main.getByRole("button", { name: "أضِف إلى تقويمك" }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText(WHISPER_MANUAL, { exact: true })).toBeVisible();
  expect(await tickets(page)).toBe(1);

  // ★ No `will-change` is left on anything once it has finished.
  expect(await page.evaluate(() => [...document.querySelectorAll("#attend *")].filter((el) => getComputedStyle(el).willChange !== "auto").length)).toBe(0);
  // ★ The scope's element is never transformed.
  expect(await page.evaluate(() => [...document.querySelectorAll(".theme-play")].map((el) => getComputedStyle(el).transform))).toEqual(["none"]);

  // A reload: the static state, nothing plays.
  await page.reload();
  await settled(page);
  await expect(region.getByText("تم تأكيد حجزك")).toBeVisible();
  expect(await tickets(page)).toBe(0);

  // A back navigation: out to the timeline, back again.
  await page.goto("/ar/app");
  await settled(page);
  await page.goBack();
  await settled(page);
  await expect(region.getByText("تم تأكيد حجزك")).toBeVisible();
  expect(await tickets(page)).toBe(0);

  // Another device, the same member: the static state.
  const other = await browser.newContext({ ...(phone ? { viewport: { width: 390, height: 844 } } : {}) });
  await other.addCookies(await context.cookies());
  const second = await other.newPage();
  await countTickets(second);
  await second.goto(`/ar/app/sessions/${openId}`);
  await settled(second);
  await expect(second.locator("#main").getByRole("region", { name: "الحضور" }).getByText("تم تأكيد حجزك")).toBeVisible();
  expect(await tickets(second)).toBe(0);
  await other.close();
});

test("★★ under reduced motion the static state is complete: the face, the capacity, the cancel, the whisper — and nothing moves", async ({ browser }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  const context = await browser.newContext({ reducedMotion: "reduce", ...(phone ? { viewport: { width: 390, height: 844 } } : {}) });
  const page = await context.newPage();
  await countTickets(page);
  await signIn(context, `still-${testInfo.project.name}`);
  await page.goto(`/ar/app/sessions/${openId}`);
  await settled(page);
  const region = page.locator("#main").getByRole("region", { name: "الحضور" });

  await reserveButton(page).click();
  await expect(region.getByText("تم تأكيد حجزك")).toBeVisible();
  await expect(region.getByText(/\d+ من 40/)).toBeVisible();
  await expect(region.getByRole("button", { name: "إلغاء الحجز" })).toBeVisible();
  await expect(page.getByText(WHISPER_MANUAL, { exact: true })).toBeVisible();
  expect(await tickets(page)).toBe(0);
  if (phone) await capture(page, "reserve-static");
  await context.close();
});

test("★ the waitlisted variant — the same ticket, «قائمة الانتظار · N», the waitlist's tone", async ({ context, page, browser }, testInfo) => {
  test.slow();
  const phone = testInfo.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  // The one seat is taken first, by someone else.
  const holder = await signIn(context, `holder-${testInfo.project.name}`);
  await db.query(`delete from public.rsvps where session_id = $1`, [fullId]);
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, fullId, holder]);

  await countTickets(page);
  await signIn(context, `wait-${testInfo.project.name}`);
  await page.goto(`/ar/app/sessions/${fullId}`);
  await settled(page);
  const main = page.locator("#main");
  await main.getByRole("button", { name: /انضم لقائمة الانتظار/ }).filter({ visible: true }).click();
  await expect(ticket(page)).toHaveCount(1);
  await pauseAtRest(page);
  const stamp = main.locator("[data-moment='stamp']");
  await expect(stamp).toHaveText("قائمة الانتظار · 1");
  await expect(stamp.locator("bdi")).toHaveText("1");
  // DEC-073's waitlist tone — the badge's `live` — never a team colour.
  expect(await stamp.getAttribute("class")).toContain("bg-live-bg");
  if (phone) await capture(page, "reserve-waitlist-animated");
  await resume(page);
  await expect(ticket(page)).toHaveCount(0);
  await expect(main.getByText("على قائمة الانتظار")).toBeVisible();
  await expect(page.getByText(WHISPER_WAITLIST, { exact: true })).toBeVisible();

  if (phone) {
    // The static counterpart, from a reduced-motion member's own press.
    const still = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    const p2 = await still.newPage();
    await signIn(still, `wait-still-${testInfo.project.name}`);
    await p2.goto(`/ar/app/sessions/${fullId}`);
    await settled(p2);
    await p2.locator("#main").getByRole("button", { name: /انضم لقائمة الانتظار/ }).filter({ visible: true }).click();
    await expect(p2.locator("#main").getByText("على قائمة الانتظار")).toBeVisible();
    await expect(p2.getByText(WHISPER_WAITLIST, { exact: true })).toBeVisible();
    await capture(p2, "reserve-waitlist-static");
    await still.close();
  }
});

test("★ a refused reservation says so in the card, and nothing animates", async ({ context, page }, testInfo) => {
  if (testInfo.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  await countTickets(page);
  await signIn(context, `refused-${testInfo.project.name}`);
  await db.query(`update public.sessions set rsvp_deadline_at = null where id = $1`, [closingId]);
  await page.goto(`/ar/app/sessions/${closingId}`);
  await settled(page);
  // The deadline passes between the render and the press.
  await db.query(`update public.sessions set rsvp_deadline_at = now() - interval '1 minute' where id = $1`, [closingId]);
  await reserveButton(page).click();
  await expect(page.locator("#main").getByRole("alert")).toHaveText("تعذّر الحجز: انتهى وقت الحجز لهذه الجلسة.");
  expect(await tickets(page)).toBe(0);
});

test("★★ @trace moment 1 on a 4× throttled CPU: no frame over 16 ms", async ({ context, page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone is the budget's case");
  test.skip(browser.browserType().name() !== "chromium", "CDP throttling and tracing are Chromium's");
  await page.setViewportSize({ width: 390, height: 844 });
  // The window is the moment's own animations (DEC-197 Q4): from the ticket's `animationstart` to the leave's
  // `animationend`. The commit that applies the refreshed page is measured beside it, not inside the gate —
  // and the ticket is armed two frames after it, so the two never share a frame.
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number[]; __sampling: boolean; __commit: number };
    w.__frames = [];
    w.__sampling = false;
    w.__commit = 0;
    let last = 0;
    const tick = (t: number) => {
      if (w.__sampling && last) w.__frames.push(t - last);
      last = w.__sampling ? t : 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // DEC-197 Q4, to the letter: from the ticket's `animationstart` to the last `animationend`, the leave's.
    document.addEventListener(
      "animationstart",
      (event) => {
        if (event.animationName === "moment-ticket-rise" && !w.__sampling) {
          performance.mark("moment-1-start");
          w.__sampling = true;
        }
      },
      true,
    );
    document.addEventListener(
      "animationend",
      (event) => {
        if (event.animationName === "moment-ticket-leave" && w.__sampling) {
          performance.mark("moment-1-end");
          w.__sampling = false;
        }
      },
      true,
    );
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__commit = Math.max(w.__commit, entry.duration);
    }).observe({ type: "long-animation-frame", buffered: true });
  });
  await signIn(context, `trace-${Date.now()}`);
  await page.goto(`/ar/app/sessions/${openId}`);
  await settled(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing"] });
  await reserveButton(page).click();
  await expect(ticket(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(ticket(page)).toHaveCount(0, { timeout: 30_000 });
  const trace = await browser.stopTracing();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, "wave16-sessions-reserve-trace.json"), trace);

  const { frames, commit } = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __commit: number };
    return { frames: w.__frames, commit: w.__commit };
  });
  const longest = Math.max(...frames);
  testInfo.annotations.push({ type: "frames", description: `${frames.length} frames in the window; the longest ${longest.toFixed(1)} ms` });
  testInfo.annotations.push({ type: "refresh commit", description: `the longest animation frame outside the gate: ${commit.toFixed(1)} ms` });
  expect(frames.length, "the window saw frames").toBeGreaterThan(10);
  expect(longest, `no frame over one 60 Hz frame (+${JITTER_MS} ms jitter)`).toBeLessThanOrEqual(FRAME_MS + JITTER_MS);
});
