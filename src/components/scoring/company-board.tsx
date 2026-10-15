import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentRank } from "@/components/scoring/moment-rank";
import { companyFractions } from "@/components/scoring/race-fractions";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon } from "@/components/ui/icons";
import { Podium } from "@/components/ui/podium";
import { RaceBar } from "@/components/ui/race-bar";
import type { BoardMoment, CompanyBoardRow } from "@/lib/dal/leaderboards";

// SCR-028's table — `Companies.dc.html`, `M10c.md` §8 (wave 20, REQ-UIX-079, REQ-LDR-004, REQ-LDR-005). Written from
// the artboard after the old file was deleted (DEC-208); scoring's for the wave, `sessions'` again after it.
//
// ★ BOTH METRICS ON EVERY ROW, THE RANKING ONE MARKED: the header names the columns once, visibly, with the ranking
// one checked; every row says both metrics' names to a screen reader (`race-bar`'s `grid`). The bar grows from the
// inline-start in the company's colour; a company is its NAME and its colour, never the colour alone. The viewer's
// company says «فريقك» and is outlined.
// ★ DEC-298 (the owner, 2026-10-15): the board reads like the members' — the first three RANKED companies stand on
// the podium, second · first · third, the cup over the first, each with its logo (or its initial on its colour); the
// rest follow as rows, with their logo beside the name. An unranked company («بلا ترتيب») never stands on the podium.
// ★ «N نشطًا» is the snapshot's frozen count, recovered from its frozen pair (`derivedActive()`), or nothing.
// ★ Moment 5: the viewer's company's bar grows from where it was seen, after its row swaps if it rose (`MomentRank`).

const PODIUM = 3;

export async function CompanyBoard({
  rows,
  metric,
  moment = null,
  acknowledge = null,
  documentLoad = false,
}: {
  rows: Array<CompanyBoardRow & { active?: number | null }>;
  metric: "total_points" | "points_per_active_member";
  moment?: BoardMoment | null;
  acknowledge?: (() => Promise<void>) | null;
  documentLoad?: boolean;
}) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />;
  }

  const perMember = (v: number | null) => (v != null ? formatNumber(Math.round(v * 10) / 10) : "—");
  const fractions = companyFractions(rows, metric);
  const seenRank = moment?.seenRank ?? null;
  const ranked = metric === "points_per_active_member";
  const rankedValue = (row: CompanyBoardRow) => (ranked ? perMember(row.pointsPerActiveMember) : formatNumber(row.totalPoints));

  const top = rows.filter((r) => !r.unranked).slice(0, PODIUM);
  const listed = rows.filter((r) => !top.includes(r));
  // Moment 5's index is into the ROWS under the podium, as on the members' board; a company on the podium does not move.
  const own = listed.findIndex((r) => r.isOwn);
  const ownRow = rows.find((r) => r.isOwn) ?? null;

  const podium = (
    <Podium
      label={t("podium.label")}
      places={top.map((row) => ({
        rank: row.rank,
        rankLabel: t.markup("rankValue", { value: formatNumber(row.rank), bdi: (chunks) => chunks }),
        memberId: row.companyId,
        kind: "company" as const,
        logoSrc: row.logoSrc ?? null,
        displayName: row.companyName,
        company: null,
        teamColor: row.teamColor ?? null,
        points: rankedValue(row),
        pointsLabel: `${ranked ? t("company.perActiveMember") : t("company.totalPoints")} ${rankedValue(row)}`,
        selfLabel: row.isOwn ? t("company.ownLabel") : null,
      }))}
    />
  );

  const list = listed.length === 0 ? null : (
    <div className="flex flex-col gap-2 border-t border-edge pt-4">
      {/* The columns, named once for the eye; each row says them to a screen reader. */}
      <div aria-hidden="true" className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] gap-x-3 px-3 text-caption font-bold text-fg-muted">
        <span className="text-center">{t("company.columns.rank")}</span>
        <span>{t("company.columns.company")}</span>
        <span className="inline-flex items-center gap-1 text-accent pg-light:text-fg-heading">
          {ranked ? t("company.columns.perActiveMember") : t("company.columns.totalPoints")}
          <CheckIcon />
        </span>
        <span>{ranked ? t("company.columns.totalPoints") : t("company.columns.perActiveMember")}</span>
      </div>
      <ul data-slot="board-rows" className="flex flex-col gap-2">
        {listed.map((row) => (
          <RaceBar
            key={row.companyId}
            layout="grid"
            companyName={row.companyName}
            teamColor={row.teamColor ?? null}
            logoSrc={row.logoSrc ?? null}
            // ★ wave 20, PR C (REQ-UIX-082): below the snapshot's frozen minimum — no rank, «بلا ترتيب» in its note.
            rank={row.unranked ? undefined : row.rank}
            rankLabel={row.unranked ? undefined : t.markup("rankValue", { value: formatNumber(row.rank), bdi: (chunks) => chunks })}
            value={rankedValue(row)}
            metricLabel={t(`company.rankedMetricLabel.${metric}`)}
            fraction={fractions.get(row.companyId) ?? 0}
            secondary={ranked ? { label: t("company.totalPoints"), value: formatNumber(row.totalPoints) } : { label: t("company.perActiveMember"), value: perMember(row.pointsPerActiveMember) }}
            ownLabel={row.isOwn ? t("company.ownLabel") : null}
            note={
              [row.unranked ? t("company.unranked") : null, row.active != null ? t.markup("company.active", { count: row.active, value: formatNumber(row.active), bdi: (chunks) => chunks }) : null]
                .filter(Boolean)
                .join(" · ") || null
            }
          />
        ))}
      </ul>
    </div>
  );

  const board = (
    <div className="flex flex-col gap-4">
      {podium}
      {list}
    </div>
  );

  return acknowledge ? (
    <MomentRank
      occurrenceId={moment?.occurrenceId ?? null}
      index={own >= 0 ? own : null}
      passed={seenRank !== null && ownRow ? Math.max(0, seenRank - ownRow.rank) : 0}
      fromFraction={moment?.seenFraction ?? null}
      needsMark={moment?.needsMark ?? false}
      acknowledge={acknowledge}
      documentLoad={documentLoad}
      listSelector="[data-slot=board-rows]"
    >
      {board}
    </MomentRank>
  ) : (
    board
  );
}
