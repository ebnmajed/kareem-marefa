import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCalendarConnection, listSyncedEvents } from "@/lib/dal/calendar";
import { formatDateTime } from "@/components/sessions/numerals";
import { dayLabel } from "@/components/sessions/day-label";
import { getPreferenceMatrix } from "@/lib/dal/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Locale } from "@/i18n/routing";
import { disconnect } from "./actions";

// SCR-025 · /app/me/calendar — REQ-CAL-003, REQ-CAL-007.
//
// `09` SCR-025: "shows CONNECTION STATUS only. No token is ever rendered —
// there is no UI in the product that can display one (A33)." That is true by
// construction here rather than by restraint: the DAL cannot read a token,
// because the four granted columns on `calendar_connections` do not include
// one and a `select *` is 42501.

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ connected?: string; disconnected?: string; cancelled?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { connected, disconnected, error } = await searchParams;

  const [t, tDays, connection, events, settings] = await Promise.all([
    getTranslations("calendar"),
    // Contract 7: one day label, in `sessions`' words, on every surface.
    // Reading another track's namespace is a read, never a write.
    getTranslations("sessions.days"),
    getCalendarConnection(locale),
    listSyncedEvents(locale),
    getPreferenceMatrix(locale),
  ]);
  const isConnected = Boolean(connection && !connection.disconnectedAt);

  return (
    <>
      <PageHeader title={t("title")} />

      {connected ? (
        <div role="status">
          <Panel tone="success" className="mt-4 p-3 text-body text-fg-heading">
            {t("connection.justConnected")}
          </Panel>
        </div>
      ) : null}
      {disconnected ? (
        <div role="status">
          <Panel className="mt-4 p-3 text-body text-fg-heading">{t("connection.afterDisconnect")}</Panel>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <Panel tone="error" className="mt-4 p-3 text-body text-fg-heading">
            {t("connection.error")}
          </Panel>
        </div>
      ) : null}

      <section aria-labelledby="connection-heading" className="mt-8">
        <SectionHeader id="connection-heading" title={t("connection.heading")} />
        <p className="mt-2 text-body text-fg-body">
          {isConnected
            ? t.rich("connection.connected", {
                since: formatDateTime(connection!.connectedAt, settings.timeZone, locale),
                bdi: (chunks) => <bdi>{chunks}</bdi>,
              })
            : t("connection.disconnected")}
        </p>
        <p className="mt-2 text-body-sm text-fg-muted">{t("connection.scope")}</p>
        {/* A33 / REQ-CAL-003, said to the member rather than only enforced. */}
        <p className="mt-1 text-body-sm text-fg-muted">{t("connection.privacy")}</p>

        <div className="mt-4">
          {isConnected ? (
            <form action={disconnect.bind(null, locale as Locale)}>
              <Button type="submit" variant="secondary">
                {t("connection.disconnect")}
              </Button>
            </form>
          ) : (
            /* A Route Handler (the OAuth redirect), not a page: <Link /> would client-navigate into it. */
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/api/calendar/connect"
              className="inline-flex h-12 items-center rounded-field bg-[var(--btn-bg)] px-7 text-label text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
            >
              {t("connection.connect")}
            </a>
          )}
        </div>
      </section>

      <section aria-labelledby="synced-heading" className="mt-12">
        <SectionHeader id="synced-heading" title={t("synced.heading")} count={events.length} />
        {events.length === 0 ? (
          // ★ REQ-UIX-012 — an empty state names the next action, here too.
          <EmptyState title={t("synced.empty")} action={{ label: t("synced.browseAction"), href: "/app/sessions" }} className="mt-4" />
        ) : (
          <ul className="mt-4 space-y-3">
            {events.map((event) => (
              /* ★ ONE ENTRY PER DAY (REQ-SES-015), so the key is the row and
                 not the session — a three-day workshop is three entries. */
              <li key={event.id}>
                <Panel className="p-4">
                  <Link href={`/app/sessions/${event.sessionId}`} className="text-label text-fg-heading underline underline-offset-4">
                    <bdi>{event.sessionTitle}</bdi>
                  </Link>
                  {/* REQ-SES-018's first rule, applied here: a session with one
                      day has no day concept at all, so the label appears only
                      when there is more than one meeting to tell apart. */}
                  {event.dayCount > 1 && event.dayPosition !== null && event.startsAt ? (
                    <p className="mt-1 text-body-sm text-fg-body">
                      <bdi>{dayLabel({ position: event.dayPosition, startsAt: event.startsAt }, settings.timeZone, tDays, locale)}</bdi>
                    </p>
                  ) : null}
                  {event.startsAt ? (
                    <p className="mt-1 text-body-sm text-fg-muted">{formatDateTime(event.startsAt, settings.timeZone, locale)}</p>
                  ) : null}
                  <p className="mt-2 text-body-sm text-fg-body">{t(`synced.state.${event.state}`)}</p>
                  {/* REQ-CAL-005: a failed sync is surfaced to the member, and
                      REQ-CAL-008's promise is made explicit beside it. */}
                  {event.state === "failed" ? <p className="mt-1 text-body-sm text-fg-muted">{t("synced.failedHint")}</p> : null}
                  {event.lastSyncedAt ? (
                    <p className="mt-1 text-body-sm text-fg-muted">
                      {t.rich("synced.lastSynced", {
                        at: formatDateTime(event.lastSyncedAt, settings.timeZone, locale),
                        bdi: (chunks) => <bdi>{chunks}</bdi>,
                      })}
                    </p>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
