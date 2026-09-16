// The form model, end to end on SCR-017 — `16` §8.2, REQ-UIX-009, REQ-UIX-010,
// REQ-UIX-011, REQ-UIX-017, DEC-091.
//
// `sessions-propose.spec.ts` proves the round trip and the data. This proves
// the things only a real browser can answer, and they are exactly the ones the
// design turns on:
//
//   · a summary link JUMPS TO AND FOCUSES the control it names;
//   · ★★ and the control it lands on is NOT BEHIND A STICKY LAYER — the
//     accessibility feature defeating itself (SC 2.4.11). jsdom has no layout
//     engine and cannot answer that at all;
//   · the error is red with a glyph and a border, not `text-fg-heading`;
//   · required is «مطلوب» and never an asterisk.
//
// Run with `npm run test:e2e:local`; skipped without it, exactly as
// `tests/e2e/sessions-propose.spec.ts` is.
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

// One org per worker: the two device projects run in parallel workers and
// would otherwise tear down each other's fixture.
test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let userId = "";
let email = "";

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `e2e-form-${tag}.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة الاختبار', $1, 'EF', gen_random_uuid()) returning id`,
    [`e2e-form-${tag}`],
  );
  orgId = rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  await db.query(
    `insert into public.categories (org_id, name) values ($1,'فني'), ($1,'إداري'), ($1,'إبداعي'), ($1,'درس من تجربة')`,
    [orgId],
  );
  email = `member@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "عضو الاختبار" } });
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
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

// ★ SCOPED TO THE PROPOSAL FORM, and it has to be. Since M9 the shell carries
// two forms of its own — the catalogue search and sign-out — so a bare
// `locator("form")` is a strict-mode violation rather than a bug in the page.
// `novalidate` is the proposal form's own marker: the model needs the round
// trip, so the browser's validation stays off (`16` §8.2 items 3-5).
const proposalForm = (page: Page) => page.locator("form[novalidate]");

/** Submit with nothing filled in, which is the state ask 5 is about. */
async function failTheForm(page: Page) {
  await page.goto("/ar/app/propose");
  await page.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(proposalForm(page).locator("[role=alert]")).toBeVisible();
}

test("★ required is «مطلوب» on the label, and there is no asterisk anywhere on the form", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");

  // REQ-UIX-011: an asterisk collides with the RTL run, so required is marked
  // positively — and the four the schema refuses to do without are the four.
  const markers = proposalForm(page).locator("label", { hasText: "مطلوب" });
  await expect(markers).toHaveCount(4);
  for (const label of ["عنوان الموضوع المقترح", "نبذة عن موضوعك", "تصنيف الموضوع", "مستوى الجلسة"]) {
    await expect(proposalForm(page).locator("label", { hasText: label })).toContainText("مطلوب");
  }

  // Not «the asterisk is styled away» — absent.
  const text = (await proposalForm(page).innerText()).replace(/\s+/g, "");
  expect(text).not.toMatch(/[*٭]/);

  // And it is programmatic as well as visible.
  await expect(page.getByLabel("عنوان الموضوع المقترح")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("الفئة المستهدفة")).not.toHaveAttribute("aria-required", "true");
});

test("★ the summary lists one LINK per failed field, in the order the page renders them", async ({ context, page }) => {
  await signIn(context);
  await failTheForm(page);

  const summary = proposalForm(page).locator("[role=alert]");
  await expect(summary).toContainText("لم نستطع إرسال المقترح — 3 حقول تحتاج تصحيحًا");
  await expect(summary).toContainText("ما كتبته محفوظ كما هو");

  // The M2 defect in one assertion: these used to be sentences.
  const links = summary.getByRole("link");
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toContainText("عنوان الموضوع المقترح");
  await expect(links.nth(1)).toContainText("نبذة عن موضوعك");
  await expect(links.nth(2)).toContainText("تصنيف الموضوع");

  // It takes focus itself, so a screen-reader user is told what happened
  // rather than left at the foot of a long form.
  await expect(summary).toBeFocused();
});

test("★ a summary link focuses the control it names — «تصنيف الموضوع: اختر تصنيفًا»", async ({ context, page }) => {
  await signIn(context);
  await failTheForm(page);

  await proposalForm(page).locator("[role=alert]").getByRole("link", { name: /تصنيف الموضوع/ }).click();
  const select = page.getByLabel("تصنيف الموضوع");
  await expect(select).toBeFocused();
  expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
});

test("★★ SC 2.4.11 — the control a summary link lands on is not behind a sticky layer, at 390 px", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await failTheForm(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // REQ-UIX-017's tokens are what make `focus()`'s scroll clear the header.
  // They live in globals.css, which this track does not own — so this asserts
  // rather than assumes, and fails loudly if they regress.
  const scrollPadding = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart || "0"),
  );
  expect(scrollPadding, "html scroll-padding-block-start (REQ-UIX-017)").toBeGreaterThan(0);

  // Then the thing the tokens exist to prevent: for EVERY link in the summary,
  // follow it and check that nothing fixed or sticky covers where focus landed.
  const links = proposalForm(page).locator("[role=alert] a");
  for (let i = 0; i < (await links.count()); i += 1) {
    await links.nth(i).click();
    const covered = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused || focused === document.body) return "nothing is focused";
      const target = focused.getBoundingClientRect();
      if (target.height === 0) return "the focused control has no box";
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (el === focused || el.contains(focused)) continue;
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
        const layer = el.getBoundingClientRect();
        if (layer.width === 0 || layer.height === 0) continue;
        const overlaps =
          layer.left < target.right && layer.right > target.left && layer.top < target.bottom && layer.bottom > target.top;
        if (overlaps) return `${el.tagName.toLowerCase()}.${el.className.split(" ")[0]} (${style.position}) covers ${focused.id || focused.tagName}`;
      }
      return null;
    });
    expect(covered, `summary link ${i + 1} sent focus behind a sticky layer`).toBeNull();
  }

  // The definition-of-done capture, on demand: `SCR017_SHOT=/path/to.png`.
  // ★ LAST, and never earlier: `fullPage` scrolls the document to stitch the
  // image, which moves every fixed layer and would make the check above
  // measure a page nobody is looking at.
  if (process.env.SCR017_SHOT) await page.screenshot({ path: process.env.SCR017_SHOT, fullPage: true });
});

test("★ the error is red, glyphed and bordered — not the colour of a heading", async ({ context, page }) => {
  await signIn(context);
  await failTheForm(page);

  const title = page.getByLabel("عنوان الموضوع المقترح");
  await expect(title).toHaveAttribute("aria-invalid", "true");

  // 1 — the control's border is `--color-error-border`, 1 px.
  const border = await title.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.borderBlockStartColor, width: s.borderBlockStartWidth };
  });
  expect(border.color).toBe("rgb(192, 85, 90)"); // #c0555a
  expect(parseFloat(border.width)).toBeCloseTo(1, 1);

  // 2 — the message is `--color-error`, and is NOT `--fg-heading` (#0b1220),
  // which is what it was until M9.
  const message = page.locator("#title-error");
  await expect(message).toBeVisible();
  const messageColor = await message.evaluate((el) => getComputedStyle(el).color);
  expect(messageColor).toBe("rgb(158, 59, 63)"); // #9e3b3f
  expect(messageColor).not.toBe("rgb(11, 18, 32)");

  // 3 — the glyph. Colour is never the only channel.
  await expect(message.locator("svg")).toBeVisible();

  // …and it describes the control, so it is read when focus lands there.
  await expect(title).toHaveAttribute("aria-describedby", /title-error/);
});

test("★ inline validation starts after the first submit and not before — reward early, punish late", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/ar/app/propose");

  const title = page.getByLabel("عنوان الموضوع المقترح");

  // Before any submit, leaving an empty required box says nothing at all: the
  // member has not finished with the form and is not wrong yet.
  await title.click();
  await page.getByLabel("نبذة عن موضوعك").click();
  await expect(page.locator("#title-error")).toHaveCount(0);

  // After a failed submit, the rule turns on.
  await page.getByRole("button", { name: "أرسل المقترح" }).click();
  await expect(page.locator("#title-error")).toBeVisible();

  // Reward early: the error goes as soon as it looks fixed, while typing.
  await title.fill("كيف اختصرنا وقت إعداد التقارير");
  await expect(page.locator("#title-error")).toHaveCount(0);

  // Punish late: emptying it again says nothing until the member leaves.
  await title.fill("");
  await expect(page.locator("#title-error")).toHaveCount(0);
  await title.blur();
  await expect(page.locator("#title-error")).toBeVisible();

  // ★ And the summary does not move while any of that happens: it is
  // `role="alert"`, and rewriting it on every keystroke would re-announce the
  // whole list. It is a record of one attempt, rebuilt by the next submit.
  await expect(proposalForm(page).locator("[role=alert]").getByRole("link")).toHaveCount(3);
});
