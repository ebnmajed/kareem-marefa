import { getTranslations } from "next-intl/server";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import type { CompanyBoardRow } from "@/lib/dal/leaderboards";

// SCR-028 · سباق الشركات. Both metrics are always shown (REQ-LDR-004) — a
// company with a small, high-scoring roster and a company with a large,
// modest one are both visible on their own terms, and the metric the org
// ranks by is named rather than assumed. The active-member count behind
// points-per-active-member is frozen at snapshot time (05 §6.2); the
// screen says so rather than implying a live number.
export async function CompanyBoard({
  rows,
  numerals,
  metric,
}: {
  rows: CompanyBoardRow[];
  numerals: NumeralSystem;
  metric: "total_points" | "points_per_active_member";
}) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <p className="mt-4 rounded-field border border-edge p-4 text-body text-fg-muted">{t("empty")}</p>;
  }

  const metricLabel = metric === "points_per_active_member" ? t("company.perActiveMember") : t("company.totalPoints");

  return (
    <>
      <p className="mt-2 text-body-sm text-fg-muted">{t.rich("company.rankedBy", { metric: metricLabel, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
      <ol className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.companyId} className="rounded-field border border-edge p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-label text-fg-muted">
                  <bdi>{formatNumber(row.rank, numerals)}</bdi>
                </span>
                <span className="text-body text-fg-heading">
                  <bdi>{row.companyName}</bdi>
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-fg-muted">
              <span>
                {t("company.totalPoints")}: <bdi>{formatNumber(row.totalPoints, numerals)}</bdi>
              </span>
              <span>
                {t("company.perActiveMember")}: <bdi>{row.pointsPerActiveMember != null ? formatNumber(Math.round(row.pointsPerActiveMember * 100) / 100, numerals) : "—"}</bdi>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-body-sm text-fg-muted">{t("company.asOf")}</p>
    </>
  );
}
