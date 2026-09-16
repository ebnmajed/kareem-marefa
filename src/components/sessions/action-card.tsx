import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { RsvpReserve, RsvpSecondary, RsvpStatus } from "@/components/checkin/rsvp-panel";
import { AttendanceOutcome } from "@/components/checkin/attendance-outcome";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { CertificateModeBadge } from "@/components/certificates/mode-badge";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { ActionBar } from "@/components/sessions/action-bar";
import { formatDate, formatDateTime, formatNumber, formatTime, sameDay } from "@/components/sessions/numerals";
import type { PrimaryAction } from "@/components/sessions/event-actions";
import { ShareLink } from "@/components/sessions/share-link";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { buttonClass } from "@/components/ui/button";
import { ClockIcon, DownloadIcon, PinIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Progress } from "@/components/ui/progress";
import type { AffordanceCell } from "@/components/checkin/session-matrix";
import type { RsvpPanelData } from "@/lib/dal/rsvp";
import type { EventSession } from "@/lib/dal/sessions";
import type { SessionPhase } from "@/lib/session-status";

// The action card — `16` §5.4.2, §6.3, REQ-SES-013, REQ-UIX-004, REQ-UIX-015.
//
// ★ TWO STATES, ONE CARD, AND IT IS A SERVER RENDER. Before a seat is held the
// one primary is «احجز مقعدك»; once it is held, «أضِف إلى تقويمك» takes that
// place, because it was never offered before there was a seat. The swap is the
// server rendering `viewerRelation` — so the member who arrives from the
// confirmation email sees the after state, and so does one with no JavaScript.
//
// Nothing here decides permission. Every control renders on a predicate that
// already exists: `RsvpPanel`'s parts gate themselves on `canReserve`/
// `canCancel`, the primary is `primaryActionFor()` over the matrix, the calendar
// is `can.calendar`, the staff links are the viewer's role. For an ended session
// there is no register control anywhere — the matrix gives none (ask 4).
//
// The region is «الحضور» (visually hidden — the card needs no heading on screen,
// and `checkin.spec.ts` finds the reservation controls inside it). Sticky beside
// the sections from `md`; in flow after the hero on the phone, where its primary
// moves to the bottom action bar.

export interface ActionCardProps {
  session: EventSession;
  phase: SessionPhase;
  can: AffordanceCell;
  rsvp: RsvpPanelData | null;
  primary: PrimaryAction | null;
  slot: SlotProps;
  /** Tasks' summary, for «المهام التحضيرية (N)» once a seat is held. */
  tasks?: Promise<SlotSummary>;
  /** Materials are on the page: the ended card's «المواد» jumps to them. */
  materialsShown: boolean;
  /** When `primary` is `rate`: the day the org's rating window closes. */
  ratingClosesAt: string | null;
  /** A signed link to this member's issued certificate for this session. */
  certificateHref: string | null;
  bookmarked: boolean;
  /** The PUBLIC card's URL, or null where the public card would not answer. */
  shareUrl: string | null;
  isAdmin: boolean;
  locale: string;
}

