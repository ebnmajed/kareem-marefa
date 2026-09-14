import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData } from "@/lib/dal/rsvp";
import { cancelRsvpAction, reserveSeatAction } from "./actions";

// The RsvpPanel slot (TEAM.md §2). REQ-RSV-001, REQ-RSV-005, REQ-RSV-006,
// REQ-RSV-010. A presenter of the session never sees this — they check
// attendance from the host view, not the RSVP panel (REQ-CHK-011's
// presenter/attendee split starts here).
export async function RsvpPanel({ sessionId, locale }: SlotProps) {
  const [data, t] = await Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp")]);
  if (!data || data.isPresenter) return null;
  // Nothing to reserve on a session that was never published, and no
  // history to show either — the panel simply isn't part of the page yet.
  if (data.state !== "published" && !data.myRsvp) return null;

  const { deadlinePassed, cutoffPassed } = data;
  const seatsLeft = data.capacity != null ? Math.max(0, data.capacity - data.confirmedCount) : null;
  const status = data.myRsvp?.status;
  const holdsOrWaits = status === "confirmed" || status === "waitlisted";

  const buttonClass = "mt-4 inline-flex h-12 items-center rounded-field px-7 text-label";
  const primaryButton = `${buttonClass} bg-navy-950 text-white hover:bg-navy-900`;
  const secondaryButton = `${buttonClass} border border-edge-strong text-fg-heading hover:bg-silver-100`;

  return (
    <section aria-labelledby="rsvp-heading" className="mt-8 rounded-field border border-edge bg-canvas p-5">
      <h2 id="rsvp-heading" className="text-h3 text-fg-heading">
        {t("title")}
      </h2>

      {!holdsOrWaits ? (
        <>
          <p className="mt-2 text-body text-fg-muted">
            {seatsLeft !== null ? t("seatsLeft", { count: seatsLeft }) : null}
            {data.waitlistCount > 0 ? <> · {t("waitlistLength", { count: data.waitlistCount })}</> : null}
          </p>
          {deadlinePassed ? (
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
      ) : status === "waitlisted" ? (
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
          {cutoffPassed ? <p className="mt-2 text-caption text-fg-muted">{t("lateCancelWarning")}</p> : null}
          <form action={cancelRsvpAction.bind(null, locale, sessionId)}>
            <button type="submit" className={secondaryButton}>
              {cutoffPassed ? t("cancelLate") : t("cancel")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
