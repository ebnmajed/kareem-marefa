import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PosterPicker } from "@/components/posters/picker";
import { dayLabel } from "@/components/sessions/day-label";
import { formatDateTime, formatNumber, formatTime } from "@/components/sessions/numerals";
import { SessionDownload } from "@/components/sessions/session-download";
import { ButtonLink } from "@/components/ui/button";
import { KvCard } from "@/components/ui/kv-card";
import { Panel } from "@/components/ui/panel";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getSessionPosterDownloads } from "@/lib/dal/posters";
import { checkInCeiling } from "@/lib/session-status";
import { getScheduleContent, getScheduleRead, getSessionForSchedule, getSessionLog, listSessionPresentersForAdmin, listVenues } from "@/lib/dal/sessions";
import { addPresenter, removePresenter, saveSchedule } from "./actions";
import { PresentersRow } from "./presenters-row";
import { followingEnd } from "./rules";
import { ScheduleForm } from "./schedule-form";

// SCR-043 · الجدولة — REQ-UIX-089, REQ-SES-001, REQ-SES-002, REQ-SES-009, REQ-SES-016, REQ-SES-019, REQ-PRO-009,
// DEC-NEXT-28. Rebuilt in wave 21 from `AdminSessionHub.dc.html`: deleted first, then written (`DEC-208`); the table of
// what it kept is `notes/sessions.md` W21.4 (S1 – S38).
//
// ★ READ BY DEFAULT, EDITED ON INTENT. The tab is one `kv-card` of what is set, as text; «عدّل» is a LINK to `?edit`,
// where the card's edit twin is the schedule's existing form, every field and every rule of it. A save that lands
// comes back here with `?saved=1` / `?published=1`. The header — title, status, the lifecycle — is the layout's
// (contract 4); this page draws none of it, and its first heading is an `h2`.
//
// Admin only: `getSessionForSchedule()` and `getScheduleRead()` return null for anyone else and the route answers the
// streamed not-found (DEC-134). A moderator never lands here (`DEC-178`'s redirect).

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

