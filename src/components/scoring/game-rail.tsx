import type { ReactNode } from "react";
import { formatNumber } from "@/components/sessions/numerals";
import { CompanyRaceCard } from "@/components/scoring/company-race-card";
import { MomentWeek, WeekFigure } from "@/components/scoring/moment-week";
import { MONTHLY_BOARD, POINTS_PAGE, weekView } from "@/components/scoring/week-view";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { FlameObject } from "@/components/ui/objects/flame";
import { ProgressBar } from "@/components/ui/progress-bar";

// The game rail's cards — the frame's `rail` slot on the home and on browse (wave 18, REQ-UIX-055, contract 4;
// `HomeDesktop.dc.html`). scoring's file. Three cards are scoring's, and `children` is the fourth,
// «التالية لك», which is `sessions'` (`NextForMe`, DEC-207 §2).
//
//   1 · the rank: the MONTHLY board's (DEC-206 §4.47), «من N» the members the snapshot ranks (DEC-207 §1.2),
//       and the member directly above — their name, their team ring, and how many points would reach them.
//       An opted-out member is nobody's neighbour; rank 1 has none, and says so without a «+0».
//   2 · the streak in months with the rule that keeps it (W8), the flame where the run is alive, the balance,
//       ★ and the way to the next level under it (DEC-207 W5: REQ-UIX-055 wins over the artboard's omission).
//   3 · the race, four leaders and the member's own (W7).
//
// ★ No copy says «now» (W11): the rank and the gap are last night's snapshot. Moments 3 and 5 are
// `MomentWeek`'s, on this copy when it is the one displayed — the rail is in the HTML at every width.

