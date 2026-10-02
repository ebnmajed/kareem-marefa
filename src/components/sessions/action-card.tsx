import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { RsvpReserve, RsvpStatus, reserveMomentLabels } from "@/components/checkin/rsvp-panel";
import { reserveSeatAction } from "@/components/checkin/actions";
import { AwardState } from "@/components/checkin/award-state";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { EventMeta } from "@/components/sessions/event-meta";
import { MomentPart, ReserveMoment, ReserveRefused } from "@/components/sessions/moment-reserve";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { CertificateRow, OutcomeCard } from "@/components/sessions/outcome-card";
import { primaryAfterCheckIn, showsAttended, type PrimaryAction } from "@/components/sessions/event-actions";
import { SessionDownload } from "@/components/sessions/session-download";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { ActionBar } from "@/components/ui/action-bar";
import { AttendeeStack } from "@/components/ui/attendee-stack";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SessionCta } from "@/components/ui/session-cta";
import { checkInOfferFor } from "@/lib/dal/checkin";
import type { AffordanceCell } from "@/components/checkin/session-matrix";
import type { RsvpPanelData } from "@/lib/dal/rsvp";
import type { EventAttendeeFace, EventFigures, EventSession, SessionDay } from "@/lib/dal/sessions";
import type { SessionPhase } from "@/lib/session-status";

// The action card — rebuilt in wave 18 from `Event.dc.html:48-61`, `EventLive.dc.html:43-51`,
// `EventDone.dc.html:39-55` and `EventDesktop.dc.html:46-58` (REQ-UIX-061, REQ-SES-013, REQ-UIX-015, DEC-045).
//
// ★ IT DECIDES NOTHING. The primary is `primaryActionFor()` over the matrix, narrowed by `primaryAfterCheckIn()`
// (contract 4: a recorded check-in is never offered again); the reservation's parts gate themselves on
// `getRsvpPanelData()`'s `canReserve` / `canCancel`; the calendar is `can.calendar`; the staff links are the
// viewer's role. An ended session offers no register control anywhere — the matrix gives none.
//
// ★ THE REGION IS «الحضور» (a visually hidden `h2`) — `checkin.spec.ts` and friends select on it.
//
// In the artboards' order, by phase:
//   · open — the seats bar («12 من 40 مقعدًا · يبقى 28»), the primary (with the rule's amount as its chip),
//     the held seat with the calendar and the cancel, the icon rows;
//   · live — how many are here, as a figure (a count, never who — faces only for staff and presenters, A33
//     rule 3), «تسجيل الحضور» with «مقعدك محجوز» when a seat is held, the code's rotation and when the points
//     arrive, the icon rows;
//   · ended — the outcome (moment 3), «قيّم الجلسة» with the window's end, the certificate.
// Then, for staff and presenters, the poster download (audited) and «إدارة الجلسة».
//
// ★ TWO PRIMARIES ON THE PHONE (DEC-209 §2, REQ-UIX-061): the card's and the bottom `action-bar`'s. From `lg`
// the bar is gone and the card is the full-width action row. Moment 1's ticket rises from the card from `md`
// and from the bar below it — `ReserveMoment` holds the reserve action's result; nothing here is keyed.

export interface ActionCardProps {
  session: EventSession;
  phase: SessionPhase;
  days: readonly SessionDay[];
  can: AffordanceCell;
  rsvp: RsvpPanelData | null;
  primary: PrimaryAction | null;
  slot: SlotProps;
  /** The rule's amount for this viewer — null draws none (never a literal, §4.45). */
  points: number | null;
  figures: EventFigures;
  faces: EventAttendeeFace[];
  tasks?: Promise<SlotSummary>;
  ratingClosesAt: string | null;
  certificateHref: string | null;
  bookmark: (variant: "icon" | "button") => ReactNode;
  share: (variant: "icon" | "button") => ReactNode;
  isAdmin: boolean;
  locale: string;
}

