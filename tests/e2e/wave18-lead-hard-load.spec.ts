// Wave 18 — the hard-load duplicate, re-measured on the rebuilt `/app` ONLY
// (STORY-UIX-047, DEC-201 §3, DEC-204, DEC-206 §1.2).
//
// On a hard load of a streamed page the content has been seen standing in `#main`
// while the server's streamed segment for the same boundary sits hidden beside it
// for ~300 ms: two `h1`s, two of every id. Wave 17 measured it at 24 % on its branch
// against 6 % on `main` over three routes. This wave rebuilds ONE of them, `/app`, so
// the rate is re-measured THERE, on this build and on `main`'s in the same sitting,
// and `/app/me/points` and `/app/leaderboards` stay owed by the wave that rebuilds them.
//
// ★ DEC-204 asked what the ACCESSIBILITY TREE holds in that window, not only the DOM.
// So each load polls both, through the page and through CDP's accessibility domain:
//   · dom:  the most `h1` elements the document held at once, and the most ids held twice;
//   · ax:   the most level-1 headings the accessibility tree exposed at once (not ignored).
// A load «duplicates» when dom > 1. Whether assistive technology would have met two is ax > 1.
//
// It asserts nothing about the rate — it is a measurement, and its numbers go in STATUS.
// Run it alone, on the phone project, `LOADS` hard loads (default 24), twice:
//   E2E_HARD_LOADS=24 npm run test:e2e:local -- tests/e2e/wave18-lead-hard-load.spec.ts --project=phone --repeat-each=2 --workers=1
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "correct-horse-battery-staple-9";
const LOADS = Number(process.env.E2E_HARD_LOADS ?? 24);
const ROUTE = process.env.E2E_HARD_LOAD_ROUTE ?? "/ar/app";
const OUT = process.env.E2E_HARD_LOAD_OUT ?? join(process.cwd(), ".qa-shots", "hard-load", "wave18.jsonl");

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.setTimeout(20 * 60_000);

let db: pg.Client;
let admin: ReturnType<typeof createClient>;
let orgId = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w18-load-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القياس', $1, 'HL', gen_random_uuid()) returning id`,
    [`w18-load-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // A seeded feed, not an empty one: a live session, two open ones, one that ended — so the home the probe
  // loads has posts, rings, a recap and the week (the empty feed is a different page).
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'قياس') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة القياس', 40) returning id`, [orgId]);
  for (const [title, offset, state] of [
    ["جلسة جارية", "-30 minutes", "in_progress"],
    ["جلسة الغد", "1 day", "published"],
    ["جلسة بعد يومين", "2 days", "published"],
    ["جلسة الأمس", "-1 day", "completed"],
  ] as const) {
    await db.query(
      `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
       values ($1, $2, 'نبذة', $3, 'introductory', now() + $4::interval, 90, now() + $4::interval + interval '90 minutes', $5, 40, $6::public.session_state, now() - interval '3 days')`,
      [orgId, title, cat[0].id, offset, venue[0].id, state],
    );
  }
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext) {
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

test("the hard-load duplicate on the rebuilt /app — DOM and accessibility tree", async ({ context, page }, testInfo) => {
  await signIn(context);
  // In the page: the most h1s and the most duplicated ids seen at once, from the first byte.
  await page.addInitScript(() => {
    const w = window as unknown as { __dup: { h1: number; ids: number } };
    w.__dup = { h1: 0, ids: 0 };
    const look = () => {
      const h1 = document.querySelectorAll("h1").length;
      const seen = new Set<string>();
      let twice = 0;
      for (const el of document.querySelectorAll("[id]")) {
        if (seen.has(el.id)) twice++;
        else seen.add(el.id);
      }
      w.__dup.h1 = Math.max(w.__dup.h1, h1);
      w.__dup.ids = Math.max(w.__dup.ids, twice);
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", look);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Accessibility.enable");

  const results: { dom: number; ids: number; ax: number }[] = [];
  for (let i = 0; i < LOADS; i++) {
    let ax = 0;
    let polling = true;
    const poll = (async () => {
      while (polling) {
        try {
          const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: { ignored?: boolean; role?: { value?: string }; properties?: { name: string; value: { value?: unknown } }[] }[] };
          const h1 = nodes.filter((n) => !n.ignored && n.role?.value === "heading" && n.properties?.some((p) => p.name === "level" && p.value.value === 1)).length;
          ax = Math.max(ax, h1);
        } catch {
          // the document is being replaced mid-load; the next poll reads the new one
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    })();
    await page.goto(ROUTE, { waitUntil: "load" });
    await expect(page.locator("#main h1").first()).toBeAttached();
    await page.waitForTimeout(700); // the window DEC-201 measured is ~300 ms after load
    polling = false;
    await poll;
    const dom = await page.evaluate(() => (window as unknown as { __dup: { h1: number; ids: number } }).__dup);
    results.push({ dom: dom.h1, ids: dom.ids, ax });
  }

  const duplicated = results.filter((r) => r.dom > 1).length;
  const announced = results.filter((r) => r.ax > 1).length;
  const line = { at: new Date().toISOString(), route: ROUTE, project: testInfo.project.name, base: process.env.E2E_HARD_LOAD_BASE ?? "branch", loads: LOADS, duplicated, announced, maxIds: Math.max(...results.map((r) => r.ids)), results };
  mkdirSync(join(OUT, ".."), { recursive: true });
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  console.log(`hard-load ${ROUTE} [${line.base}/${testInfo.project.name}]: ${duplicated}/${LOADS} duplicated in the DOM, ${announced}/${LOADS} with two level-1 headings in the accessibility tree`);
});
