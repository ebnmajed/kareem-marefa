import { getTranslations } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import type { CompanyPointsBreakdown } from "@/lib/dal/leaderboards";

// SCR-028's second half — "why does my company hold the points it holds" —
// the same explainability REQ-PTS-003 gives a member over their own history,
// extended to their own company (post-launch, `notes/scoring.md` «Company
// points rules»). On the M9 system for wave 7, under the «سباق الشركات» tab.
//
// Shown only to a member whose profile has a company. There is no "browse
// other companies' ledgers": `company_points_ledger`'s RLS is org-wide, and
// this screen simply never asks for anyone but the reader's own.

export async function CompanyPointsBreakdownSection({
  breakdown,
  locale,
  timeZone,
}: {
  breakdown: CompanyPointsBreakdown;
  locale: string;
  timeZone: string;
}) {
  const t = await getTranslations("leaderboards.companyBreakdown");

  const sourceLabel = (source: string) =>
    source === "company_hosting" ? t("source.hosting") : source === "company_attendance_pct" ? t("source.attendance") : t("source.presenting");

  return (
    <section id="company-breakdown" aria-labelledby="company-breakdown-heading" className="flex flex-col gap-5">
      <SectionHeader id="company-breakdown-heading" title={t("heading")} />
      <p className="max-w-prose text-body text-fg-muted">{t.rich("intro", { company: breakdown.companyName, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
      <Stat label={t("balanceLabel")} value={formatNumber(breakdown.totalPoints)} className="max-w-xs" />

      <div>
        <h3 className="text-label text-fg-heading">{t("catalogue.heading")}</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {breakdown.catalogue
            .filter((entry) => entry.enabled)
            .map((entry) => (
              <li key={entry.actionKey} className="rounded-card border border-edge bg-surface px-4 py-3 text-body-sm text-fg-body">
                <p className="text-fg-heading">
                  <bdi>{entry.reasonAr}</bdi>
                </p>
                {entry.points != null ? (
                  <p className="mt-1 text-fg-muted">{t("catalogue.flat", { count: entry.points, value: formatNumber(entry.points) })}</p>
                ) : entry.pointsPerPercent != null && entry.capPoints != null && entry.minActiveMembers != null ? (
                  <ul className="mt-1 flex flex-col gap-0.5 text-fg-muted">
                    <li>{t("catalogue.perPercent", { count: Math.round(entry.pointsPerPercent), value: formatNumber(entry.pointsPerPercent) })}</li>
                    <li>{t("catalogue.cap", { count: entry.capPoints, value: formatNumber(entry.capPoints) })}</li>
                    <li>{t("catalogue.min", { count: entry.minActiveMembers, value: formatNumber(entry.minActiveMembers) })}</li>
                  </ul>
                ) : null}
              </li>
            ))}
        </ul>
      </div>

      {breakdown.rows.length === 0 ? (
        <p className="text-body text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {breakdown.rows.map((row) => (
            <li key={row.id} className="rounded-card border border-edge bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body text-fg-heading">{sourceLabel(row.source)}</p>
                <p className="text-label text-fg-heading">
                  {/* `dir="ltr"`: a ledger amount may be negative, and digits
                      with their sign read left to right in any surrounding
                      text — pinned, not left to the isolate's own resolution,
                      which put the «-» after the digits on `me/points` (bd517f6). */}
                  <bdi dir="ltr">{formatNumber(row.amount)}</bdi>
                </p>
              </div>
              <p className="mt-1 text-body-sm text-fg-muted">
                {row.sessionTitle ? (
                  <>
                    <bdi>{row.sessionTitle}</bdi>
                    {" · "}
                  </>
                ) : null}
                <bdi>{formatDateTime(row.occurredAt, timeZone, locale)}</bdi>
              </p>
              {row.meta?.percent != null ? (
                <p className="mt-1 text-body-sm text-fg-muted">
                  {row.source === "company_presenting_pct"
                    ? t.rich("meta.presenting", {
                        presenting: formatNumber(row.meta.presenting ?? 0),
                        active: formatNumber(row.meta.active_members ?? 0),
                        percent: formatNumber(row.meta.percent),
                        bdi: (chunks) => <bdi>{chunks}</bdi>,
                      })
                    : t.rich("meta.attended", {
                        attended: formatNumber(row.meta.attended ?? 0),
                        active: formatNumber(row.meta.active_members ?? 0),
                        percent: formatNumber(row.meta.percent),
                        bdi: (chunks) => <bdi>{chunks}</bdi>,
                      })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
