import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompanyBoard } from "@/components/scoring/company-board";
import { CompanyPointsBreakdownSection } from "@/components/scoring/company-points-breakdown";
import { MemberBoard } from "@/components/scoring/member-board";
import { formatDateTime } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs } from "@/components/ui/tabs";
import { getCompanyPointsBreakdown, getLeaderboards } from "@/lib/dal/leaderboards";

// SCR-027 · SCR-028 · /app/leaderboards — on the M9 system for wave 7
// (DEC-137; three tabs on one route, DEC-141 ruling 6).
//
// ★ THREE BOARDS AS LINKED TABS — `?board=all` (the default), `?board=month`,
// `?board=companies`. Each is a URL a member can share and the server renders
// on its own: nothing is hidden behind client state, and the tab bar is
// `ui/tabs` in its navigation mode (`TabItem.href`). `09`'s separate
// `/leaderboards/companies` is not created; the per-topic and seasonal boards
// are not this wave.
//
// `05` §6.1: all-time is live, with no period and no denominator to freeze;
// this month and the company race read the latest snapshot, which the page
// marks provisional or final rather than letting the number claim a certainty
// it does not have.

type Board = "all" | "month" | "companies";

function boardFrom(value: string | undefined): Board {
  return value === "month" || value === "companies" ? value : "all";
}

export default async function LeaderboardsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ board?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const board = boardFrom((await searchParams).board);

  const [t, boards, companyBreakdown] = await Promise.all([
    getTranslations("leaderboards"),
    getLeaderboards(locale),
    board === "companies" ? getCompanyPointsBreakdown(locale) : Promise.resolve(null),
  ]);

  const items = [
    { value: "all", label: t("tabs.allTime"), href: "/app/leaderboards" },
    { value: "month", label: t("tabs.monthly"), href: "/app/leaderboards?board=month" },
    { value: "companies", label: t("tabs.company"), href: "/app/leaderboards?board=companies" },
  ];

  const finality = (isFinal: boolean, provisional: string, final: string) => (
    <Badge tone={isFinal ? "success" : "info"} size="sm">
      {isFinal ? final : provisional}
    </Badge>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Tabs label={t("title")} value={board} items={items}>
        {board === "all" ? (
          <section id="all-time" aria-labelledby="all-time-heading" className="flex flex-col gap-4">
            <SectionHeader id="all-time-heading" title={t("tabs.allTime")} description={t("allTime.live")} />
            <MemberBoard rows={boards.allTime} />
          </section>
        ) : board === "month" ? (
          <section id="monthly" aria-labelledby="monthly-heading" className="flex flex-col gap-4">
            <SectionHeader
              id="monthly-heading"
              title={t("tabs.monthly")}
              actions={boards.monthly ? finality(boards.monthly.isFinal, t("monthly.provisional"), t("monthly.final")) : undefined}
            />
            <MemberBoard rows={boards.monthly?.rows ?? []} />
          </section>
        ) : (
          <div className="flex flex-col gap-12">
            <section id="company" aria-labelledby="company-heading" className="flex flex-col gap-4">
              <SectionHeader
                id="company-heading"
                title={t("tabs.company")}
                description={boards.company ? t.markup("company.takenAt", { date: formatDateTime(boards.company.takenAt, boards.timeZone, locale), bdi: (chunks) => chunks }) : undefined}
                actions={boards.company ? finality(boards.company.isFinal, t("company.provisional"), t("company.final")) : undefined}
              />
              <CompanyBoard rows={boards.company?.rows ?? []} metric={boards.companyMetric} />
            </section>
            {companyBreakdown ? <CompanyPointsBreakdownSection breakdown={companyBreakdown} locale={locale} timeZone={boards.timeZone} /> : null}
          </div>
        )}
      </Tabs>
    </div>
  );
}
