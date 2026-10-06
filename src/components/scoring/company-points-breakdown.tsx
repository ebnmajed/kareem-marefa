import { getTranslations } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { signedFigure } from "@/components/scoring/points-ledger";
import { LedgerRow } from "@/components/ui/ledger-row";
import type { CompanyPointsBreakdown } from "@/lib/dal/leaderboards";

// «كيف حصلت شركتك على نقاطها» — SCR-028's second half (`Companies.dc.html`, `M10c.md` §8; wave 20, REQ-UIX-079,
// REQ-PTS-003 extended to the company — `notes/scoring.md` «Company points rules»). Written from the artboard after the
// old file was deleted (DEC-208); scoring's for the wave, `sessions'` again after it.
//
// The reader's OWN company only — there is no browsing of another company's ledger, by design. Its balance from the
// company rules, with the company in `<bdi>`; each row of `company_points_ledger` as a signed line (`ledger-row`), its
// reason and its numbers in `<bdi>`; then what earns a company points, read live. A member with no company sees «بلا
// شركة» in place of the breakdown — ★ wave 27 (DEC-255 §4, REQ-PRF-012): never a way to choose one, a member does not.
// ★ One row per LEDGER row, as before: the artboard draws one per source with an aggregate, but a percentage is
// per session and has no honest sum (scoring's plan, D44 — not ruled, so the ledger's own rows stay).

export async function CompanyPointsBreakdownSection({ breakdown, locale, timeZone }: { breakdown: CompanyPointsBreakdown | null; locale: string; timeZone: string }) {
  const t = await getTranslations("leaderboards.companyBreakdown");

  if (!breakdown) {
    return (
      <section id="company-breakdown" aria-labelledby="company-breakdown-heading" className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4">
        <h2 id="company-breakdown-heading" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("heading")}
        </h2>
        <p className="text-body text-fg-muted">{t("noCompany")}</p>
      </section>
    );
  }

  const sourceLabel = (source: string) =>
    source === "reversal" ? t("source.reversal") : source === "company_hosting" ? t("source.hosting") : source === "company_attendance_pct" ? t("source.attendance") : t("source.presenting");
  const enabled = breakdown.catalogue.filter((entry) => entry.enabled);

  return (
    <section id="company-breakdown" aria-labelledby="company-breakdown-heading" className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="company-breakdown-heading" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("heading")}
        </h2>
        <p className="text-caption text-fg-muted">
          {t("balanceLabel")}{" "}
          <b className="text-fg-heading">
            <bdi>{breakdown.companyName}</bdi> ·{" "}
            <bdi dir="ltr">{formatNumber(breakdown.totalPoints)}</bdi>
          </b>
        </p>
      </div>

      {breakdown.rows.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {breakdown.rows.map((row) => {
            const meta = row.meta?.percent != null
              ? row.source === "company_presenting_pct"
                ? t.rich("meta.presenting", { presenting: formatNumber(row.meta.presenting ?? 0), active: formatNumber(row.meta.active_members ?? 0), percent: formatNumber(row.meta.percent), bdi: (c) => <bdi>{c}</bdi> })
                : t.rich("meta.attended", { attended: formatNumber(row.meta.attended ?? 0), active: formatNumber(row.meta.active_members ?? 0), percent: formatNumber(row.meta.percent), bdi: (c) => <bdi>{c}</bdi> })
              : null;
            return (
              <LedgerRow
                key={row.id}
                value={row.amount}
                figure={signedFigure(row.amount)}
                figureLabel={formatNumber(row.amount)}
                title={sourceLabel(row.source)}
                meta={
                  <>
                    {/* ★ 0215: a reversal says why — «حُذفت الفعالية» or the admin's reason — its event may be gone. */}
                    {row.source === "reversal" ? (
                      <>
                        <bdi>{row.reason}</bdi>
                        {" · "}
                      </>
                    ) : null}
                    {row.sessionTitle ? (
                      <>
                        <bdi>{row.sessionTitle}</bdi>
                        {" · "}
                      </>
                    ) : null}
                    <bdi>{formatDateTime(row.occurredAt, timeZone, locale)}</bdi>
                    {meta ? (
                      <>
                        {" · "}
                        {meta}
                      </>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      {enabled.length > 0 ? (
        <div id="company-catalogue" className="flex flex-col gap-1.5 border-t border-edge pt-3">
          <h3 className="text-label text-fg-heading">{t("catalogue.heading")}</h3>
          <ul className="flex flex-col gap-1 text-body-sm text-fg-muted">
            {enabled.map((entry) => (
              <li key={entry.actionKey}>
                <bdi className="font-bold text-fg-body">{entry.reasonAr}</bdi>
                {" — "}
                {entry.points != null
                  ? t("catalogue.flat", { count: entry.points, value: formatNumber(entry.points) })
                  : entry.pointsPerPercent != null && entry.capPoints != null && entry.minActiveMembers != null
                    ? `${t("catalogue.perPercent", { count: Math.round(entry.pointsPerPercent), value: formatNumber(entry.pointsPerPercent) })} · ${t("catalogue.cap", { count: entry.capPoints, value: formatNumber(entry.capPoints) })} · ${t("catalogue.min", { count: entry.minActiveMembers, value: formatNumber(entry.minActiveMembers) })}`
                    : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
