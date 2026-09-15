import { getTranslations } from "next-intl/server";
import { formatDateTime, formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import type { CompanyPointsBreakdown } from "@/lib/dal/leaderboards";

// SCR-028's extra half (post-launch — docs/plan/notes/scoring.md "Company
// points rules"): "why does my company hold the points it holds" — the
// same explainability REQ-PTS-003 already gives a member over their own
// history, extended to their own company. Shown only to a member whose
// profile has a company (REQ-PRF-001 requires one before RSVP/proposal, so
// this is every active member sooner or later); there is no "browse other
// companies' ledgers" here — company_points_ledger's own RLS is org-wide,
// this screen just never asks for anyone but "yours".
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
  const numerals: NumeralSystem = breakdown.numerals;

  const sourceLabel = (source: string) =>
    source === "company_hosting" ? t("source.hosting") : source === "company_attendance_pct" ? t("source.attendance") : t("source.presenting");

  return (
    <section id="company-breakdown" aria-labelledby="company-breakdown-heading" className="mt-12">
      <h2 id="company-breakdown-heading" className="text-h2 text-fg-heading">
        {t("heading")}
      </h2>
      <p className="mt-2 text-body text-fg-muted">
        {t.rich("intro", { company: breakdown.companyName, bdi: (chunks) => <bdi>{chunks}</bdi> })}
      </p>
      <p className="mt-2 text-body text-fg-heading">
        {t("balance", { count: breakdown.totalPoints, value: formatNumber(breakdown.totalPoints, numerals) })}
      </p>

      <div className="mt-6">
        <h3 className="text-label text-fg-heading">{t("catalogue.heading")}</h3>
        <ul className="mt-3 space-y-2">
          {breakdown.catalogue
            .filter((entry) => entry.enabled)
            .map((entry) => (
              <li key={entry.actionKey} className="rounded-field border border-edge p-3 text-body-sm text-fg-muted">
                <bdi>{entry.reasonAr}</bdi>
                {entry.points != null ? (
                  <span> — {t("catalogue.flat", { count: entry.points, value: formatNumber(entry.points, numerals) })}</span>
                ) : entry.pointsPerPercent != null && entry.capPoints != null && entry.minActiveMembers != null ? (
                  <span className="flex flex-wrap gap-x-2">
                    <span>
                      {" — "}
                      {t("catalogue.perPercent", { count: Math.round(entry.pointsPerPercent), value: formatNumber(entry.pointsPerPercent, numerals) })}
                    </span>
                    <span>{t("catalogue.cap", { count: entry.capPoints, value: formatNumber(entry.capPoints, numerals) })}</span>
                    <span>{t("catalogue.min", { count: entry.minActiveMembers, value: formatNumber(entry.minActiveMembers, numerals) })}</span>
                  </span>
                ) : null}
              </li>
            ))}
        </ul>
      </div>

      {breakdown.rows.length === 0 ? (
        <p className="mt-6 text-body text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {breakdown.rows.map((row) => (
            <li key={row.id} className="rounded-field border border-edge p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body text-fg-heading">{sourceLabel(row.source)}</p>
                <p className="text-body text-fg-heading">
                  <bdi>{formatNumber(row.amount, numerals)}</bdi>
                </p>
              </div>
              <p className="mt-1 text-body-sm text-fg-muted">
                {row.sessionTitle ? <bdi>{row.sessionTitle}</bdi> : null}
                {row.sessionTitle ? " — " : null}
                {formatDateTime(row.occurredAt, numerals, timeZone, locale)}
              </p>
              {row.meta?.percent != null ? (
                <p className="mt-1 text-body-sm text-fg-muted">
                  {row.source === "company_presenting_pct"
                    ? t.rich("meta.presenting", {
                        presenting: formatNumber(row.meta.presenting ?? 0, numerals),
                        active: formatNumber(row.meta.active_members ?? 0, numerals),
                        percent: formatNumber(row.meta.percent, numerals),
                        bdi: (chunks) => <bdi>{chunks}</bdi>,
                      })
                    : t.rich("meta.attended", {
                        attended: formatNumber(row.meta.attended ?? 0, numerals),
                        active: formatNumber(row.meta.active_members ?? 0, numerals),
                        percent: formatNumber(row.meta.percent, numerals),
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
