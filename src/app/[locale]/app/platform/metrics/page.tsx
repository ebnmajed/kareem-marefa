import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { AlertCircleIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { formatNumber } from "@/components/sessions/numerals";
import { getJobHealth, getPlatformTotals, listOrgs, listPlatformAlerts } from "@/lib/dal/platform";
import { AlertsTable, JobsTable, OrgMetricsTable } from "./metrics-tables";

// SCR-084 · /app/platform/metrics — REQ-ADM-003, REQ-NFR-016, REQ-UIX-118. Written for wave 26 from
// `PlatformMetrics.dc.html` (`DEC-208`: deleted first); what it kept is `docs/plan/notes/platform.md` W26.2.5.
//
// The board's `h1` with «أعداد فقط · لا محتوى», six `stat`s and the per-org table — then, below what the board draws,
// the alerts and job health, which `REQ-ADM-003` names («job health, error rates») and the console's home links to
// (`#jobs`). ★ ONLY COUNTS THAT EXIST (DEC-251, Q5): the board's «جلسة هذا الربع», «معدّل الحضور», «التصديرات» and
// «الجاهزية 30 يومًا» have no function behind them — nothing measures uptime at all — so they are not drawn; the
// sessions are all-time and the sixth `stat` is the open break-glass sessions, which `platform_totals` counts.
//
// ★ AGGREGATE ONLY, enforced upstream: the totals and the per-org rows come from two views whose select lists a test
// pins, the alerts from `platform_alerts()`, whose `detail` keys another pins. A failed alert read is SAID, never
// eight quiet rows.

export default async function PlatformMetricsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [alerts, totals, jobs, orgs, t] = await Promise.all([
    listPlatformAlerts(locale),
    getPlatformTotals(locale),
    getJobHealth(locale),
    listOrgs(locale),
    getTranslations("platform"),
  ]);
  const fired = alerts?.filter((a) => a.fired).length ?? 0;

  const STATS = [
    ["statActiveOrgs", totals?.activeOrgs ?? 0],
    ["statMembers", totals?.members ?? 0],
    ["statSessions", totals?.sessions ?? 0],
    ["statActiveMembers", totals?.activeMembers ?? 0],
    ["statCertificates", totals?.certificates ?? 0],
    ["statImpersonations", totals?.activeImpersonations ?? 0],
  ] as const;

  return (
    <>
      <PageHeader inlineActions title={t("metrics.title")} actions={<Badge tone="neutral">{t("metrics.countsOnly")}</Badge>} />

      <section aria-label={t("metrics.totalsTitle")} className="mt-6">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STATS.map(([key, value]) => (
            <li key={key}>
              <Stat label={t(`metrics.${key}`)} value={formatNumber(value)} className="h-full" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="per-org" className="mt-8">
        <SectionHeader as="h2" id="per-org" title={t("metrics.perOrgTitle")} count={orgs.length} />
        <div className="mt-3">
          <OrgMetricsTable orgs={orgs} />
        </div>
      </section>

      <section aria-labelledby="alerts" className="mt-10 border-t border-edge pt-8">
        <SectionHeader as="h2" id="alerts" title={t("metrics.alertsTitle")} count={fired > 0 ? fired : undefined} />
        <div className="mt-3">
          {alerts === null ? (
            <Panel tone="error">
              <p className="flex items-start gap-2 text-body text-fg-heading">
                <AlertCircleIcon className="mt-1 text-error" />
                <span>{t("home.alertsUnavailable")}</span>
              </p>
            </Panel>
          ) : (
            <AlertsTable alerts={alerts} />
          )}
        </div>
      </section>

      <section id="jobs" aria-labelledby="jobs-title" className="mt-10 scroll-mt-20 border-t border-edge pt-8">
        <SectionHeader as="h2" id="jobs-title" title={t("metrics.jobsTitle")} />
        <div className="mt-3">
          <JobsTable jobs={jobs} />
        </div>
      </section>
    </>
  );
}
