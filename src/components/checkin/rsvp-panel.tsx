import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData } from "@/lib/dal/rsvp";
import { getOrgNumerals } from "@/lib/dal/designer";
import { formatNumber } from "@/components/sessions/numerals";
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
export async function RsvpPanel({ sessionId, locale }: SlotProps) {
  // REQ-INT-006: the counts print with the org's numerals, never ICU's `#` (DEC-056).
  const [data, t, numerals] = await Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp"), getOrgNumerals(locale)]);
  if (!data || (!data.canReserve && !data.canCancel)) return null;

  const seatsLeft = data.capacity != null ? Math.max(0, data.capacity - data.confirmedCount) : null;

  const buttonClass = "mt-4 inline-flex h-12 items-center rounded-field px-7 text-label";
  const primaryButton = `${buttonClass} bg-navy-950 text-white hover:bg-navy-900`;
  const secondaryButton = `${buttonClass} border border-edge-strong text-fg-heading hover:bg-silver-100`;

  return (
    <section aria-labelledby="rsvp-heading" className="mt-8 rounded-field border border-edge bg-canvas p-5">
      <h2 id="rsvp-heading" className="text-h3 text-fg-heading">
        {t("title")}
      </h2>

      {data.canReserve ? (
        <>
          <p className="mt-2 text-body text-fg-muted">
            {seatsLeft !== null ? t("seatsLeft", { count: seatsLeft, value: formatNumber(seatsLeft, numerals) }) : null}
            {data.waitlistCount > 0 ? <> · {t("waitlistLength", { count: data.waitlistCount, value: formatNumber(data.waitlistCount, numerals) })}</> : null}
          </p>
          {data.seat === "closed" ? (
            <p role="status" className="mt-3 text-body text-fg-muted">
              {t("deadlinePassed")}
            </p>
          ) : (
            <form action={reserveSeatAction.bind(null, locale, sessionId)}>
              <button type="submit" className={primaryButton}>
                {t("reserve")}
              </button>
            </form>
          )}
        </>
      ) : data.relation === "waitlisted" ? (
        <>
          <p className="mt-2 text-body text-fg-heading">
            <bdi>{t("onWaitlist", { position: data.myRsvp!.waitlistPosition ?? 0 })}</bdi>
          </p>
          <form action={cancelRsvpAction.bind(null, locale, sessionId)}>
            <button type="submit" className={secondaryButton}>
              {t("leaveWaitlist")}
            </button>
          </form>
        </>
      ) : (
        <>
          <p role="status" className="mt-2 text-body text-fg-heading">
            {t("confirmed")}
          </p>
          {data.cutoffPassed ? <p className="mt-2 text-caption text-fg-muted">{t("lateCancelWarning")}</p> : null}
          <form action={cancelRsvpAction.bind(null, locale, sessionId)}>
            <button type="submit" className={secondaryButton}>
              {data.cutoffPassed ? t("cancelLate") : t("cancel")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
