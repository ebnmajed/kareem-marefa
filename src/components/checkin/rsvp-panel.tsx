import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData, type RsvpPanelData } from "@/lib/dal/rsvp";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentPart, ReserveCta } from "@/components/sessions/moment-reserve";
import { SessionCta } from "@/components/ui/session-cta";
import { cancelRsvpAction, reserveSeatAction } from "./actions";

// The reservation's part of the event page's action card — written in wave 18 from `Event.dc.html`
// (REQ-UIX-061; `sessions` holds this file for PR B, `DEC-209`). REQ-RSV-001, 005, 006, 010, REQ-UIX-015,
// REQ-UIX-007, DEC-090.
//
// ★ IT DECIDES NOTHING. Every part renders on `canReserve` / `canCancel`, which `getRsvpPanelData()`
// (`checkin`'s, unchanged) derives from `affordancesFor(phase, relation)`. Outside `open` neither is ever true,
// so a live, ended or cancelled session offers no reserve and no cancel; the session's own presenter and a
// session the viewer cannot see get nothing at all.
//
// ★ NO `<section>` AND NO `<h2>`: the action card is the landmark «الحضور».
//
// ★ NEVER OPTIMISTIC (REQ-UIX-007): nothing moves from «احجز» to «محجوز» on a press; the refreshed page
// renders the held seat. Moment 1 plays from the reserve action's own result through `ReserveCta`, which
// submits through the card's `ReserveMoment` (REQ-UIX-045) — this file only places it.
//
// What it draws, by the viewer's standing:
//   · no seat, the deadline open — `session-cta` `reserve`, or `waitlist` once full; in the card with the
//     rule's amount as its chip («+20 عند الحضور», never a literal), in the bar with none (`Event.dc.html:52`,
//     `:122`); and how many wait, when anyone does;
//   · no seat, the deadline passed — «انتهى وقت الحجز لهذه الجلسة» as a status, and no control;
//   · a held seat — `booked`: «تم تأكيد حجزك» with the seats chip, the calendar the card passes as `between`
//     (`16` §5.4.2's order), then «إلغاء الحجز», relabelled and warned after the cut-off, still a form;
//   · a waitlist place — `booked` `hold: "waitlist"`: «على قائمة الانتظار» with «ترتيبك N» (Western digits,
//     inside the chip's `<bdi>`), then «غادر قائمة الانتظار».

type Translate = Awaited<ReturnType<typeof getTranslations<"rsvp">>>;
type TranslateMoment = Awaited<ReturnType<typeof getTranslations<"sessions.moment">>>;
type TranslateEvent = Awaited<ReturnType<typeof getTranslations<"sessions.event">>>;

async function load({ sessionId, locale }: SlotProps): Promise<[RsvpPanelData | null, Translate, TranslateMoment, TranslateEvent]> {
  return Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp"), getTranslations("sessions.moment"), getTranslations("sessions.event")]);
}

const visible = (data: RsvpPanelData | null): data is RsvpPanelData => Boolean(data && (data.canReserve || data.canCancel));

/** «28 من 30» — taken of capacity, in Western digits; none for an unlimited session. */
function seatsChip(data: RsvpPanelData, tm: TranslateMoment): string | undefined {
  if (data.capacity === null) return undefined;
  return tm("reserveChip", { taken: formatNumber(data.confirmedCount), capacity: formatNumber(data.capacity) });
}

