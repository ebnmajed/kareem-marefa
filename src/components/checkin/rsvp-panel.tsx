import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData, type RsvpPanelData } from "@/lib/dal/rsvp";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentPart, ReserveCta } from "@/components/sessions/moment-reserve";
import { SessionCta } from "@/components/ui/session-cta";
import { cancelRsvpAction, reserveSeatAction } from "./actions";

// The RsvpPanel slot (TEAM.md §2). REQ-RSV-001, REQ-RSV-005, REQ-RSV-006,
// REQ-RSV-010, REQ-UIX-015, DEC-090.
//
// ★ Renders on `canReserve`/`canCancel` — both derived in `getRsvpPanelData()`
// from `affordancesFor(phase, relation)`, never re-derived here (the
// `getPhotosPageData()` pattern). That is the whole fix for bugs (a) and (b)
// (`16` §5.4.1, DEC-090): outside the `open` phase neither flag is ever true,
// so a `live` session offers no reserve button and an `ended`/`cancelled`/
// `in_progress` session offers no cancel form — no button where there used
// to be a live one. The `ended` read-only outcome moves to
// `attendance-outcome.tsx`; this panel has nothing to say once the session
// isn't `open` any more.
//
// ★ Wave 6 (DEC-130) restyled this file — markup and classes only; every gate
// above is unchanged. NO `<section>` OR `<h2>` OF ITS OWN: the event page's
// action card is the landmark, and it keeps the region name «الحضور»
// `checkin.spec.ts` selects on.
//
// ★ Wave 16 (DEC-195, DEC-197; `sessions` holds this file for the wave) puts
// the panel on `session-cta` (REQ-UIX-033) — presentation only; every gate is
// the one above:
//
//   · BEFORE A SEAT: `reserve`, or `waitlist` once the seat state is `full`,
//     with the capacity chip «27 من 30». It submits through `ReserveMoment`'s
//     `useActionState`, so the reservation's result reaches the one client
//     that pressed and moment 1 plays from it (REQ-UIX-045). Two placements,
//     in the card from `md` and in the phone's bottom bar, so exactly one
//     primary exists at every width (`16` §3 principle 2).
//   · ONCE HELD: `booked` — a fact, not a control: «تم تأكيد حجزك» with the
//     chip, or «على قائمة الانتظار» with «ترتيبك N»; then the calendar the card
//     passes as `between` (`16` §5.4.2's order: status → calendar → cancel);
//     then the cancel, with the late-cancel warning tied to it. The tree's
//     words, never the design's (DEC-197 §7, Q1): the stamp alone says «محجوز».
//   · Never optimistic (REQ-UIX-007, `16` §7.1 layer 4): nothing moves from
//     `reserve` to `booked` on a press; the refreshed page renders it.

type Translate = Awaited<ReturnType<typeof getTranslations<"rsvp">>>;
type TranslateMoment = Awaited<ReturnType<typeof getTranslations<"sessions.moment">>>;

async function load({ sessionId, locale }: SlotProps): Promise<[RsvpPanelData | null, Translate, TranslateMoment]> {
  return Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp"), getTranslations("sessions.moment")]);
}

/** «28 من 30» — taken of capacity, in Western digits; none for an unlimited session. */
function seatsChip(data: RsvpPanelData, tm: TranslateMoment): string | undefined {
  if (data.capacity === null) return undefined;
  return tm("reserveChip", { taken: formatNumber(data.confirmedCount), capacity: formatNumber(data.capacity) });
}

function statusPart(data: RsvpPanelData, t: Translate, tm: TranslateMoment, { sessionId, locale }: SlotProps, between?: ReactNode) {
  if (data.canReserve) {
    const seatsLeft = data.capacity != null ? Math.max(0, data.capacity - data.confirmedCount) : null;
    return (
      <>
        <p className="text-body-sm text-fg-muted">
          {seatsLeft !== null ? t("seatsLeft", { count: seatsLeft, value: formatNumber(seatsLeft) }) : null}
          {data.waitlistCount > 0 ? <> · {t("waitlistLength", { count: data.waitlistCount, value: formatNumber(data.waitlistCount) })}</> : null}
        </p>
        {data.seat === "closed" ? (
          <p role="status" className="text-body text-fg-muted">
            {t("deadlinePassed")}
          </p>
        ) : null}
      </>
    );
  }
  // `canCancel` is the matrix's answer that a seat or a place on the list is held and may be let go.
  if (!data.canCancel) return null;
  const onWaitlist = data.relation === "waitlisted";
  const position = data.myRsvp?.waitlistPosition ?? 0;
  const cancel = {
    label: onWaitlist ? t("leaveWaitlist") : data.cutoffPassed ? t("cancelLate") : t("cancel"),
    act: { action: cancelRsvpAction.bind(null, locale, sessionId) },
    note: !onWaitlist && data.cutoffPassed ? t("lateCancelWarning") : undefined,
  };
  return (
    // ★ Moment 1's anchor from `md`, held back while the ticket plays there and faded in as it leaves — the
    // capacity chip «updates in place» (`moment-reserve.tsx`). A plain `<div>` outside the moment.
    <MomentPart anchor="card" reveal="card">
      <SessionCta
        state={{ kind: "booked", hold: onWaitlist ? "waitlist" : "seat", cancel, between }}
        label={onWaitlist ? tm("waitlistFace") : t("confirmed")}
        chip={onWaitlist ? tm("positionChip", { position: formatNumber(position) }) : seatsChip(data, tm)}
      />
    </MomentPart>
  );
}

function reservePart(data: RsvpPanelData, t: Translate, tm: TranslateMoment, { sessionId, locale }: SlotProps, placement: "card" | "bar") {
  if (!data.canReserve || data.seat === "closed") return null;
  const full = data.seat === "full";
  return (
    <ReserveCta
      kind={full ? "waitlist" : "reserve"}
      label={full ? tm("joinWaitlist") : t("reserve")}
      chip={seatsChip(data, tm)}
      placement={placement}
      action={reserveSeatAction.bind(null, locale, sessionId)}
    />
  );
}

const visible = (data: RsvpPanelData | null): data is RsvpPanelData => Boolean(data && (data.canReserve || data.canCancel));

/** The whole panel, stacked: the status (or the held seat with its cancel), then the reserve form. */
export async function RsvpPanel(props: SlotProps) {
  const [data, t, tm] = await load(props);
  if (!visible(data)) return null;
  return (
    <div className="flex flex-col gap-3">
      {statusPart(data, t, tm, props)}
      {reservePart(data, t, tm, props, "card")}
    </div>
  );
}

/**
 * Seats left and the deadline before a seat is held; once it is held, `session-cta`'s `booked` — the face,
 * `between` (the card's calendar), the cancel.
 */
export async function RsvpStatus({ between, ...props }: SlotProps & { between?: ReactNode }) {
  const [data, t, tm] = await load(props);
  if (!visible(data)) return null;
  return <div className="flex flex-col gap-3">{statusPart(data, t, tm, props, between)}</div>;
}

/**
 * The reserve form alone — the ONE primary action before a seat is held.
 * `card` shows from `md` up; `bar` is the phone's bottom action bar (`16` §6.1
 * note 2). Same gate as the panel, from the same cached read, so the bar can
 * never offer a reservation the panel would not.
 */
export async function RsvpReserve({ placement, ...props }: SlotProps & { placement: "card" | "bar" }) {
  const [data, t, tm] = await load(props);
  if (!visible(data)) return null;
  return reservePart(data, t, tm, props, placement);
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
