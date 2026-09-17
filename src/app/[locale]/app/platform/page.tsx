import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { describeAlert } from "@/components/platform/alert-copy";
import { formatNumber } from "@/components/sessions/numerals";
import { getPlatformTotals, listPlatformAlerts } from "@/lib/dal/platform";

// `/app/platform` — the console's home. REQ-ADM-001, REQ-ADM-003, DEC-147
// (`docs/plan/notes/platform.md` W8.2).
//
// ★ IT RENDERS; IT NO LONGER REDIRECTS. Until wave 8 this was a bare redirect to
// the org list, and a page that imports nothing can never reach the system — so
// the console's root is a real screen, and the rail has a home to mark current.
//
// ★ AGGREGATE ONLY, like everything in the console. Two reads: the platform
// totals (counts) and `11` §3.2's alerts through `platform_alerts()` — the
// worker's own readings, so a threshold is never re-derived here. What needs
// attention is exactly what the alerting would page for; everything else is a
// number that links to the screen it summarises.
//
// ★ One primary action per view (`16` §3 principle 2): «مؤسسة جديدة». The
// all-clear state is a quiet panel with a link, not an empty state whose own
// primary button would make two.

export default async function PlatformHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [alerts, totals, t] = await Promise.all([
    listPlatformAlerts(locale),
    getPlatformTotals(locale),
    getTranslations("platform"),
  ]);
  const fired = alerts?.filter((a) => a.fired) ?? [];

  const STATS = [
    { key: "activeOrgs", value: totals?.activeOrgs ?? 0, href: "/app/platform/orgs" },
    { key: "activeMembers", value: totals?.activeMembers ?? 0, href: "/app/platform/metrics" },
    { key: "sessions", value: totals?.sessions ?? 0, href: "/app/platform/metrics" },
    { key: "activeImpersonations", value: totals?.activeImpersonations ?? 0, href: "/app/platform/impersonate" },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("home.title")}
        description={t("shell.note")}
        actions={
          <ButtonLink href="/app/platform/orgs/new" size="md">
            {t("orgs.newLink")}
          </ButtonLink>
        }
      />

      <section aria-labelledby="attention" className="mt-10">
        {/* A count beside the heading only when something is firing: a bare «0»
            next to «لا شيء يحتاج انتباهك» says the same thing twice (sync 2). */}
        <SectionHeader as="h2" id="attention" title={t("home.attentionTitle")} count={fired.length > 0 ? fired.length : undefined} />
        {alerts === null ? (
          <Panel tone="error" className="mt-4">
            <p className="flex items-start gap-2 text-body text-fg-heading">
              <AlertCircleIcon className="mt-1 text-error" />
              <span>{t("home.alertsUnavailable")}</span>
            </p>
          </Panel>
        ) : fired.length === 0 ? (
          <Panel className="mt-4">
            <p className="flex items-start gap-2 text-body text-fg-body">
              <CheckCircleIcon className="mt-1 text-success" />
              <span>{t("home.attentionNone")}</span>
            </p>
            <p className="mt-2">
              <Link href="/app/platform/metrics" className="text-label text-fg-heading underline underline-offset-4">
                {t("home.viewMetrics")}
              </Link>
            </p>
          </Panel>
        ) : (
          <ul className="mt-4 space-y-3">
            {fired.map((reading) => {
              const { title, detail } = describeAlert(t, reading);
              return (
                <li key={reading.alert}>
                  <Panel tone="error">
                    <p className="flex items-start gap-2 text-label text-fg-heading">
                      <AlertCircleIcon className="mt-0.5 text-error" />
                      <span>{title}</span>
                    </p>
                    <p className="mt-1 text-body-sm text-fg-body">{detail}</p>
                    <p className="mt-2">
                      <Link href="/app/platform/metrics" className="text-label text-fg-heading underline underline-offset-4">
                        {t("home.viewMetrics")}
                      </Link>
                    </p>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="numbers" className="mt-12">
        <SectionHeader as="h2" id="numbers" title={t("home.numbersTitle")} />
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((stat) => (
            <li key={stat.key}>
              <Stat label={t(`metrics.${stat.key}`)} value={formatNumber(stat.value)} href={stat.href} className="h-full" />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