export async function ActionCard(props: ActionCardProps) {
  const { session, phase, can, rsvp, slot, locale, figures } = props;
  const checkIn = checkInOfferFor(
    { ...session, days: props.days },
    { isPresenter: session.viewerIsPresenter, isStaff: session.viewerIsStaff, rsvpStatus: session.rsvpStatus, checkedIn: session.checkedIn, checkedInDayIds: session.checkedInDayIds },
    session.allowWalkIns,
    session.checkInOpen,
  );
  const primary = primaryAfterCheckIn(props.primary, checkIn);
  const [t, tRsvp, momentLabels] = await Promise.all([getTranslations("sessions.event"), getTranslations("rsvp"), reserveMomentLabels(slot)]);

  const open = phase === "open";
  const live = phase === "live";
  const ended = phase === "ended";
  const booked = rsvp?.relation === "confirmed" || session.rsvpStatus === "confirmed";
  const calendarInBooked = primary === "calendar" && rsvp !== null && rsvp.canCancel && !rsvp.canReserve;
  const hostViewSecondary = primary !== "hostView" && (session.viewerIsPresenter || session.viewerIsStaff) && can.hostConsole;

  const control = (placement: "card" | "bar") => (primary ? <Primary action={primary} placement={placement} {...props} booked={booked} /> : null);

  // The bar's secondaries: bookmark and share (`Event.dc.html:123-124`) — or, once rated-for, the certificate as a
  // labelled pill (`EventDone.dc.html:98`, N6). Never a third.
  const icons = [props.bookmark("icon"), props.share("icon")].filter((node): node is Exclude<ReactNode, null | undefined | false> => Boolean(node));
  const barSecondary: readonly [ReactNode] | readonly [ReactNode, ReactNode] | undefined =
    primary === "rate" && props.certificateHref
      ? [
          <a key="cert" href={props.certificateHref} className={buttonClass("secondary", "md")}>
            {t("certificateShort")}
          </a>,
        ]
      : icons.length >= 2
        ? [icons[0], icons[1]]
        : icons.length === 1
          ? [icons[0]]
          : undefined;

  return (
    // ★ The moment's host wraps the card AND the bar, so the ticket can rise from either; the bar stands OUTSIDE
    // the region «الحضور» — it is fixed to the viewport anyway — so the region holds one primary and a locator
    // inside it finds one control, while the phone still shows the primary twice (DEC-209).
    <ReserveMoment action={reserveSeatAction.bind(null, locale, session.id)} labels={momentLabels}>
      <section
        id="attend"
        aria-labelledby="attend-heading"
        className={`rounded-panel border bg-surface p-4 lg:p-5 ${live ? "border-signal" : ended && session.viewerRelation === "attended" ? "border-accent" : "border-edge"}`}
      >
        <MomentPart thud="card" className="flex flex-col gap-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5">
          <h2 id="attend-heading" className="sr-only">
            {tRsvp("title")}
          </h2>

          {open && rsvp?.capacity != null && (session.viewerRelation === "none" || session.viewerRelation === "presenter" || session.viewerRelation === "staff") ? (
            <div className="flex flex-col gap-2 lg:w-56">
              <p className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="font-bold text-fg-heading">
                  {t("seatsTaken", { count: rsvp.capacity, value: formatNumber(rsvp.capacity), taken: formatNumber(rsvp.confirmedCount) })}
                </span>
                {/* The catalogue's existing words for the seats left (`M10a.md`: a string that exists is used) —
                    «يتبقى 28 مقعدًا», which `checkin.spec.ts` reads in this region. */}
                <span className="text-fg-muted">
                  {tRsvp("seatsLeft", { count: Math.max(0, rsvp.capacity - rsvp.confirmedCount), value: formatNumber(Math.max(0, rsvp.capacity - rsvp.confirmedCount)) })}
                </span>
              </p>
              <ProgressBar value={Math.min(rsvp.confirmedCount, rsvp.capacity)} max={rsvp.capacity} decorative />
            </div>
          ) : null}

          {live ? <LiveCount session={session} figures={figures} faces={props.faces} /> : null}

          {ended ? <OutcomeCard session={session} slot={slot} /> : null}

          {/* From `lg` the primary is compact, as `EventDesktop.dc.html:48` draws it: it takes its own width, never the row's. */}
          <div className="flex flex-col gap-3 lg:w-auto lg:max-w-sm lg:flex-none">
            <RsvpStatus {...slot} between={calendarInBooked ? <AddToCalendar {...slot} placement="card" /> : undefined} />
            <ReserveRefused />
            {showsAttended(checkIn, can) ? <SessionCta state={{ kind: "attended" }} label={tRsvp("attended")} /> : null}
            {/* `checkin`'s acknowledgement (REQ-CHK-018): self-gated on its own DTO — `none` renders nothing — so it is
                mounted in every phase but the ended one, where the outcome card carries it. Between two days of a
                workshop the phase is `open` and a member checked in on day one is still told what is pending. */}
            {!ended ? <AwardState sessionId={slot.sessionId} locale={slot.locale} variant="inline" /> : null}
            {!calendarInBooked ? control("card") : null}
            {can.calendar && primary !== "calendar" ? <AddToCalendar {...slot} placement="inline" variant="secondary" /> : null}
          </div>

          {live && (primary === "checkIn" || booked) && figures.rotationSeconds ? (
            <p className="text-caption text-fg-muted">
              {t("rotation", { count: Math.round(figures.rotationSeconds / 60), value: formatNumber(Math.round(figures.rotationSeconds / 60)) })}
              {props.points !== null && props.points > 0 ? <> {t("rotationPoints", { count: props.points, value: formatNumber(props.points) })}</> : null}
            </p>
          ) : null}

          {ended && session.viewerRelation === "attended" ? (
            <Suspense fallback={null}>
              <CertificateRow sessionId={session.id} locale={locale} />
            </Suspense>
          ) : null}

          {open && booked && props.tasks ? (
            <Suspense fallback={null}>
              <TasksJump tasks={props.tasks} />
            </Suspense>
          ) : null}

          {/* From `lg` the card is the action row: bookmark and share beside the primary (`EventDesktop.dc.html:49-50`). */}
          <div className="hidden items-center gap-2 lg:flex">
            {props.bookmark("icon")}
            {props.share("icon")}
          </div>

          {/* The facts: under the primary on the phone; from `lg` the row's other column, at the row's end
              (`EventDesktop.dc.html:52-56`), so the row stays one row. */}
          {!ended ? (
            <div className="lg:ms-auto lg:max-w-md lg:flex-1 lg:[&_dl]:gap-1 lg:[&_dl]:text-caption">
              <EventMeta session={session} phase={phase} days={props.days} locale={locale} />
            </div>
          ) : null}

          {/* «تنزيل الملصق» (REQ-DSG-027, DEC-178) — for staff and the session's own presenters, through the audited route. */}
          {session.viewerIsStaff || session.viewerIsPresenter ? (
            <div className="lg:basis-full">
              <Suspense fallback={null}>
                <SessionDownload sessionId={session.id} locale={locale} placement="event" />
              </Suspense>
            </div>
          ) : null}

          {session.viewerIsStaff || hostViewSecondary ? (
            <nav aria-label={t("actions.staffHeading")} className="border-t border-edge pt-3 lg:basis-full">
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
        </MomentPart>
      </section>

      {primary || barSecondary ? (
          <ActionBar
            label={t("actionsLabel")}
            hideFrom="lg"
            primary={
              <MomentPart thud="bar" anchor="bar">
                <MomentPart reveal="bar">{control("bar")}</MomentPart>
              </MomentPart>
            }
            secondary={barSecondary}
          />
        ) : null}
    </ReserveMoment>
  );
}

/** The one primary, drawn for the card or the phone's bar — the same answer in both, so they cannot disagree. */
async function Primary({ action, placement, session, slot, points, ratingClosesAt, booked, locale }: ActionCardProps & { action: PrimaryAction; placement: "card" | "bar"; booked: boolean }) {
  if (action === "reserve") return <RsvpReserve {...slot} placement={placement} points={points} />;
  if (action === "calendar") return <AddToCalendar {...slot} placement={placement} />;
  const t = await getTranslations("sessions.event");
  if (action === "checkIn") {
    // «مقعدك محجوز» beside it when a seat is held (N7: a phrase, where the artboard draws it) — never in the bar.
    return <SessionCta state={{ kind: "checkIn", act: { href: `/app/sessions/${session.id}/check-in` } }} label={t("checkIn")} chip={placement === "card" && booked ? t("bookedChip") : undefined} />;
  }
  if (action === "rate") {
    const chip = placement === "card" && ratingClosesAt ? t("untilChip", { value: formatDate(ratingClosesAt, session.timeZone, locale) }) : undefined;
    return <SessionCta state={{ kind: "rate", act: { href: `/app/sessions/${session.id}/rate` } }} label={t("actions.rate")} chip={chip} />;
  }
  return (
    <ButtonLink href={`/app/sessions/${session.id}/host`} variant="primary" size="lg" className="w-full">
      {t("hostView")}
    </ButtonLink>
  );
}

/** «23 من 40 حاضرًا الآن» — a count, never who (A33 rule 3, DEC-206 §4.54); faces only for staff and presenters. */
async function LiveCount({ session, figures, faces }: { session: EventSession; figures: EventFigures; faces: EventAttendeeFace[] }) {
  if (figures.attendedCount === null) return null;
  const t = await getTranslations("sessions.event");
  const count = figures.attendedCount;
  return (
    <div className="flex items-center gap-3">
      <p className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="font-display text-play-md font-extrabold text-signal" dir="ltr">
          {formatNumber(count)}
        </span>
        <span className="text-body-sm font-bold text-fg-heading">
          {session.capacity !== null
            ? t("attendingNowOf", { count: session.capacity, capacity: formatNumber(session.capacity) })
            : t("attendingNow", { count, value: formatNumber(count) })}
        </span>
      </p>
      {faces.length > 0 ? <AttendeeStack label={t("whoAttends")} people={faces.map((f) => ({ memberId: f.memberId, displayName: f.displayName, src: f.avatarUrl, teamColor: f.teamColor }))} countLabel={t("attendedCount", { count, value: formatNumber(count) })} size={24} /> : null}
    </div>
  );
}

async function TasksJump({ tasks }: { tasks: Promise<SlotSummary> }) {
  const [summary, t] = await Promise.all([tasks, getTranslations("sessions.event.actions")]);
  if (!summary.visible) return null;
  const outstanding = summary.outstanding ?? 0;
  const label = t("tasks");
  return (
    // Drawn as a figure, spoken as words: the name starts with the visible label (SC 2.5.3).
    <a
      href="#tasks"
      aria-label={outstanding > 0 ? `${label}، ${t("tasksOutstanding", { count: outstanding, value: formatNumber(outstanding) })}` : undefined}
      className={buttonClass("secondary", "md", "w-full")}
    >
      <span className="flex-1 text-start">{label}</span>
      {outstanding > 0 ? (
        <span aria-hidden="true" className="min-w-6 rounded-pill bg-raised px-1.5 text-center text-caption text-fg-heading">
          {formatNumber(outstanding)}
        </span>
      ) : null}
    </a>
  );
}
