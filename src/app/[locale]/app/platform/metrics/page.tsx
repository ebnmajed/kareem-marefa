import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { getJobHealth, getPlatformTotals, listOrgs, PLATFORM_NUMERALS } from "@/lib/dal/platform";

// SCR-084 · /app/platform/metrics — REQ-ADM-003, REQ-NFR-016 (the numbers; the
// dashboards and the alerting are the lead's infra).
//
// ★ AGGREGATE ONLY, and that is enforced upstream of this file. Every number
// here comes from `platform_totals` / `platform_org_metrics`, two views whose
// select lists are counts plus an org's own name, slug and status — and
// `tests/rls/platform-schema.test.ts` pins those column lists against an
// allow-list, so a later session that adds a session title to the metrics
// breaks a test rather than a requirement.
//
// The one number worth reading is `oldest pending`: the LISTEN/NOTIFY
// degradation of `11` §1.2 leaves a queue that looks busy and healthy on
// every other metric while nothing moves (CLAUDE.md's fifth likely failure).

export default async function PlatformMetricsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [totals, jobs, orgs, t] = await Promise.all([
    getPlatformTotals(locale),
    getJobHealth(locale),
    listOrgs(locale),
    getTranslations("platform.metrics"),
  ]);
  const num = (n: number) => formatNumber(n, PLATFORM_NUMERALS);
  // Seconds below a minute, minutes above: a queue age of «٤٬٣٢٠ ثانية» is a
  // number nobody converts in their head.
  const age = (seconds: number) =>
    seconds < 60 ? t("seconds", { count: Math.round(seconds) }) : t("minutes", { count: Math.round(seconds / 60) });

  const TOTALS = [
    ["orgs", totals?.orgs ?? 0],
    ["activeOrgs", totals?.activeOrgs ?? 0],
    ["suspendedOrgs", totals?.suspendedOrgs ?? 0],
    ["members", totals?.members ?? 0],
    ["activeMembers", totals?.activeMembers ?? 0],
    ["sessions", totals?.sessions ?? 0],
    ["certificates", totals?.certificates ?? 0],
    ["activeImpersonations", totals?.activeImpersonations ?? 0],
  ] as const;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-3xl text-body text-fg-muted">{t("intro")}</p>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {TOTALS.map(([key, value]) => (
          <div key={key}>
            <dt className="text-body-sm text-fg-muted">{t(key)}</dt>
            <dd className="mt-1 text-h2 text-fg-heading">{num(value)}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="jobs" className="mt-12 border-t border-edge pt-8">
        <h2 id="jobs" className="text-h2 text-fg-heading">
          {t("jobsTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("jobsIntro")}</p>

        {jobs.length === 0 ? (
          <p className="mt-4 text-body text-fg-body">{t("jobsEmpty")}</p>
        ) : (
          // A table needs its own scroller and nothing else on the page does
          // (CLAUDE.md § i18n and RTL): four columns of numbers do not fit at
          // 390 px, and this is the one shape where a horizontal scroll is
          // the honest answer rather than a discovery problem.
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-xl border-collapse text-body">
              <thead>
                <tr className="border-b border-edge text-start">
                  <th scope="col" className="py-2 pe-4 text-start text-label text-fg-muted">
                    {t("jobTask")}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start text-label text-fg-muted">
                    {t("jobPending")}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start text-label text-fg-muted">
                    {t("jobFailed")}
                  </th>
                  <th scope="col" className="py-2 text-start text-label text-fg-muted">
                    {t("jobOldest")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.task} className="border-b border-edge">
                    {/* A task identifier is snake_case Latin in an Arabic
                        table: isolated so the underscores do not reorder. */}
                    <td className="py-3 pe-4 font-mono text-body-sm text-fg-heading">
                      <bdi dir="ltr">{job.task}</bdi>
                    </td>
                    <td className="py-3 pe-4 text-fg-body">{num(job.pending)}</td>
                    <td className="py-3 pe-4 text-fg-body">{num(job.failed)}</td>
                    <td className="py-3 text-fg-body">{age(job.oldestPendingSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="per-org" className="mt-12 border-t border-edge pt-8">
        <h2 id="per-org" className="text-h2 text-fg-heading">
          {t("perOrgTitle")}
        </h2>
        <ul className="mt-4 space-y-3">
          {orgs.map((org) => (
            <li key={org.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-field border border-edge px-4 py-3">
              <span className="text-label text-fg-heading">
                <bdi>{org.name}</bdi>
              </span>
              <span className="text-body-sm text-fg-muted">
                {t("activeMembers")} {num(org.activeMembers)}
              </span>
              <span className="text-body-sm text-fg-muted">
                {t("sessions")} {num(org.sessions)}
              </span>
              <span className="text-body-sm text-fg-muted">
                {t("certificates")} {num(org.certificates)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