export async function ActionCard(props: ActionCardProps) {
  const { session, phase, can, rsvp, primary, slot, locale } = props;
  const [t, tRsvp] = await Promise.all([getTranslations("sessions.event"), getTranslations("rsvp")]);

  const showSeats =
    phase === "open" && rsvp !== null && rsvp.capacity !== null && (session.viewerRelation === "none" || session.viewerRelation === "presenter" || session.viewerRelation === "staff");
  const confirmedOpen = phase === "open" && session.viewerRelation === "confirmed";
  const bookmarkable = phase === "open" || phase === "live" || phase === "ended";
  const hostViewSecondary = primary !== "hostView" && (session.viewerIsPresenter || session.viewerIsStaff) && can.hostConsole;

  const bookmark = (variant: "icon" | "button") =>
    bookmarkable ? <BookmarkButton locale={locale} sessionId={session.id} initialBookmarked={props.bookmarked} variant={variant} /> : null;
  const share = (variant: "icon" | "button") =>
    props.shareUrl ? (
      <ShareLink
        url={props.shareUrl}
        title={session.title}
        label={t("actions.share")}
        copiedLabel={t("shareCopied")}
        hint={t("shareHint")}
        failedLabel={t("shareFailed")}
        variant={variant}
        hintId="share-hint"
      />
    ) : null;

  const barSecondary = bookmarkable || props.shareUrl ? (
    <>
      {bookmark("icon")}
      {share("icon")}
    </>
  ) : null;

  return (
    <section id="attend" aria-labelledby="attend-heading" className="flex flex-col gap-4 rounded-card border border-edge bg-canvas p-5 shadow-card md:p-6">
      <h2 id="attend-heading" className="sr-only">
        {tRsvp("title")}
      </h2>

      {showSeats && rsvp?.capacity != null ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-h3 text-fg-heading">
            <bdi>{t("seatsTaken", { count: rsvp.capacity, value: formatNumber(rsvp.capacity), taken: formatNumber(rsvp.confirmedCount) })}</bdi>
          </p>
          <Progress
            value={Math.min(rsvp.confirmedCount, rsvp.capacity)}
            max={rsvp.capacity}
            label={t("seatsProgress")}
            valueText={t("seatsTaken", { count: rsvp.capacity, value: formatNumber(rsvp.capacity), taken: formatNumber(rsvp.confirmedCount) })}
          />
        </div>
      ) : null}

      <RsvpStatus {...slot} />
      {can.attendanceOutcome ? <AttendanceOutcome {...slot} /> : null}

      {primary ? <PrimaryControl action={primary} placement="card" session={session} slot={slot} labels={{ checkIn: t("checkIn"), hostView: t("hostView"), rate: t("actions.rate") }} /> : null}

      {/* The calendar the matrix offers, when it is not the primary: a running
          session keeps it for a confirmed member and its presenter (`16` §5.3),
          as a secondary action beside «تسجيل الحضور». */}
      {can.calendar && primary !== "calendar" ? <AddToCalendar {...slot} placement="inline" variant="secondary" /> : null}

      {primary === "rate" && props.ratingClosesAt ? (
        <p className="text-body-sm text-fg-muted">{t("actions.ratingWindow", { date: formatDate(props.ratingClosesAt, session.timeZone, locale) })}</p>
      ) : null}

      {confirmedOpen && props.tasks ? (
        <Suspense fallback={null}>
          <TasksJump tasks={props.tasks} label={t("actions.tasks")} />
        </Suspense>
      ) : null}

      {props.certificateHref ? (
        <a href={props.certificateHref} className={buttonClass("secondary", "md", "w-full")}>
          <DownloadIcon className="text-[1.125rem]" />
          <span>{t("actions.certificate")}</span>
        </a>
      ) : null}

      {phase === "ended" && props.materialsShown ? (
        <a href="#materials" className={buttonClass("secondary", "md", "w-full")}>
          {t("actions.materials")}
        </a>
      ) : null}

      <RsvpSecondary {...slot} />

      {confirmedOpen ? <p className="text-body-sm text-fg-muted">{t("actions.confirmedHint")}</p> : null}

      {bookmarkable || props.shareUrl ? (
        <div className="hidden flex-col gap-2 md:flex">
          <div className="grid grid-cols-2 gap-2 [&>*]:w-full">
            {bookmark("button")}
            {share("button")}
          </div>
          {props.shareUrl ? (
            <p id="share-hint" className="text-caption text-fg-muted">
              {t("shareHint")}
            </p>
          ) : null}
        </div>
      ) : null}

      <Meta session={session} phase={phase} locale={locale} />
      <CertificateRow sessionId={session.id} locale={locale} />

      {session.viewerIsStaff || hostViewSecondary ? (
        <nav aria-label={t("actions.staffHeading")} className="border-t border-edge pt-4">
          <p className="text-caption text-fg-muted" aria-hidden="true">
            {t("actions.staffHeading")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
            {hostViewSecondary ? (
              <li>
                <Link href={`/app/sessions/${session.id}/host`} className="text-fg-heading underline underline-offset-4">
                  {t("hostView")}
                </Link>
              </li>
            ) : null}
            {session.viewerIsStaff && props.isAdmin ? (
              <li>
                <Link href={`/app/admin/sessions/${session.id}/schedule`} className="text-fg-heading underline underline-offset-4">
                  {t("manageSchedule")}
                </Link>
              </li>
            ) : null}
            {session.viewerIsStaff ? (
              <li>
                <Link href={`/app/admin/sessions/${session.id}/attendance`} className="text-fg-heading underline underline-offset-4">
                  {t("manageAttendance")}
                </Link>
              </li>
            ) : null}
            {session.viewerIsStaff && props.isAdmin ? (
              <li>
                <Link href={`/app/admin/sessions/${session.id}/certificates`} className="text-fg-heading underline underline-offset-4">
                  {t("manageCertificates")}
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}

      <ActionBar
        primary={primary ? <PrimaryControl action={primary} placement="bar" session={session} slot={slot} labels={{ checkIn: t("checkIn"), hostView: t("hostView"), rate: t("actions.rate") }} /> : null}
        secondary={barSecondary}
      />
    </section>
  );
}

/** The one primary action, drawn for the card (from `md`) or the phone's bar. */
function PrimaryControl({
  action,
  placement,
  session,
  slot,
  labels,
}: {
  action: PrimaryAction;
  placement: "card" | "bar";
  session: EventSession;
  slot: SlotProps;
  labels: { checkIn: string; hostView: string; rate: string };
}) {
  if (action === "reserve") return <RsvpReserve {...slot} placement={placement} />;
  if (action === "calendar") return <AddToCalendar {...slot} placement={placement} />;
  const href = action === "checkIn" ? `/app/sessions/${session.id}/check-in` : action === "hostView" ? `/app/sessions/${session.id}/host` : `/app/sessions/${session.id}/rate`;
  const label = action === "checkIn" ? labels.checkIn : action === "hostView" ? labels.hostView : labels.rate;
  return (
    <div className={placement === "card" ? "hidden md:block" : undefined}>
      <Link href={href} className={buttonClass("primary", "lg", "w-full")}>
        {label}
      </Link>
    </div>
  );
}

async function TasksJump({ tasks, label }: { tasks: Promise<SlotSummary>; label: string }) {
  const [summary, t] = await Promise.all([tasks, getTranslations("sessions.event.actions")]);
  if (!summary.visible) return null;
  const outstanding = summary.outstanding ?? 0;
  return (
    // Drawn as a figure, spoken as words: the name starts with the visible label
    // (SC 2.5.3) and adds «مهمتان متبقيتان».
    <a
      href="#tasks"
      aria-label={outstanding > 0 ? `${label}، ${t("tasksOutstanding", { count: outstanding, value: formatNumber(outstanding) })}` : undefined}
      className={buttonClass("secondary", "md", "w-full")}
    >
      {/* The label takes the free width rather than the link taking a second
          `justify-*` utility over `buttonBase`'s own (DEC-111's class). */}
      <span className="flex-1 text-start">{label}</span>
      {outstanding > 0 ? (
        <span aria-hidden="true" className="min-w-6 rounded-field bg-silver-100 px-1.5 text-center text-caption text-fg-heading">
          {formatNumber(outstanding)}
        </span>
      ) : null}
    </a>
  );
}

/** الموعد · المكان · the deadlines · the certificate mode — REQ-SES-013's facts, as icon rows. */
async function Meta({ session, phase, locale }: { session: EventSession; phase: SessionPhase; locale: string }) {
  const t = await getTranslations("sessions.event");
  const when = (iso: string) => formatDateTime(iso, session.timeZone, locale);
  const until =
    session.startsAt && session.endsAt
      ? sameDay(session.startsAt, session.endsAt, session.timeZone)
        ? formatTime(session.endsAt, session.timeZone, locale)
        : when(session.endsAt)
      : null;

  return (
    <dl className="flex flex-col divide-y divide-edge border-t border-edge">
      <div className="flex gap-3 py-3">
        <ClockIcon className="mt-1 text-[1.125rem] text-fg-muted" />
        <div className="min-w-0">
          <dt className="text-caption text-fg-muted">{t("whenLabel")}</dt>
          <dd className="text-body text-fg-heading">
            {session.startsAt ? (
              <>
                <bdi>{when(session.startsAt)}</bdi>
                {until ? <span className="text-fg-muted"> · {t("toTime", { value: until })}</span> : null}
              </>
            ) : (
              t("notScheduled")
            )}
          </dd>
        </div>
      </div>
      <div className="flex gap-3 py-3">
        <PinIcon className="mt-1 text-[1.125rem] text-fg-muted" />
        <div className="min-w-0">
          <dt className="text-caption text-fg-muted">{t("whereLabel")}</dt>
          <dd className="text-body text-fg-heading">
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
              <a href={session.venue.mapUrl} rel="noreferrer noopener" target="_blank" className="mt-1 block w-fit text-body-sm text-fg-heading underline underline-offset-4">
                {t("mapLink")}
              </a>
            ) : null}
            {/* REQ-SES-008, said plainly and once. */}
            <span className="mt-1 block text-body-sm text-fg-muted">{t("inPersonNote")}</span>
          </dd>
        </div>
      </div>
      {phase === "open" && session.rsvpDeadlineAt ? (
        <div className="py-3 ps-[1.875rem]">
          <dt className="text-caption text-fg-muted">{t("rsvpDeadlineLabel")}</dt>
          <dd className="text-body text-fg-heading">
            <bdi>{when(session.rsvpDeadlineAt)}</bdi>
          </dd>
        </div>
      ) : null}
      {phase === "open" && session.viewerRelation === "confirmed" && session.cancellationCutoffAt ? (
        <div className="py-3 ps-[1.875rem]">
          <dt className="text-caption text-fg-muted">{t("cutoffLabel")}</dt>
          <dd className="text-body text-fg-heading">
            <bdi>{when(session.cancellationCutoffAt)}</bdi>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** `CertificateModeBadge` renders nothing when certificates are off (D50), so the row goes with it. */
async function CertificateRow({ sessionId, locale }: { sessionId: string; locale: string }) {
  const badge = await CertificateModeBadge({ sessionId, locale });
  if (!badge) return null;
  return <div className="-mt-3 border-b border-edge pb-3 ps-[1.875rem]">{badge}</div>;
}
