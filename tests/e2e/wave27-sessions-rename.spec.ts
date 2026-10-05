// A session renamed from the hub's header, until it is published — REQ-SES-021, DEC-254 §5, DEC-255 §1, STORY-SES-014.
//
// What this proves against the real pages, which the unit and RLS suites cannot:
//   · an admin on SCR-043 opens «عدّل الاسم», types, saves — `page.click()` and typing only — and the `h1` reads the new
//     name from the server, the console's sessions table (SCR-042) lists it, and the schedule tab's log says «تغيّر الاسم»;
//   · a name outside the proposal's bounds is refused at the field and the dialog keeps what was typed;
//   · a PUBLISHED session's header draws no «عدّل الاسم» at all — no disabled control, no explanation;
//   · a moderator's header draws none either.
//
// Captures at the project's own width (desktop 1280, phone 390 → `-1280` / `-390`):
//   wave27-sessions-hub-rename-open-<w>.png       the dialog open over the hub
//   wave27-sessions-hub-rename-saved-<w>.png      the header with the new name
//   wave27-sessions-hub-rename-published-<w>.png  a published session's header — no control
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery-staple-9";
const FIRST = "مسودة جلسة التخطيط";
const RENAMED = "التخطيط الربعي خطوة بخطوة";
const PUBLISHED = "جلسة منشورة لا يتغيّر اسمها";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let draftId = "";
let publishedId = "";
const emails = { boss: "", mod: "" };
const userIds: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `wave27-rename-${tag}.example`;
  emails.boss = `boss@${domain}`;
  emails.mod = `mod@${domain}`;

  const { rows: org } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الأسماء', $1, 'RN', gen_random_uuid(), $2) returning id`,
    [`wave27-rename-${tag}`, emails.boss],
  );
  orgId = org[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  const { rows: cat } = await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'التخطيط') returning id`, [orgId]);
  const { rows: venue } = await db.query<{ id: string }>(
    `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الكبرى', 'المبنى أ', 40) returning id`,
    [orgId],
  );
  for (const [key, name, role] of [
    ["boss", "مشرف المؤسسة", "admin"],
    ["mod", "منظِّمة الفعاليات", "moderator"],
  ] as const) {
    const user = await admin.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (user.error) throw user.error;
    userIds.push(user.data.user.id);
    await db.query(`insert into public.members (org_id, auth_user_id, email, display_name, org_role) values ($1, $2, $3, $4, $5)`, [orgId, user.data.user.id, emails[key], name, role]);
  }

  const session = async (title: string, state: "draft" | "published") =>
    (
      await db.query<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
         values ($1, $2, 'جلسة عملية.', $3, 'introductory', now() + interval '7 days', 60, now() + interval '7 days 1 hour',
                 $4, 30, now() + interval '7 days', now() + interval '6 days', $5::public.session_state,
                 case when $5 = 'published' then now() - interval '1 day' end)
         returning id`,
        [orgId, title, cat[0].id, venue[0].id, state],
      )
    ).rows[0].id;
  draftId = await session(FIRST, "draft");
  publishedId = await session(PUBLISHED, "published");
});

test.afterAll(async () => {
  if (!db) return;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
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

const main = (page: Page) => page.locator("#main");
const width = (page: Page) => (page.viewportSize()!.width >= 1000 ? 1280 : 390);

async function settle(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

async function shoot(page: Page, state: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: join(SHOTS, `wave27-sessions-hub-rename-${state}-${width(page)}.png`) });
}

test("an admin renames a draft from the hub's header, and the console reads the new name", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${draftId}/schedule`);
  await settle(page);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(FIRST);

  await main(page).getByRole("button", { name: "عدّل الاسم" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole("textbox", { name: "الاسم" });
  await expect(field).toHaveValue(FIRST);

  // Outside the proposal's bounds: refused at the field, the words kept.
  await field.fill("اب");
  await dialog.getByRole("button", { name: "احفظ" }).click();
  await expect(dialog.getByText("الاسم قصير جدًا.")).toBeVisible();
  await expect(field).toHaveValue("اب");

  await field.fill(RENAMED);
  await shoot(page, "open");
  await dialog.getByRole("button", { name: "احفظ" }).click();
  await expect(page.getByText("حُفظ الاسم.", { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(RENAMED);
  await shoot(page, "saved");

  // The database holds it; the log says so; the console's table lists it.
  const { rows } = await db.query<{ title: string }>(`select title from public.sessions where id = $1`, [draftId]);
  expect(rows[0].title).toBe(RENAMED);
  await page.reload();
  await settle(page);
  await expect(main(page).getByText("تغيّر الاسم")).toBeVisible();
  await page.goto(`/ar/app/admin/sessions`);
  await settle(page);
  await expect(main(page).getByText(RENAMED).first()).toBeVisible();
});

test("a published session's header draws no rename at all", async ({ context, page }) => {
  await signIn(context, emails.boss);
  await page.goto(`/ar/app/admin/sessions/${publishedId}/schedule`);
  await settle(page);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(PUBLISHED);
  await expect(main(page).getByRole("button", { name: "عدّل الاسم" })).toHaveCount(0);
  await shoot(page, "published");
});

test("a moderator's header draws none either", async ({ context, page }) => {
  await signIn(context, emails.mod);
  await page.goto(`/ar/app/admin/sessions/${draftId}/attendance`);
  await settle(page);
  await expect(main(page).getByRole("button", { name: "عدّل الاسم" })).toHaveCount(0);
});
