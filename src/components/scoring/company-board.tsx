import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { CompanyBoardRow } from "@/lib/dal/leaderboards";

// SCR-028 · سباق الشركات, on the M9 system for wave 7 (`sessions`' this wave).
//
// ★ BOTH METRICS, ALWAYS, AND THE RANKING ONE MARKED (REQ-LDR-004, REQ-LDR-005).
// A company with a small, high-scoring roster and a company with a large,
// modest one are both visible on their own terms. The metric the org ranks by
// comes first in every row and carries «الترتيب حسبه»; the other follows,
// quieter. The active-member count behind «نقاط لكل عضو نشط» is frozen at
// snapshot time (`05` §6.2), and the screen says so under the list.

export async function CompanyBoard({ rows, metric }: { rows: CompanyBoardRow[]; metric: "total_points" | "points_per_active_member" }) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />;
  }

  const perMember = (v: number | null) => (v != null ? formatNumber(Math.round(v * 100) / 100) : "—");
  const metrics = (row: CompanyBoardRow) => {
    const total = { key: "total", label: t("company.totalPoints"), value: formatNumber(row.totalPoints) };
    const per = { key: "per", label: t("company.perActiveMember"), value: perMember(row.pointsPerActiveMember) };
    return metric === "points_per_active_member" ? [per, total] : [total, per];
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.companyId} className="rounded-card border border-edge bg-surface px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-9 shrink-0 text-center text-label text-fg-muted">
                <span className="sr-only">{t("rankValue", { value: formatNumber(row.rank) })}</span>
                <span aria-hidden>{formatNumber(row.rank)}</span>
              </span>
              <span className="min-w-0 flex-1 text-body text-fg-heading">
                <bdi>{row.companyName}</bdi>
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-3 ps-12">
              {metrics(row).map((m, i) => (
                <div key={m.key}>
                  <dt className="flex flex-wrap items-center gap-1.5 text-caption text-fg-muted">
                    {m.label}
                    {i === 0 ? (
                      <Badge tone="info" size="sm">
                        {t("company.rankedMetric")}
                      </Badge>
                    ) : null}
                  </dt>
                  <dd className={i === 0 ? "mt-0.5 text-label text-fg-heading" : "mt-0.5 text-body-sm text-fg-body"}>
                    <bdi>{m.value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-fg-muted">{t("company.asOf")}</p>
    </div>
  );
}
