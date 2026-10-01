import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getHostView, listUncheckedConfirmedRsvps } from "@/lib/dal/checkin";
import type { SessionPhase } from "@/lib/session-status";
import { dayName } from "@/components/checkin/day-name";
import { HostClock } from "@/components/checkin/host-clock";
import { AwakeNote, DimNote, ProjectionRoot, ProjectionToggle } from "@/components/checkin/host-projection";
import { HostSwitch } from "@/components/checkin/host-switch";
import { ManualMark } from "@/components/checkin/manual-mark";
import { formatNumber, formatTime } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { markManuallyAction, revokeCodeAction, setCheckInOpenAction } from "./actions";

// SCR-016 — the host view, rebuilt from `Host.dc.html` (REQ-UIX-062, STORY-UIX-050; `M10a.md` §9).
// Written from the artboard after the old file was deleted (DEC-208). What it had to keep, and why, is
// `docs/plan/notes/checkin.md` § B.2 — among them: the session gate with `?next=`; ★ access decided by
// `ensure_check_in_code()`, never by hiding UI (REQ-CHK-014); no code outside the window, and each
// phase's own sentence (REQ-CHK-004, bug (d)); the day bound at the call site from the code on the
// wall (DEC-119); one-tap revoke (REQ-CHK-007); the switch on a live or pre-flight console, for the
// session's presenter or staff (REQ-CHK-015, -016, DEC-141, DEC-209 D3); marking by hand for staff
// only, with its mandatory reason (REQ-CHK-008); every action working without JavaScript.
//
// ★ New in the rebuild because the requirement always asked for it (REQ-CHK-001, DEC-209): the time
// to the next rotation, and a count that updates live — `HostClock`.
//
// ★ THE CODE IS ONE `<p dir="ltr">`, two groups of three drawn by a gap and no space character, so
// its text is the six characters every spec reads and a rotation is a cut, never a fade. Projection
// grows this same element; it never draws a second one.

