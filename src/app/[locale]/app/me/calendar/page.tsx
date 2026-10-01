import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCalendarConnection, listCalendarFailures } from "@/lib/dal/calendar";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { formatDateTime } from "@/components/sessions/numerals";
import { dayShortLabel } from "@/components/sessions/day-label";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { Button, buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SettingsGroup } from "@/components/ui/settings-group";
import type { Locale } from "@/i18n/routing";
import { disconnect, retry } from "./actions";

// SCR-025 · «التقويم» — `Calendar.dc.html`, `M10c.md` §5, REQ-UIX-075. Written from the artboard in wave 20 after the
// old page was deleted (DEC-208); its kept-behaviour table is C1 – C18 in `docs/plan/notes/notify.md` (§W2).
//
// The connection and what failed, and nothing else (DEC-216 §5.20): one row — «تقويم Google · متصل · افصل», or
// «غير متصل · اربط» — and, only when a day failed to reach the calendar, «لم تُضف» with «أعد المحاولة» on each. No
// synced list, no legend: a healthy integration is one row (DEC-NEXT-22).
//
// ★ No token can reach this page (REQ-CAL-003, A33): `getCalendarConnection()` names its four granted columns, and a
// `select *` on `calendar_connections` is 42501 — by grant, not by restraint (C1).
//
// ★ Everything here works without JavaScript: connect is a plain link into a Route Handler (C3), disconnect and each
// retry are forms whose actions redirect back with one line to say what happened (C4 – C6).
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string; retried?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { connected, disconnected, error, retried } = await searchParams;

  const [t, tDays, connection, prefs] = await Promise.all([
    getTranslations("calendar"),
    // Contract 7 of wave 9: a day is named in `sessions`' words on every surface. Reading is not writing.
    getTranslations("sessions.days"),
    getCalendarConnection(locale),
    getOrgPrefs(locale),
  ]);
  const isConnected = Boolean(connection && !connection.disconnectedAt);
  // Disconnecting marks every sync row `removed` (`0038`), so nothing can have failed for a calendar not linked.
  const failures = isConnected ? await listCalendarFailures(locale) : [];

  // The time in the ORG's zone (A20, C15); the day named only when the session has more than one (REQ-SES-018, C13).
  const when = (f: (typeof failures)[number]) => {
    if (!f.startsAt) return null;
    const at = formatDateTime(f.startsAt, prefs.timeZone, locale);
    return f.dayCount > 1 && f.dayPosition !== null ? `${dayShortLabel({ position: f.dayPosition, startsAt: f.startsAt }, tDays)} · ${at}` : at;
  };

  const status = error
    ? { role: "alert" as const, tone: "error" as const, text: error === "retry" ? t("failed.retryError") : t("connection.error") }
    : disconnected
      ? { role: "status" as const, tone: "neutral" as const, text: t("connection.afterDisconnect") }
      : connected
        ? { role: "status" as const, tone: "success" as const, text: t("connection.justConnected") }
        : retried
          ? { role: "status" as const, tone: "neutral" as const, text: t("failed.retried") }
          : null;

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={t("title")} />
      <HubStrip />

      {/* REQ-CAL-007: the member is told their events stay and stop updating (C5); an OAuth or action failure says
          so and blocks nothing else on the page (C6). */}
      {status ? (
        <div role={status.role}>
          <Panel tone={status.tone} className="p-3 text-body text-fg-heading">
            {status.text}
          </Panel>
        </div>
      ) : null}

      <SettingsGroup
        title={t("add.google")}
        showTitle={false}
        rows={[
          {
            kind: "action",
            id: "google",
            label: t("add.google"),
            value: isConnected ? t("connection.on") : t("connection.off"),
            control: isConnected ? (
              <form action={disconnect.bind(null, locale as Locale)}>
                <Button type="submit" variant="quiet" size="sm">
                  {t("connection.disconnect")}
                </Button>
              </form>
            ) : (
              // A Route Handler (the OAuth redirect), not a page: client navigation would fetch it as RSC (C3). The
              // locale goes with it so the member comes back to the page they left (C18).
              <a href={`/api/calendar/connect?locale=${locale}`} className={buttonClass("quiet", "sm")}>
                {t("connection.connect")}
              </a>
            ),
          },
        ]}
      />

      {failures.length > 0 ? (
        <div className="flex flex-col gap-2">
          {/* REQ-CAL-005: a failed sync is surfaced, not silently dropped — one row per failed DAY (C12, C13). */}
          <SettingsGroup
            title={t("failed.heading")}
            rows={failures.map((f) => ({
              kind: "action" as const,
              id: f.id,
              label: f.sessionTitle,
              detail: when(f),
              control: (
                <form action={retry.bind(null, locale as Locale)}>
                  <input type="hidden" name="event" value={f.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {t("failed.retry")}
                  </Button>
                </form>
              ),
            }))}
          />
          {/* REQ-CAL-008: the seat never waited on the calendar (C16 — the copy trim may move it). */}
          <p className="px-1 text-body-sm text-fg-muted">{t("failed.seatStands")}</p>
        </div>
      ) : null}
    </div>
  );
}