function statusPart(data: RsvpPanelData, t: Translate, tm: TranslateMoment, { sessionId, locale }: SlotProps, between?: ReactNode) {
  if (data.canReserve) {
    return (
      <>
        {data.waitlistCount > 0 ? <p className="text-caption text-fg-muted">{t("waitlistLength", { count: data.waitlistCount, value: formatNumber(data.waitlistCount) })}</p> : null}
        {data.seat === "closed" ? (
          <p role="status" className="text-body text-fg-muted">
            {t("deadlinePassed")}
          </p>
        ) : null}
      </>
    );
  }
  if (!data.canCancel) return null;
  const onWaitlist = data.relation === "waitlisted";
  const position = data.myRsvp?.waitlistPosition ?? 0;
  const cancel = {
    label: onWaitlist ? t("leaveWaitlist") : data.cutoffPassed ? t("cancelLate") : t("cancel"),
    act: { action: cancelRsvpAction.bind(null, locale, sessionId) },
    note: !onWaitlist && data.cutoffPassed ? t("lateCancelWarning") : undefined,
  };
  return (
    // Moment 1's anchor from `md`; the face inside it is held back while the ticket plays there and faded in as it
    // leaves. ★ Two parts, not one (DEC-277): the reveal is held at opacity 0, and a ticket rendered inside it was
    // held with it — the desktop event page showed an empty slot where the ticket should rise.
    <MomentPart anchor="card">
      <MomentPart reveal="card">
        <SessionCta
          state={{ kind: "booked", hold: onWaitlist ? "waitlist" : "seat", cancel, between }}
          label={onWaitlist ? tm("waitlistFace") : t("confirmed")}
          chip={onWaitlist ? tm("positionChip", { position: formatNumber(position) }) : seatsChip(data, tm)}
        />
      </MomentPart>
    </MomentPart>
  );
}

function reservePart(data: RsvpPanelData, t: Translate, tm: TranslateMoment, { sessionId, locale }: SlotProps, placement: "card" | "bar", chip: string | undefined) {
  if (!data.canReserve || data.seat === "closed") return null;
  const full = data.seat === "full";
  return (
    <ReserveCta
      kind={full ? "waitlist" : "reserve"}
      label={full ? tm("joinWaitlist") : t("reserve")}
      chip={chip}
      placement={placement}
      action={reserveSeatAction.bind(null, locale, sessionId)}
    />
  );
}

/**
 * The whole panel, stacked — for a surface that is not the event page's card: the seats left, then the
 * status, then the reserve with the seats chip. The event page's card draws its own seats bar instead.
 */
export async function RsvpPanel(props: SlotProps) {
  const [data, t, tm] = await load(props);
  if (!visible(data)) return null;
  const seatsLeft = data.canReserve && data.capacity !== null ? Math.max(0, data.capacity - data.confirmedCount) : null;
  return (
    <div className="flex flex-col gap-3">
      {seatsLeft !== null ? <p className="text-body-sm text-fg-muted">{t("seatsLeft", { count: seatsLeft, value: formatNumber(seatsLeft) })}</p> : null}
      {statusPart(data, t, tm, props)}
      {reservePart(data, t, tm, props, "card", seatsChip(data, tm))}
    </div>
  );
}

/** Before a seat: how many wait and whether the deadline has passed. Once held: `booked` with `between` and the cancel. */
export async function RsvpStatus({ between, ...props }: SlotProps & { between?: ReactNode }) {
  const [data, t, tm] = await load(props);
  if (!visible(data)) return null;
  return <div className="flex flex-col gap-3">{statusPart(data, t, tm, props, between)}</div>;
}

/** The reserve control alone — the primary before a seat is held, in the card and in the phone's bar. */
export async function RsvpReserve({ placement, points = null, ...props }: SlotProps & { placement: "card" | "bar"; points?: number | null }) {
  const [data, t, tm, te] = await load(props);
  if (!visible(data)) return null;
  // The rule's amount on the card (N7: a phrase, where the artboard draws it), nothing in the bar.
  const chip = placement === "card" && points !== null && points > 0 ? te("pointsChip", { value: formatNumber(points) }) : undefined;
  return reservePart(data, t, tm, props, placement, chip);
}

/** The labels moment 1 draws, from the same cached read — the stamp's position is the refreshed one. */
export async function reserveMomentLabels(props: SlotProps) {
  const [data, , tm] = await load(props);
  const position = formatNumber(data?.myRsvp?.waitlistPosition ?? 0);
  return {
    stampBooked: tm("stampBooked"),
    stampWaitlist: tm.rich("stampWaitlist", { position, n: (chunks) => <bdi>{chunks}</bdi> }),
    whisper: { sync: tm("whisperSync"), manual: tm("whisperManual"), waitlist: tm("whisperWaitlist") },
    refused: { deadline_passed: tm("refusedDeadline"), not_open: tm("refusedNotOpen"), unknown: tm("refusedUnknown") },
  };
}