const KNOWN_MANUAL_ERRORS = new Set(["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "unknown"]);
const KNOWN_SWITCH_ERRORS = new Set(["not_found", "not_authorized", "not_open", "ceiling_passed", "unknown"]);

/** What stands where the code would — bug (d), 16 §5.4.1 row 6: every phase says something true. */
function noCodeMessageKey(phase: SessionPhase): "notPublished" | "cancelled" | "notStarted" | "ended" {
  switch (phase) {
    case "draft":
    case "pending_schedule":
      return "notPublished";
    case "cancelled":
      return "cancelled";
    case "ended":
      return "ended";
    default:
      // `open` is the pre-flight; a clock-derived `live` whose row is still `published` reads the same.
      return "notStarted";
  }
}

/** Hidden while projecting: the code alone is shown then. */
const HIDE_PROJECTING = "group-data-[projecting]/project:hidden";

export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ revoked?: string; manualSuccess?: string; manualError?: string; memberId?: string; reason?: string; switch?: string; switchError?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale, `/${locale}/app/sessions/${id}/host`);
  const { revoked, manualSuccess, manualError, memberId, reason, switch: switchResult, switchError } = await searchParams;
  const isStaff = session.role === "admin" || session.role === "moderator";

  const [view, t, tDays] = await Promise.all([getHostView(locale, id), getTranslations("checkin"), getTranslations("sessions.days")]);
  // REQ-CHK-014: a member — checked in or not — is refused by the RPC, and sees only this.
  if (!view) {
    return <h1 className="px-4 pt-6 text-h1 text-fg-heading">{t("host.notAuthorized")}</h1>;
  }

  // ★ THE DAY (DEC-119): the code's own, and everything below is that day's. Null at one day.
  const label = dayName({ day: view.day, dayCount: view.dayCount, timeZone: view.timeZone }, tDays, locale);
  const dayId = view.day?.id ?? null;
  // REQ-CHK-008: marking by hand is staff's, on a console the phase allows — never a presenter's.
  const staffConsole = view.consoleActive && isStaff;
  const candidates = staffConsole ? await listUncheckedConfirmedRsvps(locale, id, dayId) : [];
  const manualErrorKey = manualError && KNOWN_MANUAL_ERRORS.has(manualError) ? manualError : manualError ? "unknown" : null;
  const switchErrorKey = switchError && KNOWN_SWITCH_ERRORS.has(switchError) ? switchError : switchError ? "unknown" : null;

  // Awake, listening and counting down only while the day can take attendance and a code is out.
  const live = view.code !== null && view.phase === "live";
  // The next instant the answer changes by itself: the rotation, else the day's start (the pre-flight).
  const dayStart = view.day?.startsAt ?? view.startsAt;
  const nextChangeAt = view.rotatesAt ?? (view.phase === "open" && dayStart && Date.parse(dayStart) > Date.parse(view.readAt) ? dayStart : null);

  const count = formatNumber(view.checkInCount);
  const countHint = [
    view.capacity !== null ? t("host.count.of", { count: view.capacity, value: formatNumber(view.capacity) }) : null,
    view.allowWalkIns && view.walkInCount > 0 ? t("host.count.walkIns", { count: view.walkInCount, value: formatNumber(view.walkInCount) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const switchDescription = [
    view.checkInOpen && view.closesAt ? t("host.checkInSwitch.closesAt", { time: formatTime(view.closesAt, view.timeZone, locale) }) : null,
    view.checkInOpen ? null : t("host.checkInSwitch.closedHint"),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ProjectionRoot live={live} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className={`flex min-w-0 items-center gap-2.5 ${HIDE_PROJECTING}`}>
          <Link
            href={`/app/sessions/${id}`}
            aria-label={t("host.back")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-fg-heading"
          >
            <ArrowIcon direction="back" className="text-[1.125rem]" />
          </Link>
          <h1 className="whitespace-nowrap font-display text-play-sm font-extrabold text-fg-heading">{t("host.title")}</h1>
        </div>
        {/* The toggle is not hidden with the row's start: it stays in reach while projecting. */}
        {view.code ? <ProjectionToggle /> : null}
      </div>

      <p className={`text-center text-caption text-fg-muted ${HIDE_PROJECTING}`}>
        <bdi>{view.title}</bdi>
        {view.venueName ? (
          <>
            {" · "}
            <bdi>{view.venueName}</bdi>
          </>
        ) : null}
      </p>
      {label ? (
        <p className={`text-center text-body-sm text-fg-heading ${HIDE_PROJECTING}`}>
          {view.code || view.phase === "live" ? t("host.dayLine", { day: label }) : t("host.nextDay", { day: label })}
        </p>
      ) : null}

      {revoked ? (
        <div role="status" className={HIDE_PROJECTING}>
          <Panel tone="info">{t("host.revoked")}</Panel>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-3.5 py-6">
        {view.code ? (
          <>
            {/* Projected, six display-face characters and the gap fit the viewport at 19vw: 26vw overflowed 390. */}
            <p dir="ltr" aria-live="polite" className="flex gap-3.5 font-display text-[5.25rem] font-extrabold leading-none text-fg-heading group-data-[projecting]/project:text-[min(19vw,40vh)]">
              <span>{view.code.slice(0, 3)}</span>
              <span>{view.code.slice(3)}</span>
            </p>
            <DimNote>{t("host.project.mayDim")}</DimNote>
            <div className={HIDE_PROJECTING}>
              <HostClock sessionId={id} readAt={view.readAt} rotatesAt={view.rotatesAt} nextChangeAt={nextChangeAt} graceSeconds={view.graceSeconds} listen={live} />
            </div>
          </>
        ) : (
          // REQ-CHK-004 at issuance: no code exists outside the window.
          <div role="status" className="w-full">
            <Panel tone="info" className="text-center">
              {t(`host.${noCodeMessageKey(view.phase)}`)}
            </Panel>
            <HostClock sessionId={id} readAt={view.readAt} rotatesAt={null} nextChangeAt={nextChangeAt} graceSeconds={view.graceSeconds} listen={false} />
          </div>
        )}
        <Stat label={t("host.count.label")} value={count} hint={countHint || undefined} className={`min-w-48 text-center ${HIDE_PROJECTING}`} />
      </div>

      <div className={`flex flex-col gap-2.5 ${HIDE_PROJECTING}`}>
        {view.consoleActive ? (
          <section aria-label={t("host.checkInSwitch.label")} className="rounded-panel border border-edge bg-surface px-3.5 py-1">
            {switchResult === "opened" || switchResult === "closed" ? (
              <div role="status" className="pt-2">
                <Panel tone="info">{t(`host.checkInSwitch.${switchResult}`)}</Panel>
              </div>
            ) : null}
            {switchErrorKey ? (
              <div role="alert" className="pt-2">
                <Panel tone="error">{t(`host.checkInSwitch.error.${switchErrorKey}`)}</Panel>
              </div>
            ) : null}
            <HostSwitch
              open={view.checkInOpen}
              action={setCheckInOpenAction.bind(null, locale, id, !view.checkInOpen, dayId)}
              label={t("host.checkInSwitch.label")}
              description={switchDescription || undefined}
              noScript={
                <Button type="submit" variant="secondary" size="sm" className="mb-2">
                  {view.checkInOpen ? t("host.checkInSwitch.close") : t("host.checkInSwitch.open")}
                </Button>
              }
            />
          </section>
        ) : null}

        {view.code || staffConsole ? (
          // Two equal halves when both actions are offered, as the artboard draws them; one otherwise.
          <div className={`grid gap-2 ${view.code && staffConsole ? "grid-cols-2" : ""}`}>
            {view.code ? (
              // REQ-CHK-007: one tap, a new code at once, never accent — a real action on the room.
              <form action={revokeCodeAction.bind(null, locale, id, dayId)} className="flex">
                <Button type="submit" variant="danger" size="md" className="w-full">
                  {t("host.revoke")}
                </Button>
              </form>
            ) : null}
            {staffConsole ? (
              <ManualMark
                key={`${manualSuccess ?? ""}|${manualError ?? ""}`}
                action={markManuallyAction.bind(null, locale, id, dayId)}
                candidates={candidates}
                memberId={manualError ? memberId : undefined}
                reason={manualError ? reason : undefined}
                error={manualErrorKey ? t(`host.manualError.${manualErrorKey}`) : undefined}
              />
            ) : null}
          </div>
        ) : null}

        {manualSuccess ? (
          <div role="status">
            <Panel tone="info">{t("host.manualSuccess")}</Panel>
          </div>
        ) : null}

        {view.code ? (
          <p className="text-center text-caption text-fg-muted">
            {t("host.footnote.revoke")}
            <AwakeNote>{t("host.footnote.awake")}</AwakeNote>
          </p>
        ) : null}
      </div>
    </ProjectionRoot>
  );
}
