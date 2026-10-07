// The generated half, seen (REQ-STO-001, 002, 004, 006, 008, 018; DEC-251 §4). `sessions'` review captures: the ring
// row on 010 in each state — live, unseen, seen, and none — and every generated frame kind as the viewer shows it,
// with the recap's rating withheld below the org's minimum and shown at it, and a cancelled session's story gone.
//
// The frames are the GENERATOR's wherever a write fires a hook — a state moved, a photograph recorded, a material
// added; the three clock frames are inserted at the instants `clock_story_frames()` would write them, because the
// clock is the worker's and this spec runs without one. Captures at 390 and 1280 beside `m13/png/Story*.png`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(process.cwd(), ".qa-shots", "rtl");

test.skip(process.env.E2E_PLATFORM_UNCONFIGURED === "1", "platform unconfigured: covered by unconfigured.spec.ts");
test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";
const T = {
  live: "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية",
  done: "الأرقام التي تكذب: قراءة تقارير الأداء",
  soon: "لوحة تحكم لا يهجرها أحد بعد أسبوع",
  seen: "مقابلة العميل في عشرين دقيقة",
  cancelled: "جلسة أُلغيت",
  expired: "جلسة نُشرت قبل يومين",
};

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let email = "";
let memberId = "";
const users: string[] = [];
const ids: Record<keyof typeof T, string> = { live: "", done: "", soon: "", seen: "", cancelled: "", expired: "" };
let cookies: { name: string; value: string }[] = [];

