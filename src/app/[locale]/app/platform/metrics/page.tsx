import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertCircleIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { formatNumber } from "@/components/sessions/numerals";
import { getJobHealth, getPlatformTotals, listOrgs, listPlatformAlerts } from "@/lib/dal/platform";
import { AlertsTable, JobsTable, OrgMetricsTable } from "./metrics-tables";

// SCR-084 · /app/platform/metrics — REQ-ADM-003, REQ-NFR-016 (the numbers; the
// transport is the lead's), onto the system for wave 8
// (`docs/plan/notes/platform.md` W8.7).
//
// ★ AGGREGATE ONLY, and that is enforced upstream of this file: the totals and
// the per-org rows come from two views whose select lists a test pins, and the
// alerts come from `platform_alerts()`, whose `detail` keys another test pins.
// No query behind this screen can name a member, a session or a piece of content.
//
// ★ «Error rates» (`REQ-ADM-003`) were missing until wave 8 (DEC-148, C2): the
// alerts section shows `11` §3.2's eight readings — the bounce rate, the
// consecutive render failures, the stalled queue and the rest — as the worker
// measures them, never re-derived here.
//
// When the alert read fails the page says so; it never shows eight quiet rows
// it did not read.

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
      <PageHeader title={t("metrics.title")} description={t("metrics.intro")} />

      <section aria-labelledby="alerts" className="mt-10">
        <SectionHeader as="h2" id="alerts" title={t("metrics.alertsTitle")} description={t("metrics.alertsIntro")} count={fired > 0 ? fired : undefined} />
        <div className="mt-4">
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

      <section aria-labelledby="totals" className="mt-12">
        <SectionHeader as="h2" id="totals" title={t("metrics.totalsTitle")} />
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TOTALS.map(([key, value]) => (
            <li key={key}>
              <Stat label={t(`metrics.${key}`)} value={formatNumber(value)} className="h-full" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="jobs" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="jobs" title={t("metrics.jobsTitle")} description={t("metrics.jobsIntro")} />
        <div className="mt-4">
          <JobsTable jobs={jobs} />
        </div>
      </section>

      <section aria-labelledby="per-org" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="per-org" title={t("metrics.perOrgTitle")} count={orgs.length} />
        <div className="mt-4">
          <OrgMetricsTable orgs={orgs} />
        </div>
      </section>
    </>
  );
}
