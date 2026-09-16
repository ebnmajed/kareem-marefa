import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData, type RsvpPanelData } from "@/lib/dal/rsvp";
import { formatNumber } from "@/components/sessions/numerals";
import { SubmitButton } from "@/components/ui/submit-button";
import { Panel } from "@/components/ui/panel";
import { CheckCircleIcon } from "@/components/ui/icons";
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
// above is unchanged. What moved:
//
//   · NO `<section>` OR `<h2>` OF ITS OWN. The event page's action card is the
//     landmark, and it keeps the region name «الحضور» `checkin.spec.ts`
//     selects on.
//   · THE PANEL IS ALSO THREE PARTS — status, the reserve form, the cancel
//     form — so the card can put the ONE primary action between the status and
//     the cancel (`16` §5.4.2's two-state card: «تم تأكيد حجزك», then «أضِف إلى
//     تقويمك», then «إلغاء الحجز»). Ordering them with CSS instead would move the
//     buttons on screen and not in the tab order. `RsvpPanel` still renders all
//     three stacked, and every part reads the same request-cached data.
//   · The reserve form has two placements: in the card from `md` up, and in the
//     phone's bottom action bar below it — the bar is inside the same region, so
//     exactly one «احجز مقعدك» exists at every width (`16` §3 principle 2).
//   · Buttons are `ui/submit-button`: a reservation in flight keeps its label
//     and shows it is working (REQ-UIX-007). A seat is contended, so the answer
//     is never optimistic (`16` §7.1 layer 4).

type Translate = Awaited<ReturnType<typeof getTranslations<"rsvp">>>;

async function load({ sessionId, locale }: SlotProps): Promise<[RsvpPanelData | null, Translate]> {
  return Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp")]);
}

function statusPart(data: RsvpPanelData, t: Translate) {
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
  if (data.relation === "waitlisted") {
    return (
      <p className="text-body text-fg-heading">
        <bdi>{t("onWaitlist", { position: data.myRsvp!.waitlistPosition ?? 0 })}</bdi>
      </p>
    );
  }
  return (
    <>
      <div role="status">
        <Panel tone="success" className="flex items-center gap-2.5 px-3.5 py-3 text-body font-medium text-success">
          <CheckCircleIcon className="text-[1.25rem]" />
          <span>{t("confirmed")}</span>
        </Panel>
      </div>
      {data.cutoffPassed ? <p className="text-caption text-fg-muted">{t("lateCancelWarning")}</p> : null}
    </>
  );
}

function reservePart(data: RsvpPanelData, t: Translate, { sessionId, locale }: SlotProps, placement: "card" | "bar") {
  if (!data.canReserve || data.seat === "closed") return null;
  return (
    <form action={reserveSeatAction.bind(null, locale, sessionId)} className={placement === "card" ? "hidden md:block" : undefined}>
      <SubmitButton size="lg" className="w-full">
        {t("reserve")}
      </SubmitButton>
    </form>
  );
}

function secondaryPart(data: RsvpPanelData, t: Translate, { sessionId, locale }: SlotProps) {
  if (data.canReserve || !data.canCancel) return null;
  const label = data.relation === "waitlisted" ? t("leaveWaitlist") : data.cutoffPassed ? t("cancelLate") : t("cancel");
  return (
    <form action={cancelRsvpAction.bind(null, locale, sessionId)}>
      <SubmitButton variant="secondary" size="md" className="w-full">
        {label}
      </SubmitButton>
    </form>
  );
}

const visible = (data: RsvpPanelData | null): data is RsvpPanelData => Boolean(data && (data.canReserve || data.canCancel));

/** The whole panel, stacked: status, the reserve form, the cancel form. */
export async function RsvpPanel(props: SlotProps) {
  const [data, t] = await load(props);
  if (!visible(data)) return null;
  return (
    <div className="flex flex-col gap-3">
      {statusPart(data, t)}
      {reservePart(data, t, props, "card")}
      {secondaryPart(data, t, props)}
    </div>
  );
}

/** Seats left, the deadline, the waitlist position or «تم تأكيد حجزك». */
export async function RsvpStatus(props: SlotProps) {
  const [data, t] = await load(props);
  if (!visible(data)) return null;
  return <div className="flex flex-col gap-3">{statusPart(data, t)}</div>;
}

/**
 * The reserve form alone — the ONE primary action before a seat is held.
 * `card` shows from `md` up; `bar` is the phone's bottom action bar (`16` §6.1
 * note 2). Same gate as the panel, from the same cached read, so the bar can
 * never offer a reservation the panel would not.
 */
export async function RsvpReserve({ placement, ...props }: SlotProps & { placement: "card" | "bar" }) {
  const [data, t] = await load(props);
  if (!visible(data)) return null;
  return reservePart(data, t, props, placement);
}

/** «إلغاء الحجز» / «غادر قائمة الانتظار» — below the primary, never beside it. */
export async function RsvpSecondary(props: SlotProps) {
  const [data, t] = await load(props);
  if (!visible(data)) return null;
  return secondaryPart(data, t, props);
}
