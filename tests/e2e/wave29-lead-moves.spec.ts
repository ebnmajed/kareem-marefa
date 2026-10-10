// Wave 29, PR C — the moves (DEC-280 §5 – §6; REQ-UIX-121 … REQ-UIX-130; TRN-01 … TRN-10).
//
// A recorder wraps `document.startViewTransition` (React calls it for the navigation) and keeps, for each
// transition, the kind on `<html data-nav>` and the pseudo-elements that actually animated. So the spec proves what
// played, not what the CSS says: the poster's group flew on a jump, back mirrored it, a tab switched from its side,
// nothing animated under reduced motion, and the console never carried a kind. Real local Supabase, one org of its own,
// a session with a rendered poster written the way the worker writes it. Captures land at
// `.qa-shots/rtl/wave29-lead-moves-<state>-390.png`, honouring `E2E_SHOTS_DIR`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

// A 1×1 PNG — the bytes only have to be a PNG; the card and the hero draw it whole.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PASSWORD = "correct-horse-battery-staple-9";
const PHONE = { width: 390, height: 844 };
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let sessionId = "";
let memberEmail = "";
let adminEmail = "";
const userIds: string[] = [];

type Played = { nav: string | null; still: boolean; animated: string[]; longest: number; url?: string };

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `trn29-e2e-${tag}.example`;
  const one = async <T,>(sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] as T;

  orgId = (await one<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ($1, $2, 'TRN', gen_random_uuid()) returning id`, [`مؤسسة الحركة ${tag}`, `trn29-e2e-${tag}`])).id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const category = await one<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إنتاج') returning id`, [orgId]);
  const venue = await one<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'الاستوديو', 40) returning id`, [orgId]);
  sessionId = (
    await one<{ id: string }>(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
       values ($1, 'الإضاءة في الليل', 'ملخص', $2, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour', $3, 30, now() + interval '2 days', now() + interval '2 days', 'published', now() - interval '1 day')
       returning id`,
      [orgId, category.id, venue.id],
    )
  ).id;
  const doc = await one<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by) values ($1, 'poster', $2::jsonb, $3, null) returning id`,
    [orgId, JSON.stringify({ schemaVersion: 1, layers: [] }), sessionId],
  );
  await db.query(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc.id]);
  const path = `${orgId}/exports/${doc.id}/master.png`;
  await db.query(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'master', 'png', 800, 1000, $3, $4, 'ready', $5, now())`,
    [orgId, doc.id, path, PNG.byteLength, `fp-${doc.id}`],
  );
  const { error: up } = await admin.storage.from("exports").upload(path, PNG, { contentType: "image/png", upsert: true });
  if (up) throw up;

  // One generated frame, inside the 24 hours, so the home's ring row has a ring to zoom out of (REQ-STO-001).
  await db.query(
    `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, 'published', 'published', now() - interval '30 minutes')`,
    [orgId, sessionId],
  );

  memberEmail = `member@${domain}`;
  adminEmail = `admin@${domain}`;
  for (const [email, name] of [[memberEmail, "عضو الحركة"], [adminEmail, "مدير الحركة"]]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string): Promise<string> {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
  return (data as { member_id: string }).member_id;
}

