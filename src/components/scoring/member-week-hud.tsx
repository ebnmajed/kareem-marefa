import { formatNumber } from "@/components/sessions/numerals";
import { MomentWeek, WeekFigure } from "@/components/scoring/moment-week";
import { MONTHLY_BOARD, POINTS_PAGE, weekView } from "@/components/scoring/week-view";
import type { WeekHudProps } from "@/components/ui";
import { WeekHud } from "@/components/ui/week-hud";

// The member's week on the phone — `SCR-010`'s HUD (wave 18, REQ-UIX-055, contract 4; `Home.dc.html`).
// scoring's file; `content`'s home places it after the rings and before the first day, `lg:hidden`.
//
// ★ Every figure is read, never typed (contract 7): the rank is the MONTHLY board's, named by the snapshot's
// own month (DEC-206 §4.47); the streak is in months, with no skip (§4.49); the points are the live balance;
// the bar is `SCR-022`'s own fraction. An absence is words — `week-hud` has no place for a zero.
//
// An opted-out member sees their own rank, and the tile says it is hidden from everyone else (REQ-LDR-008,
// DEC-207 §1.1). Moments 3 and 5 are `MomentWeek`'s, sharing their marks with `SCR-022` and the monthly
// board: whichever the member opens first plays.

export async function MemberWeekHud({ locale, className = "" }: { locale: string; className?: string }) {
  const { week, t, month, seenRank, moment } = await weekView(locale);
  const monthLabel = month ?? "";

  const rank: WeekHudProps["rank"] = week.rank
    ? {
        label: week.optedOut ? t("week.rank.labelHidden") : t.rich("week.rank.label", { month: monthLabel, bdi: (chunks) => <bdi>{chunks}</bdi> }),
        value: <WeekFigure slot="rank" prefix="#" text={`#${formatNumber(week.rank.rank)}`} />,
        valueLabel: t.markup("week.rank.valueLabel", { rank: formatNumber(week.rank.rank), total: formatNumber(week.rank.total), month: monthLabel, bdi: (chunks) => chunks }),
        href: MONTHLY_BOARD,
        movement: seenRank !== null ? { riseLabel: t("week.rank.rise", { count: seenRank - week.rank.rank, value: formatNumber(seenRank - week.rank.rank) }) } : null,
      }
    : {
        label: month ? t.rich("week.rank.label", { month: monthLabel, bdi: (chunks) => <bdi>{chunks}</bdi> }) : t("week.rank.labelPlain"),
        absent: week.rankAbsence === "no_snapshot" ? t("week.rank.noSnapshot") : t("week.rank.noPoints"),
        href: MONTHLY_BOARD,
      };

  const streak: WeekHudProps["streak"] = week.streak
    ? week.streak.months > 0
      ? {
          label: t("week.streak.label"),
          // «×7» is notation, not copy: the multiplication sign and the figure, the same in every language.
          value: `×${formatNumber(week.streak.months)}`,
          valueLabel: t.markup("points.head.streak", { count: week.streak.months, value: formatNumber(week.streak.months), bdi: (chunks) => chunks }),
        }
      : { label: t("week.streak.label"), absent: t("week.streak.none") }
    : null;

  const c = week.completion;
  const points: WeekHudProps["points"] = {
    label: t("week.points.label"),
    value: <WeekFigure slot="points" text={formatNumber(week.points)} />,
    valueLabel: t("week.points.valueLabel", { count: week.points, value: formatNumber(week.points) }),
    href: POINTS_PAGE,
    delta: c ? t.rich("points.head.delta", { value: formatNumber(c.delta), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null,
    deltaLabel: c ? t("points.head.deltaLabel", { count: c.delta, value: formatNumber(c.delta) }) : null,
  };

  const levelLine = week.level
    ? week.next
      ? t.rich("week.level.remaining", { count: week.next.remaining, value: formatNumber(week.next.remaining), level: week.next.name, bdi: (chunks) => <bdi>{chunks}</bdi> })
      : t("points.head.level.top")
    : t("points.head.level.none");
  const level: WeekHudProps["level"] = week.level && week.progress ? { value: week.progress.value, max: week.progress.max, line: levelLine } : { line: levelLine };

  return (
    <MomentWeek {...moment} className={className}>
      <WeekHud label={t("week.label")} rank={rank} streak={streak} points={points} level={level} />
    </MomentWeek>
  );
}
