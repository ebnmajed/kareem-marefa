// STORY-PRO-001 end to end — SCR-017 against REAL local Supabase.
// Run with `npm run test:e2e:local`; skipped without it, exactly as
// tests/e2e/session.spec.ts is (CI has no Supabase; the RLS suite covers the
// database there).
//
// What this proves that a unit test cannot: the Server Action round trip
// keeps the member's text, the row lands with the session's own org and
// proposer, and — the ★ — there is no date, time or venue control anywhere on
// the rendered page.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const PASSWORD = "correct-horse-battery-staple-9";

// One org per worker, as session.spec.ts explains: the two device projects run
// in parallel workers and would tear down each other's fixture.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let domain = "";
let userId = "";
let email = "";
// A second member, so REQ-PRO-003 has somebody to name.
let mateId = "";
let mateEmail = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  domain = `e2e-pro-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EP', gen_random_uuid()) returning id`,
    [`e2e-pro-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  // The four categories create_org() seeds — the same four the pre-launch
  // registration form offered.
  await db.query(
    `insert into public.categories (org_id, name) values ($1,'فني'), ($1,'إداري'), ($1,'إبداعي'), ($1,'درس من تجربة')`,
    [orgId],
  );
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
  if (error) throw error;
  userId = data.user.id;

  mateEmail = `mate@${domain}`;
  const mate = await admin.auth.admin.createUser({ email: mateEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "زميلة الاختبار" } });
  if (mate.error) throw mate.error;
  mateId = mate.data.user.id;
  // A member row only exists once someone has signed in — provision_member()
  // is what the OAuth callback calls. Without this she is an auth user with no
  // membership, so she is not in the org and cannot be named a co-presenter.
  await provision(mateEmail);
});

/** Signs in headlessly, purely to give this account its member row. */
async function provision(who: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar, setAll: (list) => { for (const { name, value } of list) jar.push({ name, value }); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: who, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
}

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (mateId) await admin.auth.admin.deleteUser(mateId);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who: string = email) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: who, password: PASSWORD });
  if (error) throw error;
  const { data: envelope, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  expect(["provisioned", "member"]).toContain((envelope as { status: string }).status);
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function fillProposal(page: Page, title: string) {
  await page.getByLabel("عنوان الموضوع المقترح").fill(title);
  await page.getByLabel("نبذة عن موضوعك").fill("تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.");
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "درس من تجربة" });
}

test("★ the propose form offers no date, time or venue control (REQ-PRO-001)", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("اقترح موضوعًا");

  // Not hidden — absent. Every input on the page, by type and by name.
  const types = await page.locator("form input, form select, form textarea").evaluateAll((els) =>
    els.map((e) => ({ type: (e as HTMLInputElement).type ?? e.tagName.toLowerCase(), name: (e as HTMLInputElement).name })),
  );
  expect(types.length).toBeGreaterThan(0);
  for (const { type, name } of types) {
    expect(["date", "time", "datetime-local", "week", "month"], `an input of type ${type} exists`).not.toContain(type);
    expect(name).not.toMatch(/date|time|venue|location|capacity|deadline|starts|ends/i);
  }
  // And the page says why, rather than leaving a member hunting for the box.
  await expect(page.getByText(/لا تحتاج لاختيار موعد أو مكان/)).toBeVisible();
});

test("a member submits a proposal and it lands with their org and their id", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const title = "كيف اختصرنا وقت إعداد التقارير إلى النصف";
  await fillProposal(page, title);
  await page.getByLabel("الفئة المستهدفة").fill("من يعدّون التقارير الشهرية");
  await page.getByLabel("المدة المتوقعة").fill("45");
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  await expect(page).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("status")).toContainText("وصلنا مقترحك");
  await expect(page.getByRole("status")).toContainText(title);

  const { rows } = await db.query<{ state: string; org_id: string; proposer_id: string; expected_duration_minutes: number }>(
    `select p.state, p.org_id, p.proposer_id, p.expected_duration_minutes
       from public.proposals p join public.members m on m.id = p.proposer_id
      where p.title = $1 and m.auth_user_id = $2`,
    [title, userId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].state).toBe("submitted");
  expect(rows[0].org_id).toBe(orgId);
  expect(rows[0].expected_duration_minutes).toBe(45);
});

test("saving a draft does not put it in front of an admin", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const title = "فكرة ما زالت تنضج";
  await fillProposal(page, title);
  await page.getByRole("button", { name: "احفظ كمسودة" }).click();

  await expect(page.getByRole("status")).toContainText("حُفظ مقترحك كمسودة");
  // Scoped to this worker's org: the two device projects run in parallel
  // against one database and both create a proposal with this title.
  const { rows } = await db.query<{ state: string }>(`select state from public.proposals where title = $1 and org_id = $2`, [title, orgId]);
  expect(rows[0].state).toBe("draft");
});

test("a rejected submission keeps every word the member typed", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const abstract = "نبذة طويلة كتبتها بعناية ولا أريد أن أفقدها لأن العنوان كان قصيرًا.";
  await page.getByLabel("عنوان الموضوع المقترح").fill("ق"); // below the 3-character floor
  await page.getByLabel("نبذة عن موضوعك").fill(abstract);
  await page.getByLabel("تصنيف الموضوع").selectOption({ label: "فني" });
  await page.getByRole("button", { name: "أرسل المقترح" }).click();

  // Scoped to the form: Next's own route announcer is also role="alert", and
  // an unscoped getByRole("alert") is a strict-mode violation, not a bug in
  // the page.
  const summary = page.locator("form [role=alert]");
  // Wave 7: the summary counts what failed (`0916b9d`).
  await expect(summary).toContainText("لم نستطع إرسال المقترح — حقل واحد يحتاج تصحيحًا");
  await expect(summary).toContainText("العنوان قصير جدًا");
  // ★ The abstract survives the round trip — the form's own promise.
  await expect(page.getByLabel("نبذة عن موضوعك")).toHaveValue(abstract);
  await expect(page.getByLabel("عنوان الموضوع المقترح")).toHaveValue("ق");
  expect((await db.query(`select 1 from public.proposals where abstract = $1 and org_id = $2`, [abstract, orgId])).rowCount).toBe(0);
});

test("SCR-017 at 390 px RTL: no horizontal scroll, and the primary action is ≥ 44 px", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/app/propose");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // Layout-viewport measurement (TEAM.md §5): first, does the page scroll at all

  // (`scrollWidth - clientWidth` is the scrollbar's width on every RTL page that

  // scrolls vertically); then which element is responsible, skipping permitted

  // scroll containers and fixed overlays. Names what to fix.

  // Phone project only: a desktop context at 390 px carries a classic scrollbar

  // that inflates scrollWidth on every page that scrolls vertically.

  const overflow = test.info().project.name !== "phone" ? [] : await page.evaluate(() => {

    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [];

    const limit = window.innerWidth;

    const offenders: string[] = [];

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {

      if (el.tagName === "NEXT-ROUTE-ANNOUNCER") continue;

      const box = el.getBoundingClientRect();

      if (box.width === 0) continue;

      if (box.right <= limit + 1 && box.left >= -1) continue;

      let contained = false;

      for (let n: HTMLElement | null = el; n; n = n.parentElement) {

        const cs = getComputedStyle(n);

        if (cs.position === "fixed" || ((n !== el) && (cs.overflowX === "auto" || cs.overflowX === "scroll"))) { contained = true; break; }

      }

      if (contained) continue;

      offenders.push(`${el.tagName.toLowerCase()}.${el.className || "(no class)"} — ${Math.round(box.width)}px at ${Math.round(box.left)}`);

    }

    return offenders.slice(0, 6);

  });

  expect(overflow, "the page must not scroll sideways at 390 px").toEqual([]);

  const submit = page.getByRole("button", { name: "أرسل المقترح" });
  const box = await submit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // ★ The two mixed-direction rows, measured rather than eyeballed. In RTL the
  // first flex child is the RIGHTMOST one, so a numeral must sit to the right
  // of its unit («45 دقيقة» reads number-first) and a checkbox to the right of
  // its label. Getting either backwards looks subtly wrong in a way a
  // screenshot review misses and a coordinate comparison does not.
  const duration = (await page.getByLabel("المدة المتوقعة").boundingBox())!;
  const unit = (await page.getByText("دقيقة", { exact: true }).boundingBox())!;
  expect(duration.x, "the number box sits to the right of «دقيقة» in RTL").toBeGreaterThan(unit.x);

  const tick = page.getByRole("checkbox", { name: /زميلة الاختبار/ });
  const tickBox = (await tick.boundingBox())!;
  const tickRow = (await tick.locator("xpath=..").boundingBox())!;
  expect(tickBox.x + tickBox.width, "the checkbox sits at the inline-start, which is the right in RTL").toBeGreaterThan(tickRow.x + tickRow.width / 2);

  // The reviewed screenshot of the definition of done.
  await page.screenshot({ path: ".qa-shots/rtl/scr-017-propose-390-rtl.png", fullPage: true });
});

test("naming a co-presenter invites them, and they answer for themselves (REQ-PRO-003)", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");
  const title = "جلسة بمقدّمَين";
  await fillProposal(page, title);
  await page.getByRole("checkbox", { name: /زميلة الاختبار/ }).check();
  await page.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(page).toHaveURL(/\/ar\/app\/propose\/[0-9a-f-]{36}\?created=1$/);

  // The proposer is accepted; the named colleague has not answered.
  await expect(page.getByText("صاحب المقترح")).toBeVisible();
  await expect(page.getByText("بانتظار الرد")).toBeVisible();
  // The proposer is not offered an accept button — proposing was accepting.
  await expect(page.getByRole("button", { name: "أوافق على التقديم" })).toHaveCount(0);
  const url = page.url();

  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from public.proposal_presenters pp
       join public.proposals p on p.id = pp.proposal_id where p.title = $1 and p.org_id = $2`,
    [title, orgId],
  );
  expect(Number(rows[0].n)).toBe(2);

  // The colleague, in her own session, answers her own row.
  const mateContext = await page.context().browser()!.newContext();
  await signIn(mateContext, mateEmail);
  const matePage = await mateContext.newPage();
  await matePage.goto(url.replace(/\?created=1$/, ""));
  await expect(matePage.getByText("دُعيت للتقديم في هذا الموضوع")).toBeVisible();
  await matePage.getByRole("button", { name: "أوافق على التقديم" }).click();
  // Scoped to her own row: «وافق» is a substring of «أوافق على التقديم» and of
  // the invitation copy, so an unscoped text match is ambiguous, not a finding.
  await expect(matePage.getByRole("listitem").filter({ hasText: "زميلة الاختبار" })).toContainText("وافق");
  await expect(matePage.getByText("دُعيت للتقديم في هذا الموضوع")).toHaveCount(0);
  await mateContext.close();

  const after = await db.query<{ accepted: boolean }>(
    `select pp.accepted from public.proposal_presenters pp
       join public.proposals p on p.id = pp.proposal_id
       join public.members m on m.id = pp.member_id
      where p.title = $1 and m.auth_user_id = $2`,
    [title, mateId],
  );
  expect(after.rows[0].accepted).toBe(true);
});