/** Records every view transition: the kind at its start, and the pseudo-elements that animated once it was ready. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __played: Played[]; __flights: { arriving: boolean; nav: string | null }[] };
    w.__played = [];
    w.__flights = [];
    // The poster's flight is a FLIP from a remembered rectangle: keyframes with `transformOrigin: "0 0"` and a scale.
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const first = Array.isArray(keyframes) ? (keyframes[0] as Record<string, unknown>) : null;
      if (first && first.borderRadius !== undefined) {
        w.__flights.push({ arriving: first.borderRadius === "50%", nav: "story" });
      }
      if (first && String(first.filter ?? "").includes("blur") && first.transform === "scale(0.94)") {
        w.__flights.push({ arriving: false, nav: `rise:${document.documentElement.dataset.nav ?? ""}` });
      }
      if (first && first.transformOrigin === "0 0" && String(first.transform).includes("scale(")) {
        const easing = typeof options === "object" && options ? String(options.easing) : "";
        w.__flights.push({ arriving: easing.includes("1.4"), nav: document.documentElement.dataset.nav ?? null });
      }
      return animate.call(this, keyframes, options);
    };
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = ((arg: unknown) => {
      const entry: Played = { nav: document.documentElement.dataset.nav ?? null, still: "still" in document.documentElement.dataset, animated: [], longest: 0, url: location.pathname };
      w.__played.push(entry);
      const t = original(arg as never);
      t.ready
        .then(() => {
          const vt = document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? "").startsWith("::view-transition"));
          entry.animated = vt.map((a) => (a.effect as KeyframeEffect).pseudoElement!);
          entry.longest = Math.max(0, ...vt.map((a) => Number(a.effect?.getComputedTiming().duration) || 0));
        })
        .catch(() => entry.animated.push("aborted"));
      return t;
    }) as typeof document.startViewTransition;
  });
}

const played = (page: Page) => page.evaluate(() => (window as unknown as { __played: Played[] }).__played);

async function capture(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave29-lead-moves-${state}-390.png`) });
}

test("★ TRN-02: the feed's poster jumps into the event's hero, and back shrinks it home", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await record(page);
  await page.goto("/ar/app");
  // A click before hydration is a plain navigation, with no move by design; the member's is after.
  await page.waitForLoadState("networkidle");
  const poster = page.locator(`#main a[data-nav-kind="jump"][href$="/app/sessions/${sessionId}"]`).first();
  await expect(poster).toBeVisible();
  await expect(poster.locator("img")).toBeVisible();
  // The member taps a poster they can SEE: decoded, not merely laid out — an undecoded one hands nothing to fly.
  await expect.poll(() => poster.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await poster.click();
  await page.waitForURL(new RegExp(`/app/sessions/${sessionId}$`));
  await expect(page.locator("#main h1").first()).toBeVisible();
  // The page sank under the jump, and the poster flew from the card into its slot, arriving with the overshoot.
  await expect.poll(async () => (await played(page)).some((p) => p.nav === "jump" && p.animated.length > 0 && p.longest > 0)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flights: { arriving: boolean; nav: string | null }[] }).__flights.filter((f) => f.arriving && f.nav === "jump").length)).toBeGreaterThan(0);
  // A navigation with no kind never moves: whatever transition the load and the stream made, none ran a duration.

  expect((await played(page)).filter((p) => p.nav === null && p.longest > 0)).toEqual([]);
  await capture(page, "jump-landed");

  await page.goBack();
  await page.waitForURL(/\/ar\/app$/);
  // Next restores the page without a view transition, so the page RISES from the sunk state — the mirror of the sink.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flights: { nav: string | null }[] }).__flights.some((f) => f.nav === "rise:back"))).toBe(true);
  // …and the card's poster flew home from the hero, settling without an overshoot.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __flights: { arriving: boolean }[] }).__flights.filter((f) => !f.arriving).length)).toBeGreaterThan(0);
  // The kind is cleared once the move has played: nothing later inherits it.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.nav ?? null), { timeout: 5_000 }).toBeNull();
});

test("TRN-04 / TRN-05: a child screen pushes; a tab switches from its side", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await record(page);
  await page.goto("/ar/app/me");
  await page.waitForLoadState("networkidle");
  await page.locator('#main a[href$="/app/me/settings"]').first().click();
  await page.waitForURL(/\/app\/me\/settings$/);
  await expect.poll(async () => (await played(page)).some((p) => p.nav === "push" && p.longest > 0)).toBe(true);

  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  const tab = page.locator('nav[data-tab-bar] a[href$="/app/sessions"]');
  await expect(tab).toHaveAttribute("data-nav-kind", /^switch-(start|end)$/);
  await tab.click();
  await page.waitForURL(/\/app\/sessions$/);
  await expect.poll(async () => (await played(page)).some((p) => (p.nav ?? "").startsWith("switch") && p.longest > 0)).toBe(true);
});

test("★ TRN-08: under reduced motion every move is a cut — nothing animates, the end state is reached", async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await record(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  await page.locator(`#main a[data-nav-kind="jump"][href$="/app/sessions/${sessionId}"]`).first().click();
  await page.waitForURL(new RegExp(`/app/sessions/${sessionId}$`));
  await expect(page.locator("#main h1").first()).toBeVisible();
  // Give a transition every chance to report, then require that none animated anything.
  await page.waitForTimeout(600);
  for (const p of await played(page)) {
    const running = await page.evaluate(() => document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? "").startsWith("::view-transition")).length);
    expect(running, JSON.stringify(p)).toBe(0);
  }
  await capture(page, "reduced-landed");
});

test("★ TRN-09: the console cuts — no kind is ever set inside it", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  const adminId = await signIn(context, adminEmail);
  await db.query(`update public.members set org_role = 'admin' where id = $1`, [adminId]);
  await signIn(context, adminEmail); // the role is in the claims: sign in again
  await record(page);
  await page.goto("/ar/app/admin");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-still", "");
  const link = page.locator('#main a[href*="/app/admin/"]').filter({ visible: true }).first();
  await link.click();
  await page.waitForLoadState("networkidle");
  for (const p of await played(page)) {
    expect(p.nav, "a kind inside the console").toBeNull();
    expect(p.animated.filter((a) => a.includes(".route") || a.includes("poster")), "a move inside the console").toEqual([]);
  }
});

test("★ TRN-03: a story zooms out of its ring, and every close shrinks it back into it", async ({ context, page }) => {
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await record(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  const ring = page.locator('button[data-state][aria-haspopup="dialog"]').filter({ visible: true }).first();
  await expect(ring).toBeVisible();
  const zooms = () => page.evaluate(() => (window as unknown as { __flights: { arriving: boolean; nav: string | null }[] }).__flights.filter((f) => f.nav === "story"));

  await ring.click();
  await expect(page.locator("[data-story-viewer]")).toBeVisible();
  await expect.poll(async () => (await zooms()).filter((z) => z.arriving).length).toBe(1);
  await capture(page, "story-open");

  // «إغلاق» — the close control — shrinks it home before the dialog closes.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-story-viewer]")).toHaveCount(0);
  await expect.poll(async () => (await zooms()).filter((z) => !z.arriving).length).toBe(1);
  await expect(ring).toBeFocused();
});

test("★★ TRN-10: on a 4× throttled CPU no frame of the jump, the push or the story is over one 60 Hz frame", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "measured once, on the phone");
  await page.setViewportSize(PHONE);
  await signIn(context, memberEmail);
  await page.addInitScript(() => {
    // Samples every frame while a move runs: a view transition from `ready` to `finished`, or the story's zoom.
    const w = window as unknown as { __moveFrames: Record<string, number[]> };
    w.__moveFrames = {};
    const sample = (label: string, done: Promise<unknown>) => {
      const frames: number[] = (w.__moveFrames[label] ??= []);
      let last = 0;
      let on = true;
      void done.finally(() => (on = false));
      const tick = (t: number) => {
        if (!on) return;
        if (last) frames.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((arg: unknown) => {
        const t = start(arg as never);
        const label = document.documentElement.dataset.nav ?? "none";
        const started = performance.now();
        void t.ready
          .then(() => sample(label, t.finished))
          .catch((e: Error) => ((w as unknown as { __skipped: string[] }).__skipped ??= []).push(`${label}:${e.name}:${e.message.slice(0, 80)}:${Math.round(performance.now() - started)}ms`));
        return t;
      }) as typeof document.startViewTransition;
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const a = animate.call(this, keyframes, options);
      const first = Array.isArray(keyframes) ? (keyframes[0] as Record<string, unknown>) : null;
      if (first?.borderRadius === "50%") sample("story", a.finished);
      return a;
    };
  });
  const cdp = await context.newCDPSession(page);
  await page.goto("/ar/app");
  await page.waitForLoadState("networkidle");
  const take = () => page.evaluate(() => (window as unknown as { __moveFrames: Record<string, number[]> }).__moveFrames);
  const frames: Record<string, number[]> = {};
  const keep = (got: Record<string, number[]>) => {
    for (const [k, v] of Object.entries(got)) frames[k] = [...(frames[k] ?? []), ...v];
  };
  // A move's samples arrive when its transition is READY — later than a fixed wait under a 4× throttle — and stop
  // when it finishes. Wait for them to arrive, then for the count to hold still, then collect.
  const settled = async (move: string) => {
    await expect
      .poll(async () => ((await take())[move] ?? []).length, { timeout: 20_000 })
      .toBeGreaterThan(5)
      .catch(async (e: unknown) => {
        console.log("SKIPPED", move, await page.evaluate(() => JSON.stringify((window as unknown as { __skipped?: string[] }).__skipped ?? [])));
        throw e;
      });
    let last = -1;
    await expect
      .poll(async () => {
        const n = ((await take())[move] ?? []).length;
        const still = n === last;
        last = n;
        return still;
      }, { timeout: 20_000, intervals: [400] })
      .toBe(true);
    keep(await take());
  };
  // As TRN-02: the member taps a poster they can see — decoded — before the CPU is throttled.
  const card = page.locator(`#main a[data-nav-kind="jump"][href$="/app/sessions/${sessionId}"]`).first();
  await expect.poll(() => card.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await card.click();
  await page.waitForURL(new RegExp(`/app/sessions/${sessionId}$`));
  await settled("jump");

  await page.goto("/ar/app/me");

  await page.waitForLoadState("networkidle");
  await page.locator('#main a[href$="/app/me/settings"]').first().click();
  await page.waitForURL(/\/app\/me\/settings$/);
  await settled("push");

  await page.goto("/ar/app");

  await page.waitForLoadState("networkidle");
  await page.locator('button[data-state][aria-haspopup="dialog"]').filter({ visible: true }).first().click();
  await settled("story");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const FRAME_MS = 1000 / 60;
  const JITTER_MS = 1;
  for (const move of ["jump", "push", "story"]) {
    const list = frames[move] ?? [];
    const longest = list.length ? Math.max(...list) : 0;
    testInfo.annotations.push({ type: "frames", description: `${move}: ${list.length} frames, the longest ${longest.toFixed(1)} ms` });
    console.log(`FRAMES ${move}: ${list.length} frames, longest ${longest.toFixed(1)} ms, all ${list.map((f) => f.toFixed(1)).join(" ")}`);
  }
  for (const move of ["jump", "push", "story"]) {
    const list = frames[move] ?? [];
    expect(list.length, `${move} was sampled`).toBeGreaterThan(5);
    expect(Math.max(...list), `${move}: no frame over one 60 Hz frame (+${JITTER_MS} ms)`).toBeLessThanOrEqual(FRAME_MS + JITTER_MS);
  }
});
