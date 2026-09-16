import { PosterPicker } from "@/components/posters/picker";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSessionForSchedule, listVenues } from "@/lib/dal/sessions";
import { publish, saveSchedule } from "./actions";
import { PublishButton } from "./publish-button";
import { ScheduleForm } from "./schedule-form";

// SCR-043 · /app/admin/sessions/[id]/schedule (REQ-SES-001, REQ-SES-002,
// REQ-SES-006, REQ-SES-007, REQ-SES-011).
//
// Owned by `sessions` for wave 1, handed to `console` at wave 3 (DEC-042).
// Admin only: getSessionForSchedule() returns null for anyone else and the
// route 404s.

/** An ISO instant as the `datetime-local` value for a given zone. */
function localValue(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function SchedulePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [session, venues, t, ts] = await Promise.all([
    getSessionForSchedule(locale, id),
    listVenues(locale),
    getTranslations("admin.schedule"),
    getTranslations("admin.sessions"),
  ]);
  if (!session) notFound();

  const zone = session.timeZone;
  return (
    <>
      <p className="text-body-sm">
        <Link href="/app/admin/sessions" className="text-fg-muted underline underline-offset-4 hover:text-fg-heading">
          {t("back")}
        </Link>
      </p>
      <h1 className="mt-3 text-h1 text-fg-heading">
        <bdi>{session.title}</bdi>
      </h1>
      <p className="mt-2 text-body-sm text-fg-muted">
        {t("stateLabel")}: {ts(`state.${session.state}`)}
      </p>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      <ScheduleForm
        action={saveSchedule.bind(null, locale as Locale, session.id, zone)}
        venues={venues}
        locale={locale}
        initial={{
          startsAt: localValue(session.startsAt, zone),
          durationMinutes: session.durationMinutes?.toString() ?? "",
          endsAt: localValue(session.endsAt, zone),
          venueId: session.venueId ?? "",
          customVenueName: session.customVenueName ?? "",
          customVenueAddress: session.customVenueAddress ?? "",
          customVenueMapUrl: session.customVenueMapUrl ?? "",
          capacity: session.capacity?.toString() ?? "",
          rsvpDeadlineAt: localValue(session.rsvpDeadlineAt, zone),
          cancellationCutoffAt: localValue(session.cancellationCutoffAt, zone),
          certificateMode: session.certificateMode,
          language: session.language,
          // The stored value, not a default: the action always sends the checkbox
          // as an explicit boolean, so an unchecked default would switch walk-ins
          // off on any save (DEC-118, DEC-141 correction B).
          allowWalkIns: session.allowWalkIns,
        }}
      />

      {/* الملصق، بثلاث طرق — the designer slot on SCR-043 (DEC-012, REQ-DSG-002/003):
          automatic, customise (which detaches, one way), or upload. The page owns
          the landmark and the heading; the slot owns its data (TEAM.md §2). */}
      <section aria-labelledby="poster" className="mt-10">
        <h2 id="poster" className="text-h2 text-fg-heading">
          {t("poster")}
        </h2>
        <PosterPicker sessionId={session.id} locale={locale} />
      </section>

      <PublishButton action={publish.bind(null, locale as Locale, session.id)} missing={session.missing} />
    </>
  );
}
