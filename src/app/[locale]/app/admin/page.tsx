import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircleIcon, AlertTriangleIcon, CalendarIcon, CheckCircleIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { getAdminDashboardData, type AttentionRow, type DashboardData, type TopRow } from "@/lib/dal/admin-dashboard";

/** A ranked "top N" list — module-level so it is not re-created on every
 *  render (react-hooks/static-components). */
function TopList({ rows, emptyLabel, linkFor }: { rows: TopRow[]; emptyLabel: string; linkFor?: (row: TopRow) => string }) {
  if (rows.length === 0) return <p className="mt-2 text-body-sm text-fg-muted">{emptyLabel}</p>;
  return (
    <ol className="mt-3 space-y-2">
      {rows.map((row) => {
        const content = (
          <>
            <bdi>{row.label}</bdi>
            <span className="ms-2 text-fg-muted">{formatNumber(row.count)}</span>
          </>
        );
        return (
          <li key={row.id} className="flex items-baseline justify-between text-body-sm text-fg-body">
            {linkFor ? (
              <Link href={linkFor(row)} className="hover:text-fg-heading hover:underline">
                {content}
              </Link>
            ) : (
              <span>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// SCR-040 · /app/admin — the org dashboard (REQ-ADM-004, D60), rebuilt onto
// the system for wave 6 (`16` §6.7, `DEC-112`, `DEC-130`). «يحتاج انتباهك»
// is new work — it did not exist on this screen before this wave — and is
// `REQ-ADM-010`'s own four queues (`docs/plan/notes/console.md`'s Wave 6 §3
// is the plan this implements, including why "job-queue depth" is NOT
// among them).
//
// Admin only, same 404-not-message pattern the inherited proposals/venues
// screens use: `getAdminDashboardData()` returns null for a moderator, this
// page never learns why.
//
// Every figure still links to a real screen (REQ-ADM-004's own acceptance
// criterion): proposals, sessions, scoring, categories/companies, members.

function AttentionRowItem({
  href,
  Icon,
  label,
  row,
  oldestSince,
  num,
}: {
  href: string;
  Icon: typeof CalendarIcon;
  label: string;
  row: AttentionRow;
  oldestSince: (row: AttentionRow) => string | null;
  num: (n: number) => string;
}) {
  const since = oldestSince(row);
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-field border border-edge p-4 transition-colors hover:bg-silver-100">
        <Icon aria-hidden className="shrink-0 text-[1.375rem] text-fg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-label text-fg-heading">
            <bdi>{label}</bdi>
          </span>
          {since ? <span className="block text-caption text-fg-muted">{since}</span> : null}
        </span>
        <span className="shrink-0 text-h3 text-fg-heading">{num(row.count)}</span>
      </Link>
    </li>
  );
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [data, t] = await Promise.all([getAdminDashboardData(locale), getTranslations("admin.dashboard")]);
  if (data === null) notFound();

  const num = (n: number) => formatNumber(n);
  const oldestSince = (row: AttentionRow) => (row.oldestAgeDays === null ? null : t("attention.oldestSince", { count: row.oldestAgeDays, value: num(row.oldestAgeDays) }));

  const pipelineRows: { key: keyof DashboardData["proposalPipeline"]; label: string }[] = [
    { key: "draft", label: t("pipeline.draft") },
    { key: "submitted", label: t("pipeline.submitted") },
    { key: "inReview", label: t("pipeline.inReview") },
    { key: "changesRequested", label: t("pipeline.changesRequested") },
    { key: "approved", label: t("pipeline.approved") },
    { key: "rejected", label: t("pipeline.rejected") },
  ];

  const attendanceRatePct = data.attendanceRate === null ? null : Math.round(data.attendanceRate * 100);

  const attentionTotal =
    data.attention.proposalsAwaitingDecision.count + data.attention.sessionsNotScheduled.count + data.attention.openPhotoReports.count + data.attention.openCommentReports.count;

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      <section aria-labelledby="attention-heading" className="mt-10">
        <SectionHeader as="h2" id="attention-heading" title={t("attention.title")} />
        <div className="mt-4">
          {attentionTotal === 0 ? (
            <EmptyState title={t("attention.empty")} action={{ label: t("attention.emptyAction"), href: "/app/admin/sessions" }} size="sm" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AttentionRowItem
                href="/app/admin/proposals"
                Icon={CheckCircleIcon}
                label={t("attention.proposals")}
                row={data.attention.proposalsAwaitingDecision}
                oldestSince={oldestSince}
                num={num}
              />
              <AttentionRowItem
                href="/app/admin/sessions"
                Icon={CalendarIcon}
                label={t("attention.sessions")}
                row={data.attention.sessionsNotScheduled}
                oldestSince={oldestSince}
                num={num}
              />
              <AttentionRowItem
                href="/app/admin/moderation/reports"
                Icon={AlertTriangleIcon}
                label={t("attention.photoReports")}
                row={data.attention.openPhotoReports}
                oldestSince={oldestSince}
                num={num}
              />
              <AttentionRowItem
                href="/app/admin/moderation/comments"
                Icon={AlertCircleIcon}
                label={t("attention.commentReports")}
                row={data.attention.openCommentReports}
                oldestSince={oldestSince}
                num={num}
              />
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="overview-heading" className="mt-12">
        <SectionHeader as="h2" id="overview-heading" title={t("overviewTitle")} />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={t("rsvpsConfirmed")} value={num(data.rsvpsConfirmed)} href="/app/admin/sessions" />
          <Stat label={t("checkInsTotal")} value={num(data.checkInsTotal)} href="/app/admin/sessions" />
          <Stat
            label={t("attendanceRateLabel")}
            value={attendanceRatePct === null ? t("attendanceRateEmpty") : t("attendanceRateValue", { value: num(attendanceRatePct) })}
            href="/app/admin/sessions"
          />
          <Stat label={t("activeMembersTitle")} value={num(data.activeMembers)} href="/app/admin/members" />
          <Stat label={t("pointsIssuedTitle")} value={num(data.pointsIssued)} href="/app/admin/scoring" />
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="pipeline-heading">
          <SectionHeader
            as="h3"
            id="pipeline-heading"
            title={t("pipelineTitle")}
            actions={
              <Link href="/app/admin/proposals" aria-label={`${t("viewList")} — ${t("pipelineTitle")}`} className="text-body-sm text-fg-heading underline underline-offset-4">
                {t("viewList")}
              </Link>
            }
          />
          <Panel className="mt-3">
            <dl className="space-y-2">
              {pipelineRows.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between text-body-sm">
                  <dt className="text-fg-body">{row.label}</dt>
                  <dd className="text-fg-heading">{num(data.proposalPipeline[row.key])}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </section>

        <section aria-labelledby="top-presenters-heading">
          <SectionHeader as="h3" id="top-presenters-heading" title={t("topPresentersTitle")} />
          <Panel className="mt-3">
            <TopList rows={data.topPresenters} emptyLabel={t("topEmpty")} linkFor={(row) => `/app/members/${row.id}`} />
          </Panel>
        </section>

        <section aria-labelledby="top-categories-heading">
          <SectionHeader
            as="h3"
            id="top-categories-heading"
            title={t("topCategoriesTitle")}
            actions={
              <Link
                href="/app/admin/categories"
                aria-label={`${t("viewList")} — ${t("topCategoriesTitle")}`}
                className="text-body-sm text-fg-heading underline underline-offset-4"
              >
                {t("viewList")}
              </Link>
            }
          />
          <Panel className="mt-3">
            <TopList rows={data.topCategories} emptyLabel={t("topEmpty")} />
          </Panel>
        </section>

        <section aria-labelledby="top-companies-heading">
          <SectionHeader
            as="h3"
            id="top-companies-heading"
            title={t("topCompaniesTitle")}
            actions={
              <Link
                href="/app/admin/companies"
                aria-label={`${t("viewList")} — ${t("topCompaniesTitle")}`}
                className="text-body-sm text-fg-heading underline underline-offset-4"
              >
                {t("viewList")}
              </Link>
            }
          />
          <Panel className="mt-3">
            <TopList rows={data.topCompanies} emptyLabel={t("topEmpty")} />
          </Panel>
        </section>
      </div>
    </>
  );
}
