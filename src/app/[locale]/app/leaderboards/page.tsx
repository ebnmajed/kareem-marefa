import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime } from "@/components/sessions/numerals";
import { MemberBoard } from "@/components/scoring/member-board";
import { CompanyBoard } from "@/components/scoring/company-board";
import { CompanyPointsBreakdownSection } from "@/components/scoring/company-points-breakdown";
import { getCompanyPointsBreakdown, getLeaderboards } from "@/lib/dal/leaderboards";

// SCR-027 · /app/leaderboards — all-time, this month, and سباق الشركات
// (SCR-028) as sections of one page rather than a tab widget, same
// reasoning as SCR-026: at 390 px a tab strip costs a row of chrome for a
// screen where every section is short. `05` §6.1: all-time is live, with
// no period and no denominator to freeze; the other two read the latest
// snapshot, which the page marks as provisional or final rather than
// letting the number speak for a certainty it does not have.
export default async function LeaderboardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, boards, companyBreakdown] = await Promise.all([
    getTranslations("leaderboards"),
    getLeaderboards(locale),
    getCompanyPointsBreakdown(locale),
  ]);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>

      <nav aria-label={t("title")} className="mt-4 flex flex-wrap gap-4">
        <a href="#all-time" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.allTime")}
        </a>
        <a href="#monthly" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.monthly")}
        </a>
        <a href="#company" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.company")}
        </a>
        {companyBreakdown ? (
          <a href="#company-breakdown" className="text-label text-fg-heading underline underline-offset-4">
            {t("tabs.companyBreakdown")}
          </a>
        ) : null}
      </nav>

      <section id="all-time" aria-labelledby="all-time-heading" className="mt-10">
        <h2 id="all-time-heading" className="text-h2 text-fg-heading">
          {t("tabs.allTime")}
        </h2>
        <MemberBoard rows={boards.allTime} />
      </section>

      <section id="monthly" aria-labelledby="monthly-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="monthly-heading" className="text-h2 text-fg-heading">
            {t("tabs.monthly")}
          </h2>
          {boards.monthly ? (
            <span className="text-body-sm text-fg-muted">{boards.monthly.isFinal ? t("monthly.final") : t("monthly.provisional")}</span>
          ) : null}
        </div>
        <MemberBoard rows={boards.monthly?.rows ?? []} />
      </section>

      <section id="company" aria-labelledby="company-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="company-heading" className="text-h2 text-fg-heading">
            {t("tabs.company")}
          </h2>
          {boards.company ? (
            <span className="text-body-sm text-fg-muted">
              {boards.company.isFinal ? t("company.final") : t("company.provisional")} ·{" "}
              {formatDateTime(boards.company.takenAt, boards.timeZone, locale)}
            </span>
          ) : null}
        </div>
        <CompanyBoard rows={boards.company?.rows ?? []} metric={boards.companyMetric} />
      </section>

      {companyBreakdown ? <CompanyPointsBreakdownSection breakdown={companyBreakdown} locale={locale} timeZone={boards.timeZone} /> : null}
    </>
  );
}
