// Wave 16 — moment 2 on a throttled CPU: no frame over 16 ms (REQ-UIX-020,
// REQ-UIX-046, DEC-195 §7 demonstrable 1, DEC-197 Q4).
//
// ★ The lead runs this on a PRODUCTION build (`next start`), phone project only:
// 44 particles and a coin on a mid-range phone is the budget's hardest case.
//
// How it measures:
//   · CPU throttled 4× through CDP — Lighthouse's «mid-range phone».
//   · The window is the moment's own animations (DEC-197 Q4): from the render
//     that turns the moment to `playing` to the one that returns it to `static`,
//     marked with `performance.mark()` by an init script watching `data-phase`.
//     The commit that applies the refreshed page — the form swapped for the
//     static state — is the `arming` phase before it (the moment waits two
//     frames for it to be painted), and its frames are REPORTED beside the
//     window, not inside the gate.
//   · Inside the window a `requestAnimationFrame` sampler records every frame
//     interval; the gate is that none is longer than one 60 Hz frame (16.7 ms)
//     plus 1 ms of timer jitter — i.e. no frame was missed.
//   · A Chromium trace (`devtools.timeline`, the frame category, user timing) is
//     written beside the captures for the lead to open.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.skip(({ browserName }) => browserName !== "chromium", "CDP throttling and tracing are Chromium's");

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let sessionId = "";
const users: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${testInfo.project.name}-${Date.now()}`;
  domain = `w16-trace-${tag}.example`;
  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة قياس اللحظة', $1, 'WT', gen_random_uuid()) returning id`,
    [`w16-trace-${tag}`],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(`insert into public.companies (org_id, name, team_color) values ($1, 'شركة', '#ff9a2e')`, [orgId]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'فني') returning id`, [orgId]);
  const { rows: s } = await db.query<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, capacity, state, published_at, allow_walk_ins, custom_venue_name)
     values ($1, 'جلسة القياس', 'ملخص', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes', 40, 'in_progress', now() - interval '1 day', true, 'القاعة')
     returning id`,
    [orgId, cat[0].id],
  );
  sessionId = s[0].id;
});

test.afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: string, asAdmin = false): Promise<void> {
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
  const memberId = (envelope as { member_id: string }).member_id;
  await db.query(`update public.members set company_id = (select id from public.companies where org_id = $2 limit 1) where id = $1`, [memberId, orgId]);
  if (asAdmin) await db.query(`update public.members set org_role = 'admin' where id = $1`, [memberId]);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

/** Marks the moment's window and samples every frame inside it. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number[]; __arming: number[]; __sampling: "no" | "arming" | "playing" };
    w.__frames = [];
    w.__arming = [];
    w.__sampling = "no";
    let last = 0;
    const tick = (t: number) => {
      if (w.__sampling !== "no" && last) (w.__sampling === "playing" ? w.__frames : w.__arming).push(t - last);
      last = w.__sampling !== "no" ? t : 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new MutationObserver(() => {
      const el = document.querySelector("[data-moment='check-in']");
      const phase = el?.getAttribute("data-phase");
      if (phase === "arming" && w.__sampling === "no") {
        performance.mark("moment-2-arming");
        w.__sampling = "arming";
      } else if (phase === "playing" && w.__sampling !== "playing") {
        performance.mark("moment-2-start");
        w.__sampling = "playing";
      } else if (phase === "static" && w.__sampling === "playing") {
        performance.mark("moment-2-end");
        w.__sampling = "no";
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase"] });
  });
}

test("★★ moment 2 on a 4× throttled CPU: no frame over 16 ms", async ({ context, page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone is the budget's hardest case");
  await page.setViewportSize({ width: 390, height: 844 });
  await instrument(page);

  await signIn(context, "host", true);
  await page.goto(`/ar/app/sessions/${sessionId}/host`);
  const code = (await page.locator("#main p[dir='ltr']").first().textContent())?.trim() ?? "";
  await signIn(context, "trace");
  await page.goto(`/ar/app/sessions/${sessionId}/check-in`);

  const main = page.locator("#main");
  const boxes = main.locator("input[maxlength='1']");
  const assembled = main.locator('input[type="hidden"][name="code"]');
  await expect(async () => {
    for (const [i, ch] of Array.from(code).entries()) await boxes.nth(i).fill(ch);
    await expect(assembled).toHaveValue(code, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing"] });

  await main.getByRole("button", { name: "تسجيل الحضور" }).last().click();
  await expect(main.locator("[data-moment='check-in']")).toHaveAttribute("data-phase", "playing", { timeout: 20_000 });
  await expect(main.locator("[data-moment='check-in']")).toHaveAttribute("data-phase", "static", { timeout: 20_000 });

  const trace = await browser.stopTracing();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, "wave16-checkin-moment-trace.json"), trace);

  const { frames, arming } = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __arming: number[] };
    return { frames: w.__frames, arming: w.__arming };
  });
  const longest = Math.max(...frames);
  testInfo.annotations.push({ type: "frames", description: `${frames.length} frames in the window; the longest ${longest.toFixed(1)} ms` });
  // Reported, not gated (DEC-197 Q4): the commit that swapped the form for the static state.
  testInfo.annotations.push({ type: "the swap, beside the window", description: `${arming.length} frames; the longest ${arming.length ? Math.max(...arming).toFixed(1) : "—"} ms` });
  expect(frames.length, "the window saw frames").toBeGreaterThan(10);
  expect(longest, `no frame over one 60 Hz frame (+${JITTER_MS} ms jitter)`).toBeLessThanOrEqual(FRAME_MS + JITTER_MS);
});
