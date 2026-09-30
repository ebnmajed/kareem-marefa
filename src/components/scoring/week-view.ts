import "server-only";
import { getTranslations } from "next-intl/server";
import { isDocumentLoad } from "@/components/scoring/document-load";
import { acknowledgeWeekPoints, acknowledgeWeekRank } from "@/components/scoring/week-actions";
import { monthName } from "@/components/scoring/week-format";
import { getMemberWeek, type MemberWeek } from "@/lib/dal/points";
import type { MomentWeekProps } from "@/components/scoring/moment-week";

// What the phone's HUD and the desktop's rail share (wave 18, REQ-UIX-055): the week, its words, and the
// moment's props — one read (`getMemberWeek()` is request-cached), one set of decisions, so the two copies
// can never say different things.

export const MONTHLY_BOARD = "/app/leaderboards?board=month";
export const POINTS_PAGE = "/app/me/points";

export interface WeekView {
  week: MemberWeek;
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  /** The snapshot's month by name, or null with no snapshot. */
  month: string | null;
  /** The rank last seen, when moment 5 has a rise to show — the arrow is drawn from it, statically too. */
  seenRank: number | null;
  moment: Omit<MomentWeekProps, "children" | "className">;
}

export async function weekView(locale: string): Promise<WeekView> {
  const [week, t, documentLoad] = await Promise.all([getMemberWeek(locale), getTranslations("scoring"), isDocumentLoad()]);
  const month = week.period ? monthName(week.period.start, locale) : null;
  const seenRank = week.rank && week.rankMoment.seenRank !== null && week.rankMoment.seenRank > week.rank.rank ? week.rankMoment.seenRank : null;

  const c = week.completion;
  const moment: WeekView["moment"] = {
    completion: c ? { occurrenceId: c.occurrenceId, from: c.from, to: c.to, fromProgress: c.fromProgress, moveBar: !week.levelUpPending } : null,
    rank: week.rank && week.rankMoment.occurrenceId && seenRank !== null ? { occurrenceId: week.rankMoment.occurrenceId, from: seenRank, to: week.rank.rank } : null,
    pointsNeedsMark: week.pointsNeedsMark,
    // No rank this month: the monthly mark is left for SCR-027, where the board says so itself.
    rankNeedsMark: week.rank !== null && week.rankMoment.needsMark,
    acknowledgePoints: acknowledgeWeekPoints.bind(null, locale, week.pointsMark),
    acknowledgeRank: week.rank ? acknowledgeWeekRank.bind(null, locale, week.rankMoment.mark) : null,
    documentLoad,
  };
  return { week, t, locale, month, seenRank, moment };
}
