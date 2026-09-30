import { getTranslations } from "next-intl/server";
import { CertificateModeBadge } from "@/components/certificates/mode-badge";
import { dayLabel } from "@/components/sessions/day-label";
import { formatDateTime, formatTime, sameDay } from "@/components/sessions/numerals";
import { CalendarIcon, CheckIcon, ClockIcon, PinIcon } from "@/components/ui/icons";
import type { EventSession, SessionDay } from "@/lib/dal/sessions";
import type { SessionPhase } from "@/lib/session-status";

// The action card's icon rows — `Event.dc.html:55-60`, `EventLive.dc.html:47-50`, REQ-SES-013.
//
// The time, the place with «الخريطة», the deadlines, the certificate line. While the session runs, the place
// comes first and the time says «بدأت · تنتهي» (`EventLive.dc.html`).
//
// ★ A `<dl>`: each `<div>` holds its `<dt>` and `<dd>` and nothing else (axe's `definition-list`), and the glyph
// rides inside the `<dt>` beside its visually hidden term — the eye has the glyph, a screen reader the word.
//
// ★ SEVERAL DAYS (REQ-SES-015): the time row lists each day with its own clock, and names a place only where
// it differs from the session's («يختلف المكان في بعض الأيام»). At one day there is no list — no branch on the
// count: a list of one has no second row to show.
//
// ★ In person only, said once (REQ-SES-008). The map is a LINK, `noopener`, never an embed (§4.71). The
// deadlines line is for everyone while registration is open (DEC-209 §2), stated plainly.

export async function EventMeta({ session, phase, days, locale }: { session: EventSession; phase: SessionPhase; days: readonly SessionDay[]; locale: string }) {
  const [t, tDays] = await Promise.all([getTranslations("sessions.event"), getTranslations("sessions.days")]);
  const when = (iso: string) => formatDateTime(iso, session.timeZone, locale);
  const until =
    session.startsAt && session.endsAt
      ? sameDay(session.startsAt, session.endsAt, session.timeZone)
        ? formatTime(session.endsAt, session.timeZone, locale)
        : when(session.endsAt)
      : null;
  const more = days.length > 1 ? days : [];
  const dayVenue = (day: SessionDay) => day.venue?.name ?? null;
  const placeVaries = more.some((day) => dayVenue(day) !== (session.venue?.name ?? null));
  const live = phase === "live";

  const time = (
    <div key="time" className="flex items-start gap-2.5">
      <dt className="shrink-0 pt-0.5">
        <CalendarIcon aria-hidden="true" className="text-[1.125rem] text-fg-muted" />
        <span className="sr-only">{t("whenLabel")}</span>
      </dt>
      <dd className="min-w-0">
        {session.startsAt ? (
          live && session.endsAt ? (
            <span>{t("liveTimes", { start: formatTime(session.startsAt, session.timeZone, locale), end: formatTime(session.endsAt, session.timeZone, locale) })}</span>
          ) : (
            <>
              <bdi>{when(session.startsAt)}</bdi>
              {/* A no-break space after the dot: a line may break before «·», never after it. */}
              {until ? <span className="text-fg-muted"> ·{" "}{t("toTime", { value: until })}</span> : null}
            </>
          )
        ) : (
          t("notScheduled")
        )}
        {more.length > 0 ? (
          <ol className="mt-2 space-y-1.5 border-t border-edge pt-2">
            {more.map((day) => (
              <li key={day.id} className="text-body-sm">
                <bdi className="text-fg-heading">{dayLabel(day, session.timeZone, tDays, locale)}</bdi>
                <span className="text-fg-muted">
                  {" · "}
                  <bdi>{formatTime(day.startsAt, session.timeZone, locale)}</bdi>
                  {" — "}
                  <bdi>{formatTime(day.endsAt, session.timeZone, locale)}</bdi>
                </span>
                {dayVenue(day) && dayVenue(day) !== (session.venue?.name ?? null) ? (
                  <span className="block text-fg-muted">
                    <bdi>{dayVenue(day)}</bdi>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </dd>
    </div>
  );

  const place = (
    <div key="place" className="flex items-start gap-2.5">
      <dt className="shrink-0 pt-0.5">
        <PinIcon aria-hidden="true" className="text-[1.125rem] text-fg-muted" />
        <span className="sr-only">{t("whereLabel")}</span>
      </dt>
      <dd className="min-w-0">
        {session.venue ? (
          <>
            <bdi>{session.venue.name}</bdi>
            {session.venue.address ? (
              <span className="text-fg-muted">
                {"، "}
                <bdi>{session.venue.address}</bdi>
              </span>
            ) : null}
          </>
        ) : (
          t("noVenue")
        )}
        {session.venue?.mapUrl ? (
          <>
            {" "}
            <a href={session.venue.mapUrl} rel="noreferrer noopener" target="_blank" className="whitespace-nowrap font-bold text-accent underline-offset-4 hover:underline">
              {t("mapLink")}
            </a>
          </>
        ) : null}
        {placeVaries ? <span className="mt-1 block text-body-sm text-fg-muted">{t("placeVaries")}</span> : null}
        <span className="mt-1 block text-body-sm text-fg-muted">{t("inPersonNote")}</span>
      </dd>
    </div>
  );

  const deadlines =
    phase === "open" && (session.rsvpDeadlineAt || session.cancellationCutoffAt) ? (
      <div key="deadlines" className="flex items-start gap-2.5">
        <dt className="shrink-0 pt-0.5">
          <ClockIcon aria-hidden="true" className="text-[1.125rem] text-fg-muted" />
          <span className="sr-only">{t("rsvpDeadlineLabel")}</span>
        </dt>
        <dd className="min-w-0 text-fg-muted">
          {session.rsvpDeadlineAt ? <bdi>{t("deadlineClose", { value: when(session.rsvpDeadlineAt) })}</bdi> : null}
          {session.rsvpDeadlineAt && session.cancellationCutoffAt ? " · " : null}
          {session.cancellationCutoffAt ? <bdi>{t("deadlineCutoff", { value: when(session.cancellationCutoffAt) })}</bdi> : null}
        </dd>
      </div>
    ) : null;

  // The certificate line when the mode is on (REQ-CRT-002) — `designer`'s badge, which renders nothing when off.
  const mode = await CertificateModeBadge({ sessionId: session.id, locale });
  const certificate = mode ? (
    <div key="certificate" className="flex items-start gap-2.5">
      <dt className="shrink-0 pt-0.5">
        <CheckIcon aria-hidden="true" className="text-[1.125rem] text-fg-muted" />
        <span className="sr-only">{t("certificateShort")}</span>
      </dt>
      <dd className="min-w-0">{mode}</dd>
    </div>
  ) : null;

  return <dl className="flex flex-col gap-2.5 text-body-sm text-fg-body">{live ? [place, time] : [time, place, deadlines, certificate]}</dl>;
}