/** The log's verbs, by `audit_log.action`. */
const LOG_KEY: Record<string, string> = {
  "proposal.approved": "proposalApproved",
  "session.created_from_proposal": "createdFromProposal",
  "session.created_direct": "createdDirect",
  "session.scheduled": "scheduled",
  "session.published": "published",
  "session.start": "start",
  "session.complete": "complete",
  "session.cancel": "cancel",
  "session.archive": "archive",
  "session.reopen": "reopen",
  "session.presenter_added": "presenterAdded",
  "session.presenter_removed": "presenterRemoved",
  "session.renamed": "renamed",
};

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const editing = query.edit !== undefined;

  const [session, read, content, venues, presenters, members, t, tDays] = await Promise.all([
    getSessionForSchedule(locale, id),
    getScheduleRead(locale, id),
    getScheduleContent(locale, id),
    listVenues(locale),
    listSessionPresentersForAdmin(locale, id),
    // `console`'s admin reader — the source SCR-053 and SCR-054 feed the member picker from (DEC-174 Q8). Imported.
    listMembersForAdmin(locale),
    getTranslations("schedule"),
    getTranslations("sessions.days"),
  ]);
  if (!session || !read || !content || !presenters) notFound();
  const [logRows, posterDownloads] = await Promise.all([
    getSessionLog(locale, id, read.proposalId),
    // `designer`'s DTO, read only to know whether there is a file at all: no poster yet reads as «—», not a blank.
    getSessionPosterDownloads(locale, id).catch(() => null),
  ]);
  const log = logRows ?? [];

  const zone = session.timeZone;
  const here = `/app/admin/sessions/${session.id}/schedule`;
  const multiDay = session.days.length > 1;
  const venueOf = (venueId: string | null) => (venueId ? (venues.find((v) => v.id === venueId) ?? null) : null);

  // ── The read card's values ─────────────────────────────────────────────────
  const span = (start: string, end: string) => `${formatDateTime(start, zone, locale)} – ${formatTime(end, zone, locale)}`;
  const when: ReactNode = !session.startsAt
    ? null
    : multiDay
      ? (
          <ul className="space-y-1">
            {session.days.map((day) => (
              <li key={day.id}>
                <bdi>{dayLabel({ position: day.position, startsAt: day.startsAt }, zone, tDays, locale)}</bdi> · <bdi>{span(day.startsAt, day.endsAt)}</bdi>
              </li>
            ))}
          </ul>
        )
      : session.endsAt
        ? <bdi>{span(session.startsAt, session.endsAt)}</bdi>
        : <bdi>{formatDateTime(session.startsAt, zone, locale)}</bdi>;
  const venue = venueOf(session.venueId);
  const where: ReactNode = venue
    ? t.rich("read.venueSeats", { name: venue.name, count: venue.capacity ?? 0, value: formatNumber(venue.capacity ?? 0), t: (c) => <bdi>{c}</bdi> })
    : session.customVenueName
      ? <bdi>{session.customVenueName}</bdi>
      : null;
  // «يُغلق …» — the pure twin of `check_in_ceiling()` (DEC-151), read-only over the day set this page already holds:
  // no grant, no RPC, no third copy of the rule (the lead's D7 ruling). One day only: a workshop's days each close
  // on their own, and one time would mislead.
  const ceiling = multiDay ? null : checkInCeiling(session.days, 0);
  const checkIn = [
    read.rotationSeconds ? t("read.rotation", { count: Math.round(read.rotationSeconds / 60), value: formatNumber(Math.round(read.rotationSeconds / 60)) }) : null,
    ceiling !== null ? t("read.closes", { time: formatTime(new Date(ceiling).toISOString(), zone, locale) }) : null,
    session.allowWalkIns ? t("read.walkIns") : null,
    multiDay && session.requireAllDays ? t("read.everyDay") : null,
  ].filter((v): v is string => v !== null);
  const certificate = t(`read.certificateMode.${read.certificateMode}`);
  const cancelled = session.state === "cancelled";
  const presentersSection = {
    presenters,
    members: (members ?? []).filter((m) => m.status === "active").map((m) => ({ id: m.id, displayName: m.displayName, email: m.email })),
    completed: session.state === "completed" || session.state === "archived",
    locked: cancelled,
    addAction: addPresenter.bind(null, locale as Locale, session.id),
    removeActions: Object.fromEntries(presenters.map((p) => [p.memberId, removePresenter.bind(null, locale as Locale, session.id, p.memberId)])),
  };

  const side = (
    <aside className="space-y-4">
      <Panel>
        <dl className="space-y-2 text-body-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">{t("side.reservations")}</dt>
            <dd className="font-semibold text-fg-heading">
              <bdi>
                {session.capacity !== null
                  ? t("side.ofCapacity", { confirmed: formatNumber(read.confirmed), capacity: formatNumber(session.capacity) })
                  : formatNumber(read.confirmed)}
              </bdi>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted">{t("side.waitlist")}</dt>
            <dd className="font-semibold text-fg-heading">
              <bdi>{formatNumber(read.waitlisted)}</bdi>
            </dd>
          </div>
        </dl>
        {/* الملصق — «تنزيل الملصق» through `designer`'s audited route (REQ-DSG-027, DEC-178); never signed here. */}
        <section aria-labelledby="poster" className="mt-4 space-y-2 border-t border-edge pt-4">
          <h2 id="poster" className="text-label text-fg-muted">
            {t("side.poster")}
          </h2>
          {posterDownloads ? (
            <Suspense fallback={null}>
              <SessionDownload sessionId={session.id} locale={locale} placement="hub" />
            </Suspense>
          ) : (
            <p className="text-body-sm text-fg-body">{t("read.empty")}</p>
          )}
        </section>
      </Panel>
      {log.length > 0 ? (
        <Panel>
          <section aria-labelledby="session-log">
            <h2 id="session-log" className="mb-2 text-label text-fg-muted">
              {t("side.log")}
            </h2>
            <ul className="space-y-1 text-body-sm text-fg-body">
              {log.map((entry, i) => {
                const line = (
                  <>
                    {t(`log.${LOG_KEY[entry.action]}`)}
                    {entry.actorName ? (
                      <>
                        {" · "}
                        <bdi>{entry.actorName}</bdi>
                      </>
                    ) : null}
                    {" · "}
                    <bdi>{formatDateTime(entry.occurredAt, zone, locale)}</bdi>
                  </>
                );
                return (
                  <li key={`${entry.action}-${entry.occurredAt}-${i}`}>
                    {/* ★ What the proposer wrote is one tap away (REQ-PRO-009): the audience and duration live on the
                        proposal, never copied onto the session. */}
                    {entry.action === "proposal.approved" && read.proposalId ? (
                      <Link href={`/app/admin/proposals/${read.proposalId}`} className="underline underline-offset-4 hover:text-fg-heading">
                        {line}
                      </Link>
                    ) : (
                      line
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </Panel>
      ) : null}
    </aside>
  );

  if (editing) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-8">
          <ScheduleForm
            action={saveSchedule.bind(null, locale as Locale, session.id, zone)}
            venues={venues}
            locale={locale}
            timeZone={zone}
            published={LIVE_STATES.has(session.state)}
            proposalDurationMinutes={content.proposal?.expectedDurationMinutes ?? null}
            doneHref={here}
            readRows={{ presenters: <PresentersRow presenters={read.presenters} />, certificate }}
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
              language: session.language,
              // The stored value, never a default: the action always sends the switch as an explicit boolean (DEC-118).
              allowWalkIns: session.allowWalkIns,
              requireAllDays: session.requireAllDays,
              // ★ The day set (REQ-SES-015): day one's `id` travels so a save MOVES the day; an end that is exactly
              // start + duration is handed over as `""`, so it keeps following the duration (OQ-001, per day).
              days: session.days.map((day) => {
                const startsAt = localValue(day.startsAt, zone);
                const endsAt = localValue(day.endsAt, zone);
                return {
                  id: day.id,
                  startsAt,
                  endsAt: endsAt === followingEnd(startsAt, session.durationMinutes?.toString() ?? "") ? "" : endsAt,
                  venueId: day.venueId ?? "",
                  customVenueName: day.customVenueName ?? "",
                  customVenueAddress: day.customVenueAddress ?? "",
                  customVenueMapUrl: day.customVenueMapUrl ?? "",
                  hasAttendance: day.hasAttendance,
                  contentCount: day.contentCount,
                };
              }),
            }}
          />
          {/* The poster is a setting (REQ-DSG-002, DEC-012); no artboard draws the picker, so it sits with the other
              settings while editing — outside the schedule's form, because it has forms of its own (D11). */}
          <section aria-labelledby="poster-picker" className="space-y-4">
            <h2 id="poster-picker" className="text-h3 text-fg-heading">
              {t("read.rows.poster")}
            </h2>
            <PosterPicker sessionId={session.id} locale={locale} />
          </section>
        </div>
        {side}
      </div>
    );
  }

  const status = query.published !== undefined ? "published" : query.saved !== undefined ? "saved" : null;
  const live = LIVE_STATES.has(session.state);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        {status ? (
          <Panel tone="success">
            <p role="status" className="text-body-sm text-fg-heading">
              {t(`status.${status}`)}
            </p>
          </Panel>
        ) : null}
        <KvCard
          label={t("read.label")}
          emptyValue={t("read.empty")}
          rows={[
            { id: "when", label: t("read.rows.when"), value: when },
            { id: "where", label: t("read.rows.where"), value: where },
            { id: "capacity", label: t("read.rows.capacity"), value: session.capacity !== null ? <bdi>{formatNumber(session.capacity)}</bdi> : null },
            { id: "rsvpDeadline", label: t("read.rows.rsvpDeadline"), value: session.rsvpDeadlineAt ? <bdi>{formatDateTime(session.rsvpDeadlineAt, zone, locale)}</bdi> : null },
            { id: "cutoff", label: t("read.rows.cutoff"), value: session.cancellationCutoffAt ? <bdi>{formatDateTime(session.cancellationCutoffAt, zone, locale)}</bdi> : null },
            {
              id: "presenters",
              label: t("read.rows.presenters"),
              value: <PresentersRow presenters={read.presenters} section={cancelled ? undefined : presentersSection} />,
            },
            { id: "checkIn", label: t("read.rows.checkIn"), value: checkIn.length > 0 ? checkIn.join(" · ") : null },
            { id: "certificate", label: t("read.rows.certificate"), value: certificate },
            { id: "language", label: t("read.rows.language"), value: t(`language.${session.language}`) },
          ]}
        />
        {/* «عدّل» and «أعد الجدولة» under the card, as drawn — the card holds what is set, not what to do. */}
        {cancelled ? null : (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`${here}?edit`} size="md">
              {t("read.edit")}
            </ButtonLink>
            {/* ★ «أعد الجدولة» once published (REQ-SES-009 — it notifies and moves reminders): the same form, at the
                date (D9). */}
            {live && session.state !== "completed" && session.state !== "archived" ? (
              <ButtonLink href={`${here}?edit#startsAt`} variant="quiet" size="md">
                {t("read.reschedule")}
              </ButtonLink>
            ) : null}
          </div>
        )}
      </div>
      {side}
    </div>
  );
}
