import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { HostClock } from "@/components/checkin/host-clock";
import { HostSwitch } from "@/components/checkin/host-switch";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CheckInDay, HostViewData } from "@/lib/dal/checkin";
import { revokeCodeAction, setCheckInOpenAction } from "../actions";

// SCR-044's code card — beside the figures (REQ-UIX-090, REQ-CHK-001, -007, -015, -016; `AdminAttendance.dc.html`).
//
// ★ It runs the room from the console with the host view's own reads and RPCs, nothing re-derived: the code
// `getHostView()` read (`ensure_check_in_code()`, which issues none outside the window — REQ-CHK-004), the time to
// its rotation counted against the server's read (`HostClock`'s console variant — a number that changes, never a
// motion, REQ-UIX-053), «أبطل» (`revoke_check_in_code()`), and the door (`HostSwitch`, unchanged — the thumb moves
// when the server answers; `set_check_in_open()` owns the ceiling, REQ-CHK-016). Every control posts a form, so each
// works without JavaScript.
//
// ★ The code is in the BODY face, bold and large (DEC-228 §6: the display face is `h1`'s alone). One `<p dir="ltr">`,
// two groups drawn by a gap and no space character, so its text is the six characters the specs read.
//
// States (W21.4): live · before the day · closed by hand · past the ceiling · a day that is not the room's · a
// completed session, where the card becomes the final rate (`finalRate`). A cancelled session draws no card.

const KNOWN_SWITCH = new Set(["not_found", "not_authorized", "not_open", "ceiling_passed", "unknown"]);
const KNOWN_REVOKE = new Set(["not_found", "not_authorized", "no_active_code", "unknown"]);

// ★ The card's share of the row is the PAGE's grid (twice a figure's, and never narrower than its own content from
// `lg`); inside, the code, the countdown, «أبطل» and the door are ONE line from `lg`, as the artboard draws them, and
// wrap below it. The code never breaks and is never clipped (`whitespace-nowrap`, no overflow rule).
const CARD = "col-span-2 flex flex-col justify-center gap-2 rounded-card border border-edge bg-surface p-4 pg:rounded-panel sm:col-span-3 lg:col-span-1";
const LINE = "flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:flex-nowrap";

export async function CodeCard({
  locale,
  sessionId,
  view,
  day,
  finalRate,
  startsAt,
  dayStarted,
  codeUnavailable = false,
  switchError,
  revokeError,
}: {
  locale: Locale;
  sessionId: string;
  /** Null on a completed or archived session, or when the host view's read refused. */
  view: HostViewData | null;
  /** The day the page is showing. */
  day: CheckInDay | null;
  /** Set on a completed or archived session: the card is the session's final rate. */
  finalRate: string | null;
  /** The selected day's start, already formatted in the session's zone. */
  startsAt: string | null;
  dayStarted: boolean;
  /** The host view's read threw — a transient upstream failure. The card says so; the rest of the tab stands. */
  codeUnavailable?: boolean;
  switchError?: string;
  revokeError?: string;
}) {
  const t = await getTranslations({ locale, namespace: "checkin" });
  const heading = "text-caption text-fg-muted";

  if (finalRate !== null) {
    return (
      <section aria-label={t("attendance.figures.finalRate")} className={CARD}>
        <div className="flex flex-col">
          <span className={heading}>{t("attendance.figures.finalRate")}</span>
          <strong className="text-h2 font-bold text-fg-heading">
            <bdi>{finalRate}</bdi>
          </strong>
        </div>
      </section>
    );
  }

  // The room's day — the one whose code the RPC just issued. Another day's card says only where that day stands.
  const roomDay = !!view && !!day && view.day?.id === day.id;
  const dayId = day?.id ?? null;
  const ceilingPassed = !!view?.closesAt && Date.parse(view.closesAt) <= Date.parse(view.readAt);
  const nextChangeAt = view?.rotatesAt ?? (view && day && !dayStarted ? day.startsAt : null);

  return (
    <section aria-label={t("attendance.code.region")} className={CARD}>
      <div className={LINE}>
        {roomDay && view.code ? (
          <>
            <p dir="ltr" className="flex shrink-0 gap-2 whitespace-nowrap text-h1 font-bold leading-none text-fg-heading">
              <span>{view.code.slice(0, 3)}</span>
              <span>{view.code.slice(3)}</span>
            </p>
            <span className="shrink-0 text-caption text-fg-muted">
              <span className="sr-only">{t("attendance.code.rotatesIn")} </span>
              <HostClock
                variant="console"
                sessionId={sessionId}
                readAt={view.readAt}
                rotatesAt={view.rotatesAt}
                nextChangeAt={nextChangeAt}
                graceSeconds={view.graceSeconds}
                listen={view.consoleActive}
              />
            </span>
            <span className="flex-1" />
            <form action={revokeCodeAction.bind(null, locale, sessionId, dayId)} className="shrink-0">
              <SubmitButton variant="secondary" size="sm">
                {t("attendance.code.revoke")}
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <span className="text-label text-fg-heading">
              {codeUnavailable
              ? t("attendance.code.unavailable")
              : !dayStarted && startsAt
                ? t("attendance.code.startsAt", { time: startsAt })
                : ceilingPassed || !roomDay
                  ? t("attendance.code.ended")
                  : t("attendance.code.closed")}
            </span>
            {/* Still listening before the day begins: the code appears the instant it does, and the room's check-ins
                keep the table current. */}
            {view ? (
              <HostClock
                variant="console"
                sessionId={sessionId}
                readAt={view.readAt}
                rotatesAt={null}
                nextChangeAt={roomDay ? nextChangeAt : null}
                graceSeconds={view.graceSeconds}
                listen={view.consoleActive}
              />
            ) : null}
            <span className="flex-1" />
          </>
        )}

        {roomDay && view.consoleActive && !ceilingPassed ? (
          <div className="shrink-0">
            <HostSwitch
              open={view.checkInOpen}
              action={setCheckInOpenAction.bind(null, locale, sessionId, !view.checkInOpen, dayId)}
              label={t("attendance.code.open")}
              noScript={
                <Button type="submit" variant="secondary" size="sm">
                  {view.checkInOpen ? t("host.checkInSwitch.close") : t("host.checkInSwitch.open")}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      {switchError ? (
        <p role="alert" className="text-body-sm text-fg-heading">
          {t(`host.checkInSwitch.error.${KNOWN_SWITCH.has(switchError) ? switchError : "unknown"}`)}
        </p>
      ) : null}
      {revokeError ? (
        <p role="alert" className="text-body-sm text-fg-heading">
          {t(`attendance.code.error.${KNOWN_REVOKE.has(revokeError) ? revokeError : "unknown"}`)}
        </p>
      ) : null}
    </section>
  );
}
