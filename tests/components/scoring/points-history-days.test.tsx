// `PointsHistoryList`'s missed-day notice — REQ-SES-017, wave 9.
//
// New behaviour, new file (wave-9 rule 4). `points-history-list.test.tsx`
// existed on `main` and keeps every assertion it had; the only line that
// changed there is its translator mock, because the component now reads
// `sessions.days` whether or not a notice is rendered.
//
// ★ The case that matters most is «a one-day history is unchanged». Nearly
// every session has one day, and everything this wave adds has to leave that
// page exactly as it was.
//
// Real `ar/scoring.json` AND `ar/sessions.json` through next-intl's
// createTranslator: contract 7 says there is ONE day-label formatter and every
// track calls it, so the notice renders «اليوم الثاني» through `sessions`' own
// strings rather than growing a second set.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/scoring.json";
import arSessions from "@/messages/ar/sessions.json";
import type { MissedAttendance, PointsLedgerRow } from "@/lib/dal/points";

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

async function renderList(rows: PointsLedgerRow[], missed: MissedAttendance[] = []) {
  const element = await PointsHistoryList({ rows, missed, timeZone: "Asia/Riyadh" });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
}

describe("PointsHistoryList — the missed-day notice", () => {
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
