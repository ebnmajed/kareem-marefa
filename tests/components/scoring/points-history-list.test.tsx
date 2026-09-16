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
import type { PointsLedgerRow } from "@/lib/dal/points";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "scoring.points" }),
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

async function renderList(rows: PointsLedgerRow[]) {
  const element = await PointsHistoryList({ rows, timeZone: "Asia/Riyadh" });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("PointsHistoryList", () => {
  it("shows the empty state as an announced status", async () => {
    await renderList([]);
    expect(screen.getByRole("status")).toHaveTextContent("لا نقاط بعد");
  });

  it("renders a plain award with no reversal or manual tag", async () => {
    await renderList([row()]);
    expect(screen.getByText("تسجيل حضور")).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.queryByText("إلغاء نقاط سابقة")).not.toBeInTheDocument();
    expect(screen.queryByText("تعديل يدوي من الإدارة")).not.toBeInTheDocument();
  });

  // ★ Contract 3 — REQ-CHK-017. checkin's reversal entry, exactly as
  // published: source = 'reversal', reason «أُلغي تسجيل الحضور».
  it("renders checkin's REQ-CHK-017 reversal entry with its own tag and reason", async () => {
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
    expect(screen.getByText("أُلغي تسجيل الحضور")).toBeInTheDocument();
    // `formatNumber(-5)` carries a leading bidi mark ahead of the minus sign
    // in an RTL document — real, correct output, not a fixture bug — so a
    // regex substring match, not an exact one.
    expect(screen.getByText(/-5/)).toBeInTheDocument();
    expect(screen.getByText("إلغاء نقاط سابقة")).toBeInTheDocument();
    expect(screen.queryByText("تعديل يدوي من الإدارة")).not.toBeInTheDocument();
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
});
