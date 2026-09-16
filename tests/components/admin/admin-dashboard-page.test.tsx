// `/app/admin` — SCR-040, REQ-ADM-004/010. Same mocked-DAL + real-messages
// pattern as me/certificates-page.test.tsx and me/calendar-page.test.tsx: an
// async Server Component, awaited directly, real ar/admin.json through
// next-intl's createTranslator.
//
// Sync 5's finding: on an org with nothing to divide by yet, the
// attendance-rate Stat put a whole sentence in the number slot (stat-number
// size, wrapping three lines). Fixed in admin/page.tsx to a short "—" value
// with the sentence moved to Stat's own `hint`. This file proves the no-data
// case renders that way and stays that way.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/admin.json";
import type { DashboardData } from "@/lib/dal/admin-dashboard";

vi.mock("@/lib/dal/admin-dashboard", () => ({
  getAdminDashboardData: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "admin.dashboard" }),
  setRequestLocale: () => {},
}));

const { getAdminDashboardData } = await import("@/lib/dal/admin-dashboard");
const { default: AdminDashboardPage } = await import("@/app/[locale]/app/admin/page");

const emptyAttentionRow = { count: 0, oldestAgeDays: null };

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    proposalPipeline: { draft: 0, submitted: 0, inReview: 0, changesRequested: 0, approved: 0, rejected: 0 },
    rsvpsConfirmed: 0,
    checkInsTotal: 0,
    attendanceRate: null,
    activeMembers: 0,
    pointsIssued: 0,
    topPresenters: [],
    topCategories: [],
    topCompanies: [],
    attention: {
      proposalsAwaitingDecision: emptyAttentionRow,
      sessionsNotScheduled: emptyAttentionRow,
      openPhotoReports: emptyAttentionRow,
      openCommentReports: emptyAttentionRow,
    },
    ...overrides,
  };
}

async function renderPage(data: DashboardData) {
  vi.mocked(getAdminDashboardData).mockResolvedValue(data);
  const element = await AdminDashboardPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("AdminDashboardPage — attendance-rate Stat", () => {
  it("shows a short placeholder as the VALUE and the explanation as a hint when there is nothing to divide by yet", async () => {
    await renderPage(dashboardData({ attendanceRate: null }));
    const value = screen.getByText("—");
    const valueSlot = value.closest("strong");
    expect(valueSlot).not.toBeNull();
    expect(valueSlot).toHaveClass("text-h2");
    // the sentence never appears in the stat-number slot itself
    expect(valueSlot?.textContent).toBe("—");
    const hint = screen.getByText("لا جلسات بدأت بعد لحساب المعدّل.");
    expect(hint.tagName).toBe("SPAN");
    expect(hint).not.toHaveClass("text-h2");
  });

  it("shows the real percentage once there is data, with no hint underneath", async () => {
    await renderPage(dashboardData({ attendanceRate: 0.5 }));
    expect(screen.getByText("50٪")).toBeInTheDocument();
    expect(screen.queryByText("لا جلسات بدأت بعد لحساب المعدّل.")).not.toBeInTheDocument();
  });

  it("is axe-clean in the no-data state", async () => {
    const { container } = await renderPage(dashboardData({ attendanceRate: null }));
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
