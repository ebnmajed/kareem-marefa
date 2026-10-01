// SCR-018 · /app/propose/[id] — rebuilt in wave 19 from `Proposal.dc.html` (REQ-UIX-067, STORY-UIX-056, DEC-213,
// DEC-214). The older specs stay as evidence (`wave7-sessions-proposal`, `sessions-propose`); this one holds what the
// rebuild adds:
//
//   · the regions in the artboard's order — back, «مقترحي» with «آخر تحديث», the line, the reason card with the one
//     primary, the summary, the presenters, the draft materials — and the bar mirroring the primary on the phone;
//   · ★ the line: five steps only while changes are requested, four otherwise (D3); a draft and a rejected proposal
//     show their badge instead; «مُجدوَل» from a published session naming the proposal, with its poster (D15);
//   · ★ nobody's name on the reason card (§5.99); no «السجل», no «اسحب المقترح» (§5.100, §5.101);
//   · ★ «+ أضف مُقدِّمًا مشاركًا» after submission — the colleague is invited unanswered (§5.102, `0168`);
//   · remove in a sheet, in the open states only (D9);
//   · the co-presenter's own view: the invitation, no notes, no controls.
//
// Captures: `wave19-sessions-proposal-<state>-390.png` — changes, submitted, scheduled, rejected, draft, invited.
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

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");

const expect = baseExpect.configure({ timeout: 15_000 });
const PASSWORD = "correct-horse-battery-staple-9";
const REASON = "الفكرة ممتازة. أضف مثالًا واحدًا من تقرير حقيقي في النبذة.";
const TITLE = "كيف اختصرنا وقت إعداد التقارير إلى النصف";

test.describe.configure({ mode: "serial" });

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let categoryId = "";
const users: { id: string; email: string; memberId: string; cookies: { name: string; value: string }[] }[] = [];
const ids: Record<"changes" | "submitted" | "scheduled" | "rejected" | "draft", string> = { changes: "", submitted: "", scheduled: "", rejected: "", draft: "" };
let sessionId = "";