async function person(domain: string, local: string, name: string, company: string | null): Promise<string> {
  const user = await admin.auth.admin.createUser({ email: `${local}@${domain}`, password: PASSWORD, email_confirm: true });
  if (user.error) throw user.error;
  users.push(user.data.user.id);
  return (
    await db.query<{ id: string }>(
      `insert into public.members (org_id, auth_user_id, email, display_name, company_id) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, user.data.user.id, `${local}@${domain}`, name, company],
    )
  ).rows[0].id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w26-frames-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القصص', $1, 'WF', gen_random_uuid()) returning id`, [`w26-frames-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1) on conflict (org_id) do nothing`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);

  email = `member@${domain}`;
  const member = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "يمان رضا" } });
  if (member.error) throw member.error;
  users.push(member.data.user.id);
  memberId = await provision();

  const category = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;
  const venue = (await db.query<{ id: string }>(`insert into public.venues (org_id, name, address) values ($1, 'قاعة الرياض', 'الدور الثالث') returning id`, [orgId])).rows[0].id;
  const mawahib = (await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'مواهب', '#ff6e4f') returning id`, [orgId])).rows[0].id;
  const jathr = (await db.query<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'جذر', '#8b5cf6') returning id`, [orgId])).rows[0].id;
  const presenter = await person(domain, "presenter", "سارة القحطاني", mawahib);
  const uploader = await person(domain, "uploader", "ريم الشهري", jathr);

  /** A session at `published`, starting `fromMin` minutes from now for an hour. */
  const session = async (title: string, fromMin: number, deadlineMin = fromMin) => {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, language, state, starts_at, duration_minutes, ends_at, capacity, venue_id,
                                      time_zone, published_at, rsvp_deadline_at, cancellation_cutoff_at, check_in_open)
         values ($1, $2, 'جلسة عملية.', $3, 'introductory', 'ar', 'published',
                 now() + ($5 || ' minutes')::interval, 60, now() + ($5 || ' minutes')::interval + interval '1 hour', 40, $4,
                 'Asia/Riyadh', now() - interval '3 hours', now() + ($6 || ' minutes')::interval, now() + ($6 || ' minutes')::interval, true)
         returning id`,
        [orgId, title, category, venue, String(fromMin), String(deadlineMin)],
      )
    ).rows[0].id;
    await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, id, presenter]);
    return id;
  };
  const frame = (session: string, kind: string, key: string, agoMin: number) =>
    db.query(`insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval)`, [
      orgId,
      session,
      kind,
      key,
      String(agoMin),
    ]);
  const checkIn = async (session: string, who: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $3, 'empty'::tstzrange) returning id`,
        [orgId, session, who],
      )
    ).rows[0].id;

  // LIVE — the clock's move, published → in_progress, writes the day's live frame (trigger 5).
  ids.live = await session(T.live, -12);
  await frame(ids.live, "published", "published", 180);
  await db.query(`update public.sessions set state = 'in_progress' where id = $1`, [ids.live]);
  await checkIn(ids.live, memberId);

  // COMPLETED — a photograph recorded (trigger 6), the completion (trigger 7), a material added after (trigger 8).
  ids.done = await session(T.done, -120);
  await db.query(`update public.sessions set state = 'in_progress' where id = $1`, [ids.done]);
  const attended = await checkIn(ids.done, memberId);
  await checkIn(ids.done, uploader);
  const [{ id: photoId }] = (await db.query<{ id: string }>(`select gen_random_uuid() as id`)).rows;
  const path = `${orgId}/sessions/${ids.done}/photos/${photoId}.png`;
  const up = await admin.storage.from("photos").upload(path, readFileSync(join(process.cwd(), "public", "constellation-1.png")), { contentType: "image/png", upsert: true });
  if (up.error) throw up.error;
  await db.query(
    `insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, created_at)
     values ($1, $2, $3, $4, $5, 1200, 800, 2048, $6, true, now() - interval '55 minutes')`,
    [photoId, orgId, ids.done, uploader, path, "c".repeat(64)],
  );
  await db.query(`update public.sessions set state = 'completed', completed_at = now() - interval '50 minutes' where id = $1`, [ids.done]);
  await db.query(
    `insert into public.materials (org_id, session_id, kind, title, external_url, added_by, phase)
     values ($1, $2, 'external_link', 'تسجيل الجلسة', 'https://example.com/recording', $3, 'after')`,
    [orgId, ids.done, presenter],
  );
  await db.query(
    `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 4)`,
    [orgId, ids.done, memberId, attended],
  );

  // UPCOMING — the clock's three, at the instants it writes them; a deadline before the start, so trigger 3 is real.
  ids.soon = await session(T.soon, 20 * 60, -30);
  await frame(ids.soon, "published", "published", 150);
  await frame(ids.soon, "registration_opened", "opened", 90);
  await frame(ids.soon, "registration_closed", "closed", 30);
  const [day] = (await db.query<{ id: string }>(`select id from public.session_days where session_id = $1`, [ids.soon])).rows;
  await db.query(
    `insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at) values ($1, $2, $3, 'starts_soon', $4, now() - interval '10 minutes')`,
    [orgId, ids.soon, day.id, `${day.id}:soon`],
  );

  // SEEN — every frame viewed by the member.
  ids.seen = await session(T.seen, 2 * 24 * 60);
  await frame(ids.seen, "published", "published", 200);
  await db.query(`insert into public.story_views (org_id, member_id, frame_id) select $1, $2, id from public.story_frames where session_id = $3`, [orgId, memberId, ids.seen]);

  // NONE — a cancelled story (REQ-STO-018), and a story whose only frame is past its 24 hours (REQ-STO-002).
  ids.cancelled = await session(T.cancelled, 3 * 24 * 60);
  await frame(ids.cancelled, "published", "published", 60);
  await db.query(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'تعذّر الحضور' where id = $1`, [ids.cancelled]);
  ids.expired = await session(T.expired, 4 * 24 * 60);
  await frame(ids.expired, "published", "published", 25 * 60);
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

async function home(page: Page, desktop: boolean) {
  await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
  await page.goto("/ar/app");
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `wave26-sessions-${name}.png`) });
}

const ring = (page: Page, title: string) => page.getByRole("list", { name: "جلسات اليوم وما حوله" }).getByRole("button", { name: new RegExp(title.slice(0, 12)) });

for (const width of [390, 1280] as const) {
  const desktop = width === 1280;
  const only = (project: string) => project !== (desktop ? "desktop" : "phone");

  test(`${width}: the ring row — live first, unseen, seen, and none for a cancelled or expired story`, async ({ context, page }, testInfo) => {
    test.skip(only(testInfo.project.name), "one width per project");
    await signIn(context);
    await home(page, desktop);
    const row = page.getByRole("list", { name: "جلسات اليوم وما حوله" });
    await expect(row).toBeVisible();
    // DEC-278: «قصتك» may lead the row; the order asserted is the STORY rings' — the ones with a state.
    const names = await row.locator("button[data-state]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    expect(names[0]).toContain(T.live.slice(0, 12)); // live first (REQ-STO-006)
    expect(names.some((n) => n.includes(T.seen.slice(0, 12)))).toBe(true);
    expect(names.some((n) => n.includes(T.cancelled))).toBe(false); // REQ-STO-018
    expect(names.some((n) => n.includes(T.expired))).toBe(false); // REQ-STO-002
    expect(await ring(page, T.seen).getAttribute("data-state")).toBe("seen");
    expect(await ring(page, T.live).getAttribute("data-state")).toBe("live");
    await shot(page, `ring-row-${width}`);
  });

  test(`${width}: every generated frame kind, as the viewer shows it`, async ({ context, page }, testInfo) => {
    test.skip(only(testInfo.project.name), "one width per project");
    await signIn(context);
    // DEC-278: previous, next and pause are not drawn — the frame is tapped (the end third, the left in RTL), and the
    // clock is held with Space, the keyboard's pause.
    const next = async (dialog: ReturnType<Page["getByRole"]>) => dialog.locator("[data-story-taps]").click({ position: { x: 40, y: 420 } });

    // The upcoming story: published · registration opened · registration closed · starts soon.
    await home(page, desktop);
    await ring(page, T.soon).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("جلسة جديدة");
    await page.keyboard.press("Space");
    await shot(page, `frame-published-${width}`);
    await next(dialog);
    await expect(dialog).toContainText("التسجيل مفتوح");
    await shot(page, `frame-registration-opened-${width}`);
    await next(dialog);
    await expect(dialog).toContainText("أُغلق التسجيل");
    await shot(page, `frame-registration-closed-${width}`);
    await next(dialog);
    await expect(dialog).toContainText("تبدأ قريبًا");
    await shot(page, `frame-starts-soon-${width}`);
    await dialog.getByRole("button", { name: "إغلاق" }).click();

    // The live story: its live frame counts the room.
    await home(page, desktop);
    await ring(page, T.live).click();
    dialog = page.getByRole("dialog");
    await page.keyboard.press("Space");
    await next(dialog);
    await expect(dialog).toContainText("جارية الآن");
    await expect(dialog).toContainText("واحد في القاعة");
    await expect(dialog.getByRole("link", { name: "افتح الجلسة" })).toHaveAttribute("href", new RegExp(`/app/sessions/${ids.live}$`));
    await shot(page, `frame-live-${width}`);
    await dialog.getByRole("button", { name: "إغلاق" }).click();

    // The completed story: the photograph · the recap, its rating withheld below the minimum · the materials.
    await home(page, desktop);
    await ring(page, T.done).click();
    dialog = page.getByRole("dialog");
    await page.keyboard.press("Space");
    await expect(dialog).toContainText("ريم الشهري");
    await shot(page, `frame-photo-${width}`);
    await next(dialog);
    await expect(dialog).toContainText("اكتملت");
    await expect(dialog).toContainText("بعد 3");
    await expect(dialog).toContainText("حضروا");
    await expect(dialog.getByRole("link", { name: "حمّل المواد" })).toHaveAttribute("href", new RegExp(`/app/sessions/${ids.done}#materials$`));
    await shot(page, `frame-recap-withheld-${width}`);
    await next(dialog);
    await expect(dialog).toContainText("مواد جديدة");
    await shot(page, `frame-materials-${width}`);
    await dialog.getByRole("button", { name: "إغلاق" }).click();

    // At the org's minimum the rating is shown (REQ-RAT-006).
    await db.query(`update public.org_settings set rating_min_aggregate = 1 where org_id = $1`, [orgId]);
    await home(page, desktop);
    await ring(page, T.done).click();
    dialog = page.getByRole("dialog");
    await page.keyboard.press("Space");
    await next(dialog);
    await expect(dialog).toContainText("اكتملت");
    await expect(dialog).toContainText("5");
    await expect(dialog).not.toContainText("بعد 1");
    await shot(page, `frame-recap-shown-${width}`);
    await db.query(`update public.org_settings set rating_min_aggregate = 3 where org_id = $1`, [orgId]);
  });
}
