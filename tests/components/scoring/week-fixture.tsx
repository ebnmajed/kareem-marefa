// Shared by the week's server-component tests (wave 18): a member's week and a race, as the DAL returns them,
// and a render that gives `ui/link` its intl context. Strings are the real Arabic catalogue.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import type { CompanyRace } from "@/lib/dal/leaderboards";
import type { MemberWeek } from "@/lib/dal/points";

export function memberWeek(over: Partial<MemberWeek> = {}): MemberWeek {
  return {
    period: { start: "2026-09-01", end: "2026-10-01", isFinal: false, takenAt: "2026-09-04T00:05:00Z", daysLeft: 26 },
    rank: {
      rank: 4,
      monthPoints: 120,
      total: 212,
      above: { memberId: "00000000-0000-4000-8000-000000000001", displayName: "سارة القحطاني", company: "مواهب", teamColor: "#35d0ff", rank: 3, gap: 30 },
    },
    rankAbsence: null,
    optedOut: false,
    streak: { months: 7, requiredPerMonth: 3 },
    points: 680,
    level: { name: "صاحب أثر", tier: 3 },
    next: { name: "كريم معرفة", threshold: 700, remaining: 20 },
    progress: { value: 680, max: 700 },
    completion: null,
    levelUpPending: false,
    pointsMark: { entryId: "e1", total: 680, levelId: "l3" },
    pointsNeedsMark: false,
    rankMoment: { occurrenceId: null, seenRank: null, seenFraction: null, needsMark: false, mark: { board: "monthly", period: "2026-09-01", rank: 4, companyId: null, fraction: null } },
    ...over,
  };
}

export function companyRace(over: Partial<CompanyRace> = {}): CompanyRace {
  return {
    metric: "points_per_active_member",
    period: { start: "2026-09-01", end: "2026-10-01", isFinal: false, takenAt: "2026-09-04T00:05:00Z", daysLeft: 26 },
    rows: [
      { companyId: "c1", companyName: "مواهب", teamColor: "#35d0ff", rank: 1, totalPoints: 2310, pointsPerActiveMember: 9.4, fraction: 1, isOwn: false },
      { companyId: "c2", companyName: "بنينسولا ستوري", teamColor: "#ff4fb8", rank: 2, totalPoints: 1915, pointsPerActiveMember: 8.7, fraction: 8.7 / 9.4, isOwn: false },
      { companyId: "c3", companyName: "صنف", teamColor: "#ff9a2e", rank: 3, totalPoints: 1204, pointsPerActiveMember: 7.3, fraction: 7.3 / 9.4, isOwn: true },
    ],
    ownCompanyId: "c3",
    companies: 5,
    ...over,
  };
}

export function renderIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      {ui}
    </NextIntlClientProvider>,
  );
}
