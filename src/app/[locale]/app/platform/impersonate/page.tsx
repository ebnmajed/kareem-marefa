import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { formatDateTime, formatTime } from "@/components/sessions/numerals";
import { stopImpersonationAction } from "@/components/platform/actions";
import { StopImpersonationControl } from "@/components/platform/stop-control";
import type { Locale } from "@/i18n/routing";
import { listMyImpersonations, listOrgs } from "@/lib/dal/platform";
import { startImpersonationAction } from "./actions";
import { HistoryTable } from "./history-table";
import { ImpersonateForm } from "./impersonate-form";

// SCR-085 · /app/platform/impersonate ★ — REQ-ADM-002, REQ-ADM-019, DEC-014,
// onto the system for wave 8 (`docs/plan/notes/platform.md` W8.8).
//
// ★ The screen states the consequence BEFORE anything else, because `09` §6
// asks it to and because it is true: you cannot look at an org's data without
// the org knowing. It also says the one thing about the grant that is easy to
// leave unsaid (DEC-148, C4): an expired session's access can outlive it by up
// to one token lifetime.
//
// The three states: none active (the form), active (the panel with THE stop
// control — the same one the banner carries, so stopping always takes the org
// off the token; the plain form that stood here once did not, notes F1), and
// expired (said at the top for an hour, and on every history row after).
//
// The history is the CALLER'S OWN sessions (`platform_impersonations()` filters
// on `auth.uid()`). A super admin auditing another is `platform_audit()`.

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export default async function ImpersonatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, sessions, t] = await Promise.all([
    listOrgs(locale),
    listMyImpersonations(locale),
    getTranslations("platform.impersonate"),
  ]);
  // `isActive` and `endedBy` are decided in the DAL: reading the clock during
  // render is an impure call, and the answer belongs beside the row.
  const active = sessions.find((s) => s.isActive) ?? null;
  const latest = sessions[0] ?? null;
  const recentlyExpired = !active && latest?.endedBy === "expired" && latest.endedRecently ? latest : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("honest")} />
      <Panel tone="info" className="mt-6 max-w-3xl">
        <p className="flex items-start gap-2 text-body-sm text-fg-body">
          <InfoIcon className="mt-1 text-fg-muted" />
          <span>{t("tokenTail")}</span>
        </p>
      </Panel>

      {active ? (
        <section aria-labelledby="active" className="mt-10 max-w-3xl">
          <Panel tone="live" className="p-5">
            <SectionHeader as="h2" id="active" title={t("activeTitle")} description={t("activeNote")} />
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-caption text-fg-muted">{t("orgColumn")}</dt>
                <dd className="mt-0.5 text-label text-fg-heading">
                  <bdi>{active.orgName}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-fg-muted">{t("expiresAt")}</dt>
                <dd className="mt-0.5 text-body text-fg-heading">
                  <bdi>{formatTime(active.expiresAt, PLATFORM_TIME_ZONE, locale)}</bdi>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-caption text-fg-muted">{t("reasonColumn")}</dt>
                <dd className="mt-0.5 text-body text-fg-body">
                  <bdi>{active.reason}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-fg-muted">{t("startedAt")}</dt>
                <dd className="mt-0.5 text-body-sm text-fg-body">
                  <bdi>{formatDateTime(active.startedAt, PLATFORM_TIME_ZONE, locale)}</bdi>
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <StopImpersonationControl sessionId={active.id} stop={stopImpersonationAction.bind(null, locale as Locale)} />
            </div>
          </Panel>
        </section>
      ) : (
        <section aria-labelledby="start" className="mt-10">
          <SectionHeader as="h2" id="start" title={t("startTitle")} description={t("intro")} />
          {recentlyExpired ? (
            <Panel tone="ended" className="mt-4 max-w-xl">
              <p className="text-body-sm text-fg-body">
                {t.rich("expiredRecently", {
                  org: recentlyExpired.orgName,
                  time: formatTime(recentlyExpired.expiresAt, PLATFORM_TIME_ZONE, locale),
                  bdi: (c) => <bdi>{c}</bdi>,
                })}
              </p>
            </Panel>
          ) : null}
          <div className="mt-6">
            <ImpersonateForm orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} action={startImpersonationAction.bind(null, locale as Locale)} />
          </div>
        </section>
      )}

      <section aria-labelledby="history" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="history" title={t("historyTitle")} count={sessions.length} />
        <div className="mt-4">
          <HistoryTable sessions={sessions} locale={locale} />
        </div>
      </section>
    </>
  );
}
