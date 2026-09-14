import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";
import { getAdminDashboardData, type TopRow } from "@/lib/dal/admin-dashboard";

/** A ranked "top N" list — module-level so it is not re-created on every
 *  render (react-hooks/static-components). */
function TopList({ rows, numerals, emptyLabel, linkFor }: { rows: TopRow[]; numerals: NumeralSystem; emptyLabel: string; linkFor?: (row: TopRow) => string }) {
  if (rows.length === 0) return <p className="mt-2 text-body-sm text-fg-muted">{emptyLabel}</p>;
  return (
    <ol className="mt-3 space-y-2">
      {rows.map((row) => {
        const content = (
          <>
            <bdi>{row.label}</bdi>
            <span className="ms-2 text-fg-muted">{formatNumber(row.count, numerals)}</span>
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

// SCR-040 · /app/admin — the org dashboard (REQ-ADM-004, D60).
//
// Admin only, same 404-not-message pattern the inherited proposals/venues
// screens use: `getAdminDashboardData()` returns null for a moderator, this
// page never learns why.
//
// "Active members" links forward to `/app/admin/members` — the next story
// on this track's list (console.md) — which does not exist yet and 404s
// until it lands. "Busiest categories" and "most active companies" now
// link to real screens (SCR-047/048, bundle 2). Every other figure links
// to a screen that already existed at bundle 1. REQ-ADM-004's "every
// figure is clickable" is the acceptance criterion this note tracks.

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [data, t] = await Promise.all([getAdminDashboardData(locale), getTranslations("admin.dashboard")]);
  if (data === null) notFound();

  const num = (n: number) => formatNumber(n, data.numerals);

  const pipelineRows: { key: keyof typeof data.proposalPipeline; label: string }[] = [
    { key: "draft", label: t("pipeline.draft") },
    { key: "submitted", label: t("pipeline.submitted") },
    { key: "inReview", label: t("pipeline.inReview") },
    { key: "changesRequested", label: t("pipeline.changesRequested") },
    { key: "approved", label: t("pipeline.approved") },
    { key: "rejected", label: t("pipeline.rejected") },
  ];

  const attendanceRatePct = data.attendanceRate === null ? null : Math.round(data.attendanceRate * 100);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="pipeline" className="rounded-field border border-edge p-5">
          <h2 id="pipeline" className="text-h3 text-fg-heading">
            <Link href="/app/admin/proposals" className="hover:underline">
              {t("pipelineTitle")}
            </Link>
          </h2>
          <dl className="mt-3 space-y-2">
            {pipelineRows.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between text-body-sm">
                <dt className="text-fg-body">{row.label}</dt>
                <dd className="text-fg-heading">{num(data.proposalPipeline[row.key])}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="attendance" className="rounded-field border border-edge p-5">
          <h2 id="attendance" className="text-h3 text-fg-heading">
            <Link href="/app/admin/sessions" className="hover:underline">
              {t("attendanceTitle")}
            </Link>
          </h2>
          <dl className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between text-body-sm">
              <dt className="text-fg-body">{t("rsvpsConfirmed")}</dt>
              <dd className="text-fg-heading">{num(data.rsvpsConfirmed)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-body-sm">
              <dt className="text-fg-body">{t("checkInsTotal")}</dt>
              <dd className="text-fg-heading">{num(data.checkInsTotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-body-sm">
              <dt className="text-fg-body">{t("attendanceRateLabel")}</dt>
              <dd className="text-fg-heading">
                {attendanceRatePct === null ? <span className="text-fg-muted">{t("attendanceRateEmpty")}</span> : t("attendanceRateValue", { value: num(attendanceRatePct) })}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="active-members" className="rounded-field border border-edge p-5">
          <h2 id="active-members" className="text-h3 text-fg-heading">
            <Link href="/app/admin/members" className="hover:underline">
              {t("activeMembersTitle")}
            </Link>
          </h2>
          <p className="mt-3 text-h2 text-fg-heading">{num(data.activeMembers)}</p>
        </section>

        <section aria-labelledby="points-issued" className="rounded-field border border-edge p-5">
          <h2 id="points-issued" className="text-h3 text-fg-heading">
            <Link href="/app/admin/scoring" className="hover:underline">
              {t("pointsIssuedTitle")}
            </Link>
          </h2>
          <p className="mt-3 text-h2 text-fg-heading">{num(data.pointsIssued)}</p>
        </section>

        <section aria-labelledby="top-presenters" className="rounded-field border border-edge p-5">
          <h2 id="top-presenters" className="text-h3 text-fg-heading">
            {t("topPresentersTitle")}
          </h2>
          <TopList rows={data.topPresenters} numerals={data.numerals} emptyLabel={t("topEmpty")} linkFor={(row) => `/app/members/${row.id}`} />
        </section>

        <section aria-labelledby="top-categories" className="rounded-field border border-edge p-5">
          <h2 id="top-categories" className="text-h3 text-fg-heading">
            <Link href="/app/admin/categories" className="hover:underline">
              {t("topCategoriesTitle")}
            </Link>
          </h2>
          <TopList rows={data.topCategories} numerals={data.numerals} emptyLabel={t("topEmpty")} />
        </section>

        <section aria-labelledby="top-companies" className="rounded-field border border-edge p-5 md:col-span-2">
          <h2 id="top-companies" className="text-h3 text-fg-heading">
            <Link href="/app/admin/companies" className="hover:underline">
              {t("topCompaniesTitle")}
            </Link>
          </h2>
          <TopList rows={data.topCompanies} numerals={data.numerals} emptyLabel={t("topEmpty")} />
        </section>
      </div>
    </>
  );
}
