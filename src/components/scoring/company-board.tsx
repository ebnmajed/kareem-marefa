import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentRank } from "@/components/scoring/moment-rank";
import { EmptyState } from "@/components/ui/empty-state";
import { RaceBar } from "@/components/ui/race-bar";
// ★ Wave 17 (DEC-199 §1.3.4): the shell's layout is the scope now and scopes do not nest, so this is a plain element.
import { companyFractions } from "@/components/scoring/race-fractions";
import type { BoardMoment, CompanyBoardRow } from "@/lib/dal/leaderboards";

// SCR-028 · سباق الشركات. On the M9 system in wave 7 (`sessions`'); ★ wave 16
// (`scoring`'s for the wave, DEC-195 §1.1, REQ-UIX-048): each company is a
// `race-bar` inside the playground's scope, and moment 5 grows the member's own
// company's bar by `scaleX` from where they last saw it — and swaps its row if it
// rose.
//
// ★ BOTH METRICS, ALWAYS, AND THE RANKING ONE MARKED (REQ-LDR-004, REQ-LDR-005).
// The bar's value is the metric the org ranks by, and its `metricLabel` says so
// in words — «الترتيب حسبه: …»; the other metric follows, quieter, as
// `secondary`. Both values are signed: the board keeps any company whose total
// is not zero (0081), and members' reversals can take it below — `race-bar`
// holds each in `<bdi dir="ltr">` and draws a negative as an empty track.
//
// ★ A COMPANY IS ITS NAME AND ITS COLOUR (DEC-195 §4 — no logo). The name is
// always text; the colour is `--team`, never the only identifier. The viewer's
// own company says «فريقك» in words. The active-member count behind «نقاط لكل
// عضو نشط» is frozen at snapshot time (`05` §6.2), and the screen says so.

export async function CompanyBoard({
  rows,
  metric,
  moment = null,
  acknowledge = null,
  documentLoad = false,
}: {
  rows: CompanyBoardRow[];
  metric: "total_points" | "points_per_active_member";
  /** wave 16: what the viewer last saw of their company, from `getBoardMoment()`. */
  moment?: BoardMoment | null;
  acknowledge?: (() => Promise<void>) | null;
  /** wave 16: from `isDocumentLoad()` — a hard load plays nothing. */
  documentLoad?: boolean;
}) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />;
  }

  const perMember = (v: number | null) => (v != null ? formatNumber(Math.round(v * 100) / 100) : "—");
  const fractions = companyFractions(rows, metric);
  const totalLabel = t("company.totalPoints");
  const perLabel = t("company.perActiveMember");

  const own = rows.findIndex((r) => r.isOwn);
  const seenRank = moment?.seenRank ?? null;

  const list = (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <RaceBar
            key={row.companyId}
            companyName={row.companyName}
            teamColor={row.teamColor ?? null}
            rank={row.rank}
            rankLabel={t.markup("rankValue", { value: formatNumber(row.rank), bdi: (chunks) => chunks })}
            value={metric === "points_per_active_member" ? perMember(row.pointsPerActiveMember) : formatNumber(row.totalPoints)}
            metricLabel={t(`company.rankedMetricLabel.${metric}`)}
            fraction={fractions.get(row.companyId) ?? 0}
            secondary={
              metric === "points_per_active_member"
                ? { label: totalLabel, value: formatNumber(row.totalPoints) }
                : { label: perLabel, value: perMember(row.pointsPerActiveMember) }
            }
            ownLabel={row.isOwn ? t("company.ownLabel") : null}
          />
        ))}
      </ul>
      <p className="text-body-sm text-fg-muted">{t("company.asOf")}</p>
    </div>
  );

  return (
    <div className="rounded-panel bg-canvas p-3">
      {acknowledge ? (
        <MomentRank
          occurrenceId={moment?.occurrenceId ?? null}
          index={own >= 0 ? own : null}
          passed={seenRank !== null && own >= 0 ? Math.max(0, seenRank - rows[own].rank) : 0}
          fromFraction={moment?.seenFraction ?? null}
          needsMark={moment?.needsMark ?? false}
          acknowledge={acknowledge}
          documentLoad={documentLoad}
        >
          {list}
        </MomentRank>
      ) : (
        list
      )}
    </div>
  );
}