async function person(domain: string, local: string, name: string) {
  const email = `${local}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name: n, value } of list) jar.push({ name: n, value });
      },
    },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: member, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  jar.length = 0;
  await client.auth.refreshSession();
  const user = { id: data.user.id, email, memberId: (member as { member_id: string }).member_id, cookies: [...jar] };
  users.push(user);
  return user;
}

async function proposal(proposer: string, state: string, reason: string | null): Promise<string> {
  const id = (
    await db.query<{ id: string }>(
      `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, expected_duration_minutes, admin_notes, state, decision_reason)
       values ($1, $2, $3, 'قبل سنة كان تقرير الأداء الشهري يأخذ أربعة أيام من شخصين.', $4, 'introductory', 60, 'ملاحظة للمشرف وحده', 'draft', null) returning id`,
      [orgId, proposer, TITLE, categoryId],
    )
  ).rows[0].id;
  await db.query(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, id, proposer]);
  // Walk the legal transitions (0011), so the row is exactly what a real review leaves.
  const path: Record<string, string[]> = {
    draft: [],
    submitted: ["submitted"],
    changes_requested: ["submitted", "in_review", "changes_requested"],
    approved: ["submitted", "in_review", "approved"],
    rejected: ["submitted", "in_review", "rejected"],
  };
  for (const next of path[state]) {
    await db.query(`update public.proposals set state = $2::public.proposal_state, decision_reason = $3 where id = $1`, [id, next, next === state ? reason : null]);
  }
  return id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const domain = `w19-proposal-${tag}.example`;
  orgId = (await db.query<{ id: string }>(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة المقترح', $1, 'WQ', gen_random_uuid()) returning id`, [`w19-proposal-${tag}`])).rows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  categoryId = (await db.query<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'إداري') returning id`, [orgId])).rows[0].id;

  const me = await person(domain, "member", "يمان رضا");
  const mate = await person(domain, "mate", "سارة القحطاني");
  await person(domain, "third", "خالد الغامدي");

  ids.changes = await proposal(me.memberId, "changes_requested", REASON);
  ids.submitted = await proposal(me.memberId, "submitted", null);
  ids.scheduled = await proposal(me.memberId, "approved", null);
  ids.rejected = await proposal(me.memberId, "rejected", "الموضوع أوسع من جلسة واحدة.");
  ids.draft = await proposal(me.memberId, "draft", null);
  // The colleague is named on the changes-requested proposal and has not answered.
  await db.query(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [orgId, ids.changes, mate.memberId]);

  // A published session naming the approved proposal — «مُجدوَل» is derived from it.
  sessionId = (
    await db.query<{ id: string }>(
      `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, state, starts_at, duration_minutes, ends_at, time_zone, published_at)
       values ($1, $2, $3, 'نبذة.', $4, 'introductory', 'published', now() + interval '3 days', 60, now() + interval '3 days 1 hour', 'Asia/Riyadh', now()) returning id`,
      [orgId, ids.scheduled, TITLE, categoryId],
    )
  ).rows[0].id;
  await db.query(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, me.memberId]);
});

test.afterAll(async () => {
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, who = 0) {
  await context.addCookies(users[who].cookies.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

async function open(p: Page, id: string) {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`/ar/app/propose/${id}`);
  await expect(p.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await p.evaluate(() => document.fonts.ready);
}

async function capture(p: Page, state: string) {
  await expect(p.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: join(SHOTS, `wave19-sessions-proposal-${state}-390.png`), fullPage: true });
}

const steps = (p: Page) => p.locator("#main").getByRole("list", { name: "مراحل المقترح" }).getByRole("listitem");

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "the artboard is a phone board");
});

test("changes requested: the regions in the artboard's order, five steps, the reason with no name", async ({ context, page }) => {
  await signIn(context);
  await open(page, ids.changes);
  const main = page.locator("#main");

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("مقترحي");
  await expect(main.getByText(/^آخر تحديث /)).toBeVisible();
  await expect(steps(page)).toHaveCount(5);
  await expect(main.locator("[aria-current=step]")).toContainText("طُلب تعديل");
  await expect(steps(page).first()).toContainText("مكتملة");

  const reason = main.locator("section[aria-labelledby=reason]");
  await expect(reason.getByRole("heading", { name: "ما كتبه المشرف" })).toBeVisible();
  await expect(reason).toContainText(REASON);
  await expect(reason.getByRole("link", { name: "عدّل وأعد الإرسال" })).toHaveAttribute("href", `/ar/app/propose/${ids.changes}/edit`);
  // ★ No reviewer is named (§5.99); no history, no withdraw (§5.100, §5.101).
  await expect(main.getByText("السجل", { exact: true })).toHaveCount(0);
  await expect(main.getByText("اسحب المقترح")).toHaveCount(0);

  const top = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!.y;
  const order = [
    await top(main.getByRole("heading", { level: 1 })),
    await top(main.getByRole("list", { name: "مراحل المقترح" })),
    await top(reason),
    await top(main.getByRole("heading", { level: 2, name: TITLE })),
    await top(main.getByRole("heading", { level: 2, name: "المُقدِّمون" })),
    await top(main.getByRole("heading", { level: 2, name: "مواد مبدئية" })),
  ];
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // The proposer's row and the colleague's reply, as nouns; the bar mirrors the primary.
  await expect(main.getByRole("listitem").filter({ hasText: "أنت" })).toContainText("المُقدِّم الرئيسي");
  await expect(main.getByRole("listitem").filter({ hasText: "سارة القحطاني" })).toContainText("بانتظار الرد");
  await expect(page.getByRole("group", { name: "إجراءات المقترح" }).getByRole("link", { name: "عدّل وأعد الإرسال" })).toBeVisible();
  await capture(page, "changes");
});

test("submitted: four steps, «أُرسل» current, nothing to edit, the notes the proposer wrote", async ({ context, page }) => {
  await signIn(context);
  await open(page, ids.submitted);
  await expect(steps(page)).toHaveCount(4);
  await expect(page.locator("#main [aria-current=step]")).toContainText("أُرسل");
  await expect(page.locator("#main").getByText("طُلب تعديل")).toHaveCount(0);
  await expect(page.locator("#main").getByText("سيصلك إشعار حين يقرّر المشرف.")).toBeVisible();
  await expect(page.locator("#main").getByText("ملاحظة للمشرف وحده")).toBeVisible();
  await expect(page.getByRole("group", { name: "إجراءات المقترح" })).toHaveCount(0);
  await capture(page, "submitted");
});

test("★ scheduled: derived from the published session — «مُجدوَل» current, the poster and «افتح الجلسة»", async ({ context, page }) => {
  await signIn(context);
  await open(page, ids.scheduled);
  await expect(page.locator("#main [aria-current=step]")).toContainText("مُجدوَل");
  await expect(page.locator("#main").getByRole("link", { name: "افتح الجلسة" }).first()).toHaveAttribute("href", `/ar/app/sessions/${sessionId}`);
  await capture(page, "scheduled");

  // A cancelled session leaves «معتمد» current and names the session (D15).
  await db.query(`update public.sessions set state = 'cancelled' where id = $1`, [sessionId]);
  try {
    await open(page, ids.scheduled);
    await expect(page.locator("#main [aria-current=step]")).toContainText("معتمد");
    await expect(page.locator("#main").getByText("الجلسة التي أُنشئت من هذا المقترح:")).toBeVisible();
  } finally {
    await db.query(`update public.sessions set state = 'published' where id = $1`, [sessionId]);
  }
});

test("rejected and draft: the badge, not the line", async ({ context, page }) => {
  await signIn(context);
  await open(page, ids.rejected);
  await expect(page.locator("#main").getByRole("list", { name: "مراحل المقترح" })).toHaveCount(0);
  await expect(page.locator("#main").getByText("غير مقبول", { exact: true })).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: "اقترح موضوعًا آخر" })).toBeVisible();
  await expect(page.locator("#main").getByRole("button", { name: /أزل/ })).toHaveCount(0);
  await capture(page, "rejected");

  await open(page, ids.draft);
  await expect(page.locator("#main").getByText("مسودة عندك", { exact: true })).toBeVisible();
  await expect(page.locator("#main section[aria-labelledby=presenters]").getByRole("button", { name: /أضف مُقدِّمًا مشاركًا/ })).toBeVisible();
  await capture(page, "draft");
});

test("★ a co-presenter added after submission is invited unanswered, and can be removed in a sheet", async ({ context, page }) => {
  await signIn(context);
  await open(page, ids.submitted);
  const presenters = page.locator("#main section[aria-labelledby=presenters]");
  await presenters.getByRole("button", { name: /أضف مُقدِّمًا مشاركًا/ }).click();
  const sheet = page.getByRole("dialog", { name: "أضف مُقدِّمًا مشاركًا" });
  await sheet.getByRole("combobox", { name: /مقدّمون مشاركون/ }).fill("خالد");
  await page.getByRole("option", { name: /خالد الغامدي/ }).click();
  await sheet.getByRole("button", { name: "أضف", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(presenters.getByRole("listitem").filter({ hasText: "خالد الغامدي" })).toContainText("بانتظار الرد");

  const { rows } = await db.query<{ accepted: boolean; n: string }>(
    `select pp.accepted, (select count(*) from public.notifications n where n.member_id = pp.member_id and n.key = 'MSG-copresenter_invited') as n
       from public.proposal_presenters pp where pp.proposal_id = $1 and pp.member_id = $2`,
    [ids.submitted, users[2].memberId],
  );
  expect(rows[0].accepted).toBe(false);
  expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1);

  await presenters.getByRole("button", { name: /أزل.*خالد الغامدي/ }).click();
  const confirm = page.getByRole("dialog", { name: /خالد الغامدي/ });
  await confirm.getByRole("button", { name: "أزل", exact: true }).click();
  await expect(presenters.getByRole("listitem").filter({ hasText: "خالد الغامدي" })).toHaveCount(0);
});

test("the co-presenter's own view: the invitation, no notes, no controls", async ({ context, page }) => {
  await signIn(context, 1);
  await open(page, ids.changes);
  const main = page.locator("#main");
  await expect(main.getByText("دُعيت للتقديم في هذا الموضوع")).toBeVisible();
  await expect(main.getByText("ملاحظة للمشرف وحده")).toHaveCount(0);
  await expect(main.getByRole("button", { name: /أضف مُقدِّمًا مشاركًا/ })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /أزل/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "عدّل وأعد الإرسال" })).toHaveCount(0);
  await capture(page, "invited");
});
