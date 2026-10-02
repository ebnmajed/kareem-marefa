import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AttentionTiles } from "@/components/admin/dashboard/attention-tiles";
import { FigureTiles, type Figure } from "@/components/admin/dashboard/figure-tiles";
import { PipelineBar, type PipelineSegment } from "@/components/admin/dashboard/pipeline-bar";
import { TopLists } from "@/components/admin/dashboard/top-lists";
import { UpcomingTable } from "@/components/admin/dashboard/upcoming-table";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAttention, getAdminDashboardData, type AttentionItem } from "@/lib/dal/admin-dashboard";

// SCR-040 · /app/admin — the org dashboard (`REQ-ADM-004`, `REQ-UIX-086`),
// written from `AdminDashboard.dc.html` (wave 21, `DEC-208`: deleted first).
// The job (`DEC-227` §0.1): an admin sees what needs their attention and
// reaches it in ONE move — each tile is the link to the queue it counts,
// narrowed to exactly what it counted. Then the month's six figures, the
// pipeline, the next sessions and the three top lists; every figure a link to
// the list behind it.
//
// Admin only. A moderator and a member get the page-level `notFound()` — the
// streamed contract, 200 with `noindex` (`DEC-134`, `DEC-228` §3.1); the
// layout never gates. The page renders nothing of the console frame: its `h1`
// row and its content.

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [data, attention, t, ts] = await Promise.all([
    getAdminDashboardData(locale),
    getAdminAttention(locale),
    getTranslations("admin.dashboard"),
    getTranslations("admin.sessions"),
  ]);
  if (data === null || attention === null) notFound();

  const num = (n: number) => formatNumber(n);
  const monthLabel = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${data.month}-15T12:00:00Z`));
  const inMonth = `/app/admin/sessions?month=${data.month}`;

  const attentionLabel: Record<AttentionItem["queue"], string> = {
    proposals: t("attention.proposals"),
    unscheduledSessions: t("attention.sessions"),
    photoReports: t("attention.photoReports"),
    commentReports: t("attention.commentReports"),
  };

  const rate = data.attendanceRate === null ? null : Math.round(data.attendanceRate * 100);
  const figures: Figure[] = [
    { key: "sessions", label: t("sessionsThisMonth"), value: num(data.sessionsThisMonth), href: inMonth },
    { key: "rsvps", label: t("rsvpsConfirmed"), value: num(data.rsvpsConfirmed), href: inMonth },
    { key: "checkIns", label: t("checkInsTotal"), value: num(data.checkInsTotal), href: inMonth },
    { key: "rate", label: t("attendanceRateLabel"), value: rate === null ? ts("noValue") : t("attendanceRateValue", { value: num(rate) }), href: inMonth },
    { key: "members", label: t("activeMembersTitle"), value: num(data.activeMembers), href: "/app/admin/members" },
    { key: "points", label: t("pointsIssuedTitle"), value: num(data.pointsIssued), href: "/app/admin/scoring" },
  ];

  // `sessions'` queue URLs (its note, W21.10): the bare route is «awaiting a decision» — submitted and in review —
  // and `?state=changes|approved|all` the others. Draft and rejected have no queue of their own, so they open all.
  const p = data.proposalPipeline;
  const segments: PipelineSegment[] = [
    { key: "draft", label: t("pipeline.draft"), count: p.draft, fill: "bg-edge-strong", href: "/app/admin/proposals?state=all" },
    { key: "submitted", label: t("pipeline.submitted"), count: p.submitted, fill: "bg-fg-muted", href: "/app/admin/proposals" },
    { key: "inReview", label: t("pipeline.inReview"), count: p.inReview, fill: "bg-fg-body", href: "/app/admin/proposals" },
    { key: "changesRequested", label: t("pipeline.changesRequested"), count: p.changesRequested, fill: "bg-signal", href: "/app/admin/proposals?state=changes" },
    { key: "approved", label: t("pipeline.approved"), count: p.approved, fill: "bg-accent", href: "/app/admin/proposals?state=approved" },
    { key: "rejected", label: t("pipeline.rejected"), count: p.rejected, fill: "bg-edge", href: "/app/admin/proposals?state=all" },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <p className="text-label text-fg-muted">
            <bdi>{monthLabel}</bdi>
          </p>
        }
      />

      <section aria-labelledby="attention-heading" className="mt-6">
        <h2 id="attention-heading" className="text-label text-fg-heading">
          {t("attention.title")}
        </h2>
        <div className="mt-3">
          {attention.total === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("attention.empty")}</p>
          ) : (
            <AttentionTiles
              items={attention.items}
              labelFor={(item) => attentionLabel[item.queue]}
              sinceFor={(item) => (item.oldestAgeDays === null ? null : t("attention.oldestSince", { count: item.oldestAgeDays, value: num(item.oldestAgeDays) }))}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="overview-heading" className="mt-4">
        <h2 id="overview-heading" className="sr-only">
          {t("overviewTitle")}
        </h2>
        <FigureTiles figures={figures} />
      </section>

      <div className="mt-4">
        <PipelineBar title={t("pipelineTitle")} segments={segments} countLabel={(s) => t("pipelineCount", { value: num(s.count), label: s.label })} />
      </div>

      <section aria-labelledby="upcoming-heading" className="mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="upcoming-heading" className="text-label text-fg-heading">
            {t("upcoming.title")}
          </h2>
          <Link href="/app/admin/sessions" className="text-caption text-fg-muted hover:text-fg-heading hover:underline">
            {t("upcoming.all")}
          </Link>
        </div>
        {/* The artboard sets the table in a rounded card at a desk; under `md` the rows are
            `data-table`'s own cards, so the frame would be a card around cards. */}
        <div className="mt-3 md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1">
          <UpcomingTable rows={data.upcoming} timeZone={data.timeZone} locale={locale} />
        </div>
      </section>

      <div className="mt-4">
        <TopLists
          emptyLabel={t("topEmpty")}
          lists={[
            { id: "top-presenters", title: t("topPresentersTitle"), rows: data.topPresenters, hrefFor: (row) => `/app/members/${row.id}` },
            { id: "top-categories", title: t("topCategoriesTitle"), rows: data.topCategories, hrefFor: (row) => `/app/admin/sessions?category=${row.id}` },
            { id: "top-companies", title: t("topCompaniesTitle"), rows: data.topCompanies, hrefFor: () => "/app/admin/companies" },
          ]}
        />
      </div>
    </>
  );
}
