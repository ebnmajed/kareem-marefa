import { PosterPicker } from "@/components/posters/picker";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SessionStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { getScheduleContent, getSessionForSchedule, listVenues } from "@/lib/dal/sessions";
import { storedPhase } from "@/lib/session-status";
import { saveSchedule } from "./actions";
import { ContentPanel } from "./content-panel";
import { ScheduleForm } from "./schedule-form";

// SCR-043 · /app/admin/sessions/[id]/schedule — REQ-SES-001, REQ-SES-002,
// REQ-SES-009, REQ-SES-016, REQ-PRO-009, REQ-DSG-002.
//
// The lead's for wave 8 (`DEC-147`, row L2): «more user friendly … intuitive
// to fill and quick». The form is `schedule-form.tsx`; this page composes it
// with what the proposer wrote and the poster slot, after `Schedule.dc.html`'s
// settings-beside-content layout. Admin only: `getSessionForSchedule()`
// returns null for anyone else and the route answers the streamed not-found
// contract (DEC-134).

/** An ISO instant as the picker's wall-clock value in the session's zone. */
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
  // `hour12: false` renders midnight as «24» in some engines; the picker wants «00».
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Published or later: the form edits a live session rather than preparing one. */
const LIVE_STATES = new Set(["published", "in_progress", "completed", "archived", "cancelled"]);

export default async function SchedulePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [session, content, venues, t] = await Promise.all([
    getSessionForSchedule(locale, id),
    getScheduleContent(locale, id),
    listVenues(locale),
    getTranslations("schedule"),
  ]);
  if (!session || !content) notFound();

  const zone = session.timeZone;
  const provenance = content.proposal
    ? content.proposal.proposerName
      ? t.rich("fromProposal", { name: content.proposal.proposerName, bdi: (chunks) => <bdi>{chunks}</bdi> })
      : null
    : t("withoutProposal");

  return (
    <div className="space-y-8">
      <PageHeader
        title={session.title}
        breadcrumb={[{ href: "/app/admin/sessions", label: t("breadcrumb") }]}
        breadcrumbLabel={t("breadcrumbLabel")}
        status={<SessionStatusBadge phase={storedPhase(session.state)} />}
        description={t("intro")}
        meta={provenance ? <p className="text-caption text-fg-muted">{provenance}</p> : undefined}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ScheduleForm
            action={saveSchedule.bind(null, locale as Locale, session.id, zone)}
            venues={venues}
            locale={locale}
            timeZone={zone}
            published={LIVE_STATES.has(session.state)}
            proposalDurationMinutes={content.proposal?.expectedDurationMinutes ?? null}
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
              // The stored value, never a default: the action always sends the
              // switch as an explicit boolean (DEC-118, DEC-141).
              allowWalkIns: session.allowWalkIns,
            }}
          />
        </div>

        <aside className="space-y-8 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <ContentPanel title={session.title} content={content} />
          {/* الملصق، بثلاث طرق — `designer`'s slot on SCR-043 (DEC-012,
              REQ-DSG-002/003). The page owns the landmark and the heading; the
              slot owns its data (TEAM.md §2). */}
          <section aria-labelledby="poster" className="space-y-4">
            <SectionHeader id="poster" title={t("poster")} />
            <PosterPicker sessionId={session.id} locale={locale} />
          </section>
        </aside>
      </div>
    </div>
  );
}
