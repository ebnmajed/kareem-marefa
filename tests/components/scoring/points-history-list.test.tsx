// `PointsHistoryList` — SCR-022, REQ-PTS-003, REQ-CHK-017 (contract 3).
// Real ar/scoring.json through next-intl's createTranslator, same pattern
// as materials/list.test.tsx (an async server component, so the element is
// awaited directly rather than mounted through a mocked DAL — this
// component takes its rows as a plain prop, nothing to mock).
//
// The reversal row is `checkin`'s own contract, published in their plan and
// confirmed by the lead: `source = 'reversal'` (the existing `ledger_source`
// enum literal — `points.ts` already flags it generically off that column,
// so this component needed no change to render it) and the reason
// «أُلغي تسجيل الحضور». Real text, not a placeholder — contract 3 landed
// before this file did.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/scoring.json";
import arSessions from "@/messages/ar/sessions.json";
import type { MissedAttendance, PointsLedgerRow } from "@/lib/dal/points";

// ★ HARNESS ONLY — wave 9. The component now also reads `sessions.days`, for
// REQ-SES-017's missed-day notice: contract 7 says there is ONE day-label
// formatter and every track calls it, so this renders «اليوم الثاني» through
// `sessions`' own strings rather than growing a second set. Not one assertion
// below changed, and nothing about a one-day history changed with it.
const messages = { ...ar, ...arSessions };

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "scoring.points" }),
}));

const { PointsHistoryList } = await import("@/components/scoring/points-history-list");

function row(overrides: Partial<PointsLedgerRow> = {}): PointsLedgerRow {
  return {
    id: "r1",
    occurredAt: "2026-09-10T10:00:00Z",
    amount: 5,
    reason: "تسجيل حضور",
    ruleKey: "check_in",
    source: "check_in",
    sessionId: "s1",
    sessionTitle: "جلسة اختبار",
    isReversal: false,
    isManualAdjustment: false,
    ...overrides,
  };
}

async function renderList(rows: PointsLedgerRow[], missed: MissedAttendance[] = []) {
  const element = await PointsHistoryList({ rows, missed, timeZone: "Asia/Riyadh" });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
}

function notice(overrides: Partial<MissedAttendance> = {}): MissedAttendance {
  return {
    sessionId: "w1",
    sessionTitle: "ورشة ثلاثة أيام",
    completedAt: "2026-09-12T18:00:00Z",
    dayCount: 3,
    days: [{ position: 2, startsAt: "2026-09-11T15:00:00Z" }],
    ...overrides,
  };
}

