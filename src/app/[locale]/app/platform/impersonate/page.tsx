import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
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

// SCR-085 · /app/platform/impersonate ★ — REQ-ADM-002, REQ-ADM-019, DEC-014, DEC-054, REQ-UIX-118. Written for wave 26
// from `PlatformImpersonate.dc.html` (`DEC-208`: deleted first); what it kept is `docs/plan/notes/platform.md` W26.2.6.
//
// The board: the `h1` with «مسجَّل ومرئي للمؤسسة» — the consequence said before anything else, as `09` §6 asks: you
// cannot look at an org's data without the org knowing — the form at the inline start, «السجل» beside it.
//
// ★ CHANGED IN NOTHING (`DEC-054`, DEC-251 Q1, Q2). The form takes an org, a mandatory reason and a duration — NO
// member: `start_impersonation()` takes none and the token carries no `member_id`. The durations are today's five,
// one hour by default, drawn as the board's segmented row. The log is the CALLER'S OWN sessions
// (`platform_impersonations()` filters on `auth.uid()`), with each one's state and end, and «المدة» read from its
// own row.
//
// Kept, though the board draws only the form (I1, I2): the one-token-lifetime line (`DEC-148` C4, Q10); the three
// states — none active (the form), active (the live panel with THE stop control, the one the banner carries — so
// stopping always takes the org off the token, wave 8 F1), expired (said at the top for an hour).

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export default async function ImpersonatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, sessions, t] = await Promise.all([listOrgs(locale), listMyImpersonations(locale), getTranslations("platform.impersonate")]);
  // `isActive` and `endedBy` are decided in the DAL: reading the clock during render is an impure call.
  const active = sessions.find((s) => s.isActive) ?? null;
  const latest = sessions[0] ?? null;
  const recentlyExpired = !active && latest?.endedBy === "expired" && latest.endedRecently ? latest : null;

  return (
    <>
      <PageHeader inlineActions title={t("title")} actions={<Badge tone="live">{t("recordedBadge")}</Badge>} />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Panel tone="info">
            <p className="flex items-start gap-2 text-body-sm text-fg-body">
              <InfoIcon className="mt-1 text-fg-muted" />
              <span>{t("tokenTail")}</span>
            </p>
          </Panel>

          {active ? (
            <section aria-labelledby="active">
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
                  <StopImpersonationControl sessionId={active.id} stop={stopImpersonationAction.bind(null, locale as Locale)} className="w-full sm:w-auto" />
                </div>
              </Panel>
            </section>
          ) : (
            <section aria-label={t("startTitle")}>
              {recentlyExpired ? (
                <Panel tone="ended" className="mb-4">
                  <p className="text-body-sm text-fg-body">
                    {t.rich("expiredRecently", {
                      org: recentlyExpired.orgName,
                      time: formatTime(recentlyExpired.expiresAt, PLATFORM_TIME_ZONE, locale),
                      bdi: (c) => <bdi>{c}</bdi>,
                    })}
                  </p>
                </Panel>
              ) : null}
              <ImpersonateForm orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} action={startImpersonationAction.bind(null, locale as Locale)} />
            </section>
          )}
        </div>

        <section aria-labelledby="history" className="min-w-0">
          <SectionHeader as="h2" id="history" title={t("logTitle")} count={sessions.length} />
          <div className="mt-3">
            <HistoryTable sessions={sessions} locale={locale} />
          </div>
        </section>
      </div>
    </>
  );
}
