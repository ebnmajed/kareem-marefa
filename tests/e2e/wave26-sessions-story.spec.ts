// SCR-012's «شاهد القصة» on a live session (REQ-STO-008, REQ-STO-004, REQ-STO-018; DEC-251 §4.7; contract 5's
// single-pointer rule, DEC-093). Run after the promotion migration that carries `sessions'` generator.
//
//   · the live frame is the GENERATOR's: the session is moved `published → in_progress` here, which is what the clock
//     does, and the state trigger writes the frame — the spec inserts no live frame of its own;
//   · one entry per width: the phone's in the top row, the desktop's beside the live badge — and at each width
//     exactly ONE is in the accessibility tree (the other is `display: none`, not merely hidden from sight);
//   · the story walked with `page.click()` alone — open, next, close — and focus back on the entry;
//   · a live session with no frame keeps «شاهد القصة» as text that opens nothing.
//
// Captures: `wave26-sessions-story-<entry|open>-<390|1280>.png`.
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

test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "platform unconfigured: covered by unconfigured.spec.ts");
test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";
const WATCH = "شاهد القصة";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
const users: string[] = [];
const ids = { story: "", bare: "" };
const T = {
  story: "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية",
  bare: "جلسة جارية بلا قصة",
};
let cookies: { name: string; value: string }[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w26-story-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القصة', $1, 'WS', gen_random_uuid()) returning id`, [`w26-story-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  email = `member@${domain}`;
  const member = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (member.error) throw member.error;
  users.push(member.data.user.id);
  const memberId = await provision();

  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الرياض', 'الدور الثالث') returning id`, [orgId])).rows[0].id;
  const session = async (title: string, state: "published" | "in_progress") =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id,
                                      time_zone, published_at, rsvp_deadline_at, cancellation_cutoff_at, check_in_open)
         values ($1, $2, 'جلسة عملية عن العروض القصيرة.', $3, 'introductory', 'ar', $5::public.session_state,
                 now() - interval '12 minutes', 60, now() + interval '48 minutes', 40, $4, 'Asia/Riyadh', now() - interval '2 days',
                 now() - interval '12 minutes', now() - interval '12 minutes', true)
         returning id`,
        [orgId, title, category, venue, state],
      )
    ).rows[0].id;

  // ★ The story's live frame is the generator's: published, then moved as the clock moves it.
  ids.story = await session(T.story, "published");
  await db.query(`update public.sessions set state = 'in_progress' where id = $1`, [ids.story]);
  // ★ Inserted already running: no transition, so no frame — the entry stays text (DEC-251 §4.7).
  ids.bare = await session(T.bare, "in_progress");

  // The member is checked in to the story's session: the live frame counts «واحد في القاعة».
  await db.query(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [orgId, ids.story, memberId]);
  await db.query(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'حضر الجلسة', $3, 'empty'::tstzrange)`,
    [orgId, ids.story, memberId],
  );
  // A second, earlier frame, so the walk has somewhere to go: the publication's, as the generator keys it.
  await db.query(
    `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at)
     values ($1, $2, 'published', 'published', now() - interval '2 hours') on conflict do nothing`,
    [orgId, ids.story],
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

async function capture(page: Page, name: string) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave26-sessions-story-${name}.png`) });
}

for (const width of [390, 1280] as const) {
  const desktop = width === 1280;

  test(`${width}: one entry in the accessibility tree; the story walked with clicks alone, and focus returns`, async ({ context, page }, testInfo) => {
    test.skip(testInfo.project.name !== (desktop ? "desktop" : "phone"), "one width per project");
    await signIn(context);
    await open(page, ids.story, desktop);
    const main = page.locator("#main");

    // ★ Exactly one: the other width's entry is display:none, so neither a role query nor Tab can reach it.
    const entry = main.getByRole("button", { name: WATCH });
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveAttribute("aria-haspopup", "dialog");
    await expect(main.getByRole("link", { name: /القصة/ })).toHaveCount(0);
    await capture(page, `entry-${width}`);

    await entry.click();
    const dialog = page.getByRole("dialog", { name: new RegExp(`قصة الجلسة: .*${T.story.slice(0, 10)}`) });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("جلسة جديدة"); // the first unseen frame: the publication

    await dialog.getByRole("button", { name: "الإطار التالي" }).click();
    await expect(dialog).toContainText("جارية الآن");
    await expect(dialog).toContainText("واحد في القاعة"); // a count, never who (A33)
    await capture(page, `open-${width}`);

    await dialog.getByRole("button", { name: "إغلاق" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(entry).toBeFocused();
  });
}

test("a live session with no frame: «شاهد القصة» is text and opens nothing", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone's top row");
  await signIn(context);
  await open(page, ids.bare, false);
  const main = page.locator("#main");
  await expect(main.getByText(WATCH)).toBeVisible();
  await expect(main.getByRole("button", { name: WATCH })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /القصة/ })).toHaveCount(0);
});