describe("PointsHistoryList", () => {
  it("shows the empty state with its own next action, not a dead end — REQ-UIX-012", async () => {
    await renderList([]);
    expect(screen.getByText("لا نقاط بعد", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفّح الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
  });

  it("renders a plain award with no reversal or manual tag", async () => {
    await renderList([row()]);
    expect(screen.getByText("تسجيل حضور")).toBeInTheDocument();
    const amountNode = screen.getByText("+5");
    expect(amountNode).toHaveAttribute("dir", "ltr"); // same fix, the "+" side
    expect(screen.queryByText("إلغاء نقاط سابقة")).not.toBeInTheDocument();
    expect(screen.queryByText("تعديل يدوي من الإدارة")).not.toBeInTheDocument();
  });

  // ★ Contract 3 — REQ-CHK-017, the landed migration (0087): a
  // compensating row, `source = 'reversal'`, `amount` = minus the
  // original award, `reason` the FIXED system string «أُلغي تسجيل الحضور»
  // (never a key — the same pattern 0032's «حُذف المحتوى» already uses),
  // rendered literally inside its own `<bdi>`. Deliberately strict, per
  // the lead's own ask: checks the actual DOM node is a `<bdi>` (not just
  // that the text appears somewhere) and the EXACT text content, so this
  // fails outright if the sign is dropped (amount rendering as "5") or if
  // the `<bdi>` wrapper is lost (a plain text node reordering against the
  // Arabic label in a real RTL document, invisible to a loose substring
  // match) — not a regex a silent regression could still pass.
  it("renders checkin's REQ-CHK-017 reversal entry: a Western minus, no Arabic-Indic digits, both fields in their own <bdi>", async () => {
    await renderList([
      row({
        id: "r2",
        amount: -5,
        reason: "أُلغي تسجيل الحضور",
        source: "reversal",
        isReversal: true,
        ruleKey: "check_in",
      }),
    ]);

    const reasonNode = screen.getByText("أُلغي تسجيل الحضور");
    expect(reasonNode.tagName).toBe("BDI");

    const amountNode = screen.getByText(/-5/);
    expect(amountNode.tagName).toBe("BDI");
    // `dir="ltr"` is pinned deliberately on this bdi, not because a reorder
    // was ever actually observed in a real browser (a sync-5 finding to that
    // effect turned out to be a misread of a downscaled capture) — it just
    // states outright what a bare bdi already does in Chromium, rather than
    // leaving it to the bidi algorithm's default. Asserted as an attribute,
    // not a string, since jsdom's layout-free textContent can't see a
    // visual reorder either way.
    expect(amountNode).toHaveAttribute("dir", "ltr");
    // Strip only bidi CONTROL characters (LRM/RLM) — a sign or digit lost
    // would change this comparison, a bidi mark alone must not.
    expect(amountNode.textContent?.replace(/[‎‏]/g, "")).toBe("-5");
    expect(amountNode.textContent).not.toMatch(/[٠-٩]/); // DEC-124 — never Arabic-Indic, anywhere.

    expect(screen.getByText("إلغاء نقاط سابقة")).toBeInTheDocument();
    expect(screen.queryByText("تعديل يدوي من الإدارة")).not.toBeInTheDocument();
  });

  // ★ The admin's own removal reason is NOT this screen's to show — the
  // lead's ruling: it lives on `check_ins.removal_reason` and
  // `audit_log` only, the same withholding the certificate path already
  // does for a revocation reason (REQ-CRT-011, the public verification
  // page). The fixed system string is the only reason a member ever sees
  // for a reversal, regardless of what an admin actually wrote.
  it("never renders anything beyond the fixed system reason for a reversal — the admin's own words stay off this screen", async () => {
    await renderList([
      row({ id: "r2", amount: -5, reason: "أُلغي تسجيل الحضور", source: "reversal", isReversal: true }),
    ]);
    expect(screen.queryByText(/سبب/)).not.toBeInTheDocument(); // no "reason:" label — there is nothing beyond the fixed sentence to attach one to.
  });

  // Balance reconciliation is `getPointsHistory()`'s own arithmetic
  // (`points_balances`, summed server-side), not this component's — it
  // only ever renders what it is handed. Asserted here anyway, as the
  // negative statement the lead asked to confirm: this component adds no
  // second, competing total of its own that could drift from it.
  it("renders no total of its own — the balance is the page's Stat, read once, never recomputed per row", async () => {
    await renderList([row({ id: "r1", amount: 20 }), row({ id: "r2", amount: -5, isReversal: true, reason: "أُلغي تسجيل الحضور" })]);
    expect(screen.queryByText(/^15$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/رصيدك/)).not.toBeInTheDocument();
  });

  it("renders a manual adjustment's own tag, and links back to its session", async () => {
    await renderList([row({ id: "r3", isManualAdjustment: true, source: "manual_adjustment", reason: "مكافأة تقدير من المشرف" })]);
    expect(screen.getByText("تعديل يدوي من الإدارة")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", "/ar/app/sessions/s1");
  });

  it("is axe-clean with a mixed history", async () => {
    const { container } = await renderList([row(), row({ id: "r2", isReversal: true, source: "reversal", reason: "أُلغي تسجيل الحضور" })]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  // ★ REQ-SES-017 — wave 9. No ledger row is written for an award that did not
  // happen, so the only way a member can explain the gap is a notice that is
  // not a ledger row. It carries NO amount: the absence of a number is the
  // fact, and an amount would read as points that moved.
  it("names the missed day, states the rule, and shows no amount", async () => {
    await renderList([], [notice()]);
    expect(screen.getByText("لم تُحتسب نقاط الحضور")).toBeInTheDocument();
    expect(screen.getByText("فاتك اليوم الثاني")).toBeInTheDocument();
    expect(screen.getByText("نقاط الحضور تُمنح مرة واحدة عند حضور جميع أيام الجلسة.")).toBeInTheDocument();
    expect(screen.queryByText(/^[+-]/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "فتح الجلسة" })).toHaveAttribute("href", "/ar/app/sessions/w1");
  });

  it("joins several missed days in the locale's own conjunction, with Western numerals only", async () => {
    await renderList([], [notice({ days: [{ position: 2, startsAt: "2026-09-11T15:00:00Z" }, { position: 3, startsAt: "2026-09-12T15:00:00Z" }] })]);
    // Two days take Arabic's DUAL form («فاتك»), three take the plural
    // («فاتتك») — which is exactly why the string carries all six ICU forms
    // and why this matcher does not assume one of them.
    const line = screen.getByText(/فات/);
    expect(line.textContent).toContain("اليوم الثاني");
    expect(line.textContent).toContain("اليوم الثالث");
    expect(line.textContent).not.toMatch(/[٠-٩]/); // DEC-124
  });

  it("★ a one-day history is unchanged: no notice is ever rendered, and the empty state still wins when there is nothing at all", async () => {
    await renderList([row()]);
    expect(screen.queryByText("لم تُحتسب نقاط الحضور")).not.toBeInTheDocument();
    screen.getByText("تسجيل حضور");
  });

  it("shows the notice rather than the empty state when a member has no points but does have something to explain", async () => {
    await renderList([], [notice()]);
    expect(screen.queryByText("لا نقاط بعد", { exact: false })).not.toBeInTheDocument();
  });

  it("interleaves the notice by the session's completion time, newest first", async () => {
    const { container } = await renderList(
      [row({ id: "r1", occurredAt: "2026-09-14T10:00:00Z", reason: "أحدث" }), row({ id: "r2", occurredAt: "2026-09-01T10:00:00Z", reason: "أقدم" })],
      [notice()], // 2026-09-12, between the two
    );
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("أحدث");
    expect(items[1]).toContain("لم تُحتسب نقاط الحضور");
    expect(items[2]).toContain("أقدم");
  });

  it("is axe-clean with a notice in the list", async () => {
    const { container } = await renderList([row()], [notice()]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
