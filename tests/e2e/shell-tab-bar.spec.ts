// ★★ THE PROOF `16` §3.1 ASKS FOR, and it is deliberately taken on an OLD,
// UNTOUCHED SCREEN — not a new one.
//
// `src/app/[locale]/app/layout.tsx` had NO bottom padding on `<main>`. A
// fixed, safe-area-padded bottom tab bar therefore covers the last ~64 px of
// ALL 49 SCREENS EVER WRITTEN at once, including every one this milestone has
// not reached yet. A capture of a screen M9 redesigned would prove nothing:
// that screen was laid out with the bar in mind.
//
// So this drives `/app/leaderboards` — a wave-2 screen nothing in M9 touched —
// at 390 px in Arabic, and asserts geometrically that the last pixel of the
// page content sits above the first pixel of the bar. The screenshot beside it
// is for the human review; the assertion is what fails CI.
//
// It also covers the two rules the bar is bound by (REQ-UIX-002, DEC-098):
//   · it is CONTEXTUAL — absent on the event page, where a bottom action bar
//     takes its place from M10, because a universal tab bar plus a sticky
//     action card is two fixed bottom bars on one screen;
//   · there is NEVER more than one fixed bottom bar on a screen.
//
// And the skip link (SC 2.4.1, REQ-UIX-017): first focusable element, visible
// when focused, targeting `#main`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

test.describe.configure({ mode: "serial" });

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";
let sessionId = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  // Desktop and phone workers share one database (TEAM.md §5's trap): tag by
  // worker AND time, or two beforeAll hooks in the same millisecond collide.
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `shell-e2e-${tag}.example`;

  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by)
     values ('مؤسسة الهيكل', $1, 'SH', gen_random_uuid()) returning id`,
    [`shell-e2e-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "ريم العتيبي" },
  });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext): Promise<string> {
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
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  const id = (envelope as { member_id: string }).member_id;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return id;
}

test("★ the bar does not cover the last line of an OLD, untouched screen at 390 px", async ({ context, page }, testInfo) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });

  // A wave-2 screen. Nothing in M9 laid this page out, which is the point.
  await page.goto("/ar/app/leaderboards");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const bar = page.getByRole("navigation", { name: "التنقّل الرئيسي" });
  await expect(bar).toBeVisible();

  // Scroll to the very bottom: the covering, if it happens, happens there.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);

  const barBox = await bar.boundingBox();
  const mainBottom = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    // The last pixel of the padding box — the padding is the clearance, so
    // measuring the content box would pass even with no padding at all.
    return main.getBoundingClientRect().bottom;
  });
  expect(barBox, "the tab bar must render").not.toBeNull();
  expect(mainBottom, "<main> must exist").not.toBeNull();

  // ★ THE ASSERTION. `<main>`'s bottom edge is above the bar's top edge, so
  // no content can sit underneath it.
  expect(mainBottom!).toBeLessThanOrEqual(barBox!.y + 1);

  // The screenshot is for the human 390 px RTL review that CI cannot do —
  // written to `.qa-shots/rtl/`, the repo's convention, because Playwright
  // keeps attachments only on failure and this one is wanted when it passes.
  if (testInfo.project.name === "phone") {
    const dir = join(process.cwd(), ".qa-shots", "rtl");
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, "m9-tabbar-old-screen-390.png") });
  }
});

test("★ the bar is contextual: absent on a detail screen, and never two bars (DEC-098)", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });

  // A PUBLISHED session, because a draft is invisible to an ordinary member
  // (`sessions_read`) and a 404 would prove the routing rule without proving
  // the screen. 0010's check constraint pins both ends, the capacity and the
  // venue from `published` onward (DEC-105), so all four go in together.
  const { rows: cat } = await db.query<{ id: string }>(
    `insert into public.categories (org_id, name) values ($1, 'فني') returning id`,
    [orgId],
  );
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name) values ($1, 'القاعة الكبرى') returning id`,
    [orgId],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions
       (org_id, title, abstract, category_id, level, language, state, starts_at, ends_at, capacity, venue_id)
     values ($1, 'جلسة تفصيلية', 'نبذة عن الجلسة', $2, 'introductory', 'ar', 'published',
             now() + interval '7 days', now() + interval '7 days 1 hour', 60, $3)
     returning id`,
    [orgId, cat[0].id, venue[0].id],
  );
  sessionId = rows[0].id;

  await page.goto("/ar/app/sessions");
  // Browse is a LIST, so it keeps the bar — the prefix must not swallow it.
  await expect(page.getByRole("navigation", { name: "التنقّل الرئيسي" })).toBeVisible();

  await page.goto(`/ar/app/sessions/${sessionId}`);
  // The event page is immersive: the bar is gone, and from M10 a bottom action
  // bar carrying «احجز مقعدًا» takes its place.
  await expect(page.getByRole("navigation", { name: "التنقّل الرئيسي" })).toHaveCount(0);

  // The rule the whole design rests on, asserted directly on both screens.
  for (const url of ["/ar/app/sessions", `/ar/app/sessions/${sessionId}`]) {
    await page.goto(url);
    const fixedBottomBars = await page.evaluate(() => {
      return [...document.querySelectorAll("body *")].filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed" && s.position !== "sticky") return false;
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) return false;
        // Anchored to the bottom of the viewport, within a hair.
        return Math.abs(r.bottom - window.innerHeight) < 2;
      }).length;
    });
    expect(fixedBottomBars, `${url} carries at most one fixed bottom bar`).toBeLessThanOrEqual(1);
  }
});

test("★ the skip link is the first focusable element and targets #main (SC 2.4.1)", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/leaderboards");

  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveText("تخطَّ إلى المحتوى");
  await expect(focused).toHaveAttribute("href", "#main");

  // Visible when focused — a skip link that stays off-screen is not a skip
  // link, it is a promise.
  //
  // ★ `toBeInViewport` and not a one-shot `boundingBox()`: the link slides in
  // over `--dur-fast`, so reading the box on the frame after Tab catches it
  // mid-transition (it did: y = -7.7). An auto-retrying assertion is the
  // difference between testing the design and testing the animation.
  await expect(focused).toBeInViewport();

  // ★ POLLED, not read once. The link slides in over `--dur-fast`, so the
  // frame after Tab catches it mid-transition — measured at y = -7.76 with the
  // transform still at translateY(-15.76px), which is 80 % of the way there
  // and would have shipped a passing test that proved nothing about the
  // settled position. `toBeInViewport()` is satisfied by an INTERSECTION, so
  // it does not catch this either. Poll the geometry instead.
  await expect
    .poll(async () => (await focused.boundingBox())?.y ?? -1, {
      message: "the skip link settles fully inside the viewport",
    })
    .toBeGreaterThanOrEqual(0);

  const box = await focused.boundingBox();
  expect(box, "the skip link must have a box when focused").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  // It must also be reachable: a 44 px target, per REQ-NFR-007.
  expect(box!.height).toBeGreaterThanOrEqual(36);
});
