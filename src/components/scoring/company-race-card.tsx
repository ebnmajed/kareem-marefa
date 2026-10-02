import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { monthName } from "@/components/scoring/week-format";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { RaceBar } from "@/components/ui/race-bar";
import { getCompanyRace, type CompanyRace } from "@/lib/dal/leaderboards";

// The company race on the home — «سباق الشركات» (wave 18, REQ-UIX-055, DEC-206 §4.50, DEC-207 W3, W7).
// scoring's file. On the phone `content` places it in the feed (`Home.dc.html`: two leaders and the member's
// own); in the game rail it holds four and the own if it stands below them (`HomeDesktop.dc.html`).
//
// ★ THE MONTH'S RACE, and there is no «round»: the pill says when the month ends, or that it is final. The
// period is the snapshot's own. The rows are `race-bar` on one line each; the metric is said on every row to a
// screen reader and shown once, visibly, in the card's link to the full board (REQ-LDR-005). The own company
// is outlined and says «فريقك». ★ It has no moment — the company board keeps its own first sight — and it
// renders nothing at all when there is no race to show.

function metricValue(race: CompanyRace, row: CompanyRace["rows"][number]): string {
  if (race.metric === "total_points") return formatNumber(row.totalPoints);
  return row.pointsPerActiveMember === null ? "—" : formatNumber(Math.round(row.pointsPerActiveMember * 100) / 100);
}

export async function CompanyRaceCard({ locale, leaders = 2, className = "" }: { locale: string; leaders?: number; className?: string }) {
  const [race, t] = await Promise.all([getCompanyRace(locale, { leaders }), getTranslations("scoring")]);
  if (!race) return null;
  const metric = t(`race.metric.${race.metric}`);
  const pill = race.period.isFinal
    ? t.rich("race.final", { month: monthName(race.period.start, locale), bdi: (chunks) => <bdi>{chunks}</bdi> })
    : t("week.rank.ends", { count: race.period.daysLeft ?? 0, value: formatNumber(race.period.daysLeft ?? 0) });

  return (
    <section className={`flex flex-col gap-2 rounded-panel border border-edge bg-surface px-3.5 py-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-play-sm font-extrabold text-fg-heading">
          <Link href="/app/leaderboards?board=companies" quiet className="text-fg-heading no-underline hover:underline">
            {t("race.title")}
          </Link>
        </h2>
        <Badge size="sm">{pill}</Badge>
      </div>
      <ul className="flex flex-col gap-1">
        {race.rows.map((row) => (
          <RaceBar
            key={row.companyId}
            layout="inline"
            companyName={row.companyName}
            teamColor={row.teamColor}
            value={metricValue(race, row)}
            metricLabel={metric}
            fraction={row.fraction}
            // ★ wave 20, PR C (REQ-UIX-082): a company below the snapshot's minimum has no rank — here as on 028, so two
            // surfaces never disagree about one company's rank.
            rank={row.unranked ? undefined : row.rank}
            rankLabel={row.unranked ? undefined : t.markup("race.rankLabel", { value: formatNumber(row.rank), bdi: (chunks) => chunks })}
            ownLabel={row.isOwn ? t("race.own") : null}
            note={row.unranked ? t("race.unranked") : null}
          />
        ))}
      </ul>
      {race.ownCompanyId === null ? (
        <Link href="/app/me" className="text-caption text-fg-muted">
          {t("race.noCompany")}
        </Link>
      ) : null}
      <Link href="/app/leaderboards?board=companies" quiet className="text-caption text-fg-muted">
        {t.rich("race.full", { metric, bdi: (chunks) => <bdi>{chunks}</bdi> })}
      </Link>
    </section>
  );
}