export async function GameRail({ locale, children }: { locale: string; children?: ReactNode }) {
  const { week, t, month, seenRank, moment } = await weekView(locale);
  const monthLabel = month ?? "";
  const r = week.rank;
  const c = week.completion;

  const pill = week.period
    ? week.period.isFinal
      ? t("week.rank.final")
      : t("week.rank.ends", { count: week.period.daysLeft ?? 0, value: formatNumber(week.period.daysLeft ?? 0) })
    : null;

  const rankCard = (
    <section className="flex flex-col gap-2.5 rounded-panel border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption font-bold text-fg-muted">
        <h2>{month ? t.rich("week.rank.heading", { month: monthLabel, bdi: (chunks) => <bdi>{chunks}</bdi> }) : t("week.rank.labelPlain")}</h2>
        {pill ? <Badge size="sm">{pill}</Badge> : null}
      </div>
      {r ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2.5">
            <Link href={MONTHLY_BOARD} quiet data-slot="rank" className="font-display text-play-lg font-extrabold text-accent no-underline pg-light:text-fg-heading">
              <span className="sr-only">
                {t.markup("week.rank.valueLabel", { rank: formatNumber(r.rank), total: formatNumber(r.total), month: monthLabel, bdi: (chunks) => chunks })}
              </span>
              <bdi aria-hidden="true" dir="ltr">
                <WeekFigure slot="rank" prefix="#" text={`#${formatNumber(r.rank)}`} />
              </bdi>
            </Link>
            <span aria-hidden="true" className="font-display text-play-sm font-bold text-fg-muted">
              {t.rich("week.rank.of", { total: formatNumber(r.total), bdi: (chunks) => <bdi>{chunks}</bdi> })}
            </span>
            {seenRank !== null ? (
              <span data-slot="rise" className="flex items-center text-accent pg-light:text-fg-heading">
                <ArrowIcon direction="up" />
                <span className="sr-only">{t("week.rank.rise", { count: seenRank - r.rank, value: formatNumber(seenRank - r.rank) })}</span>
              </span>
            ) : null}
          </p>
          {week.optedOut ? <p className="text-caption text-fg-muted">{t("week.rank.hidden")}</p> : null}
          {r.above ? (
            <p className="flex items-center gap-2.5 rounded-tile bg-raised px-3 py-2.5 text-caption">
              <Avatar memberId={r.above.memberId} displayName={r.above.displayName} size={32} decorative teamColor={r.above.teamColor} />
              <span className="min-w-0 flex-1 text-fg-body">
                {t.rich("week.rank.above", {
                  name: r.above.displayName,
                  bdi: (chunks) => <bdi>{chunks}</bdi>,
                  b: (chunks) => (
                    <Link href={`/app/members/${r.above!.memberId}`} className="font-bold text-fg-heading">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
              <span className="shrink-0 font-bold text-accent pg-light:text-fg-heading">
                <span className="sr-only">{t("week.rank.gapLabel", { count: r.above.gap, value: formatNumber(r.above.gap) })}</span>
                <span aria-hidden="true">
                  {t.rich("week.rank.gap", {
                    value: formatNumber(r.above.gap),
                    // ★ A signed figure reads left to right: «+30», never «30+».
                    n: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
                    bdi: (chunks) => chunks,
                  })}
                </span>
              </span>
            </p>
          ) : (
            <p className="rounded-tile bg-raised px-3 py-2.5 text-caption font-bold text-fg-heading">{t("week.rank.first")}</p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-body font-bold text-fg-heading">{week.rankAbsence === "no_snapshot" ? t("week.rank.noSnapshotLong") : t("week.rank.noPointsLong")}</p>
          {week.rankAbsence === "no_points" && month ? (
            <p className="text-caption text-fg-muted">{t.rich("week.rank.noPointsHint", { month: monthLabel, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
          ) : null}
        </div>
      )}
    </section>
  );

  const streakAlive = week.streak !== null && week.streak.months > 0;
  const pointsCard = (
    <section className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4">
      <div className="flex items-center gap-3">
        {streakAlive ? (
          <span data-slot="flame" className="inline-flex shrink-0 origin-bottom">
            <span className="moment-flicker inline-flex origin-bottom">
              <FlameObject size={48} shadow={false} />
            </span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {week.streak ? (
            <>
              <h2 className="font-display text-play-sm font-extrabold text-signal pg-light:text-signal-deep">
                {week.streak.months > 0
                  ? t.rich("points.head.streak", { count: week.streak.months, value: formatNumber(week.streak.months), bdi: (chunks) => <bdi>{chunks}</bdi> })
                  : t("points.head.streakNone")}
              </h2>
              <p className="text-caption text-fg-muted">
                {t("week.streak.rule", { count: week.streak.requiredPerMonth, value: formatNumber(week.streak.requiredPerMonth) })}
              </p>
            </>
          ) : (
            <h2 className="sr-only">{t("week.points.label")}</h2>
          )}
        </div>
        <Link href={POINTS_PAGE} quiet data-slot="points" className="shrink-0 text-center text-fg-heading no-underline">
          <span className="sr-only">{t("week.points.valueLabel", { count: week.points, value: formatNumber(week.points) })}</span>
          <span aria-hidden="true" className="block font-display text-play-sm font-extrabold">
            <bdi dir="ltr">
              <WeekFigure slot="points" text={formatNumber(week.points)} />
            </bdi>
          </span>
          <span aria-hidden="true" className="block text-caption text-fg-muted">
            {t("week.points.unit", { count: week.points })}
          </span>
          {c ? (
            <span data-slot="delta" className="block font-display text-caption font-extrabold text-accent pg-light:text-fg-heading">
              <bdi aria-hidden="true" dir="ltr">
                {t.rich("points.head.delta", { value: formatNumber(c.delta), bdi: (chunks) => <bdi>{chunks}</bdi> })}
              </bdi>
              <span className="sr-only">{t("points.head.deltaLabel", { count: c.delta, value: formatNumber(c.delta) })}</span>
            </span>
          ) : null}
        </Link>
      </div>
      <div className="flex flex-col gap-1.5">
        {week.level && week.progress ? (
          <span data-slot="level-bar" className="block">
            <ProgressBar value={week.progress.value} max={week.progress.max} fill="accent" decorative />
          </span>
        ) : null}
        <p className="text-caption text-fg-muted">
          {week.level
            ? week.next
              ? t.rich("week.level.remaining", { count: week.next.remaining, value: formatNumber(week.next.remaining), level: week.next.name, bdi: (chunks) => <bdi>{chunks}</bdi> })
              : t("points.head.level.top")
            : t("points.head.level.none")}
        </p>
      </div>
    </section>
  );

  return (
    <>
      <MomentWeek {...moment} className="flex flex-col gap-3">
        {rankCard}
        {pointsCard}
      </MomentWeek>
      <CompanyRaceCard locale={locale} leaders={4} />
      {children}
    </>
  );
}
