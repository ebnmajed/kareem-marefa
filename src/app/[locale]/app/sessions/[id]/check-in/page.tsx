import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getCheckInScreenData, getConflictTitle } from "@/lib/dal/checkin";
import { AwardState } from "@/components/checkin/award-state";
import { CheckInSessionRow } from "@/components/checkin/check-in-session-row";
import { dayName } from "@/components/checkin/day-name";
import { EarnPanel } from "@/components/checkin/earn-panel";
import { CheckInForm, CheckInSurface } from "@/components/checkin/moment-check-in";
import { CheckInRest } from "@/components/checkin/moment-check-in-rest";
import { formatNumber } from "@/components/sessions/numerals";
import { ActionBar } from "@/components/ui/action-bar";
import { CodeInput } from "@/components/ui/code-input";
import { AlertCircleIcon, CloseIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkInForMoment, submitCheckInForm } from "./actions";

// SCR-014 — check-in, rebuilt from `CheckIn.dc.html` (REQ-UIX-062, STORY-UIX-049; `M10a.md` §8).
// Written from the artboard after the old file was deleted (DEC-208). What it had to keep, and the
// requirement that kept each, is the table in `docs/plan/notes/checkin.md` § B.2 — among them:
// the session gate with `?next=` (REQ-AUT-005); the 404 for a session this member cannot see; the
// eligibility reason IN PLACE of the form, day-aware (REQ-CHK-004, -011, -016, DEC-141, DEC-151);
// the one posted `code` field and the no-JS path (REQ-CHK-003, DEC-186 §6); the code carried back
// after a refusal (DEC-149 §1); moment 2 from the check-in's own result and its static state
// (REQ-UIX-046, DEC-195 §2.1 — the mechanism is `moment-check-in.tsx`, kept by DEC-209); the award
// after the form (REQ-CHK-018, DEC-174 Q6).
//
// ★ A REFUSED CODE DOES NOT MOVE (REQ-UIX-046, DEC-206 §4.75 — the owner's ruling is pending). It is
// answered by the boxes' border, the glyph and the sentence, under the boxes: the artboard's own
// reduced-motion form, and the only form this screen has.
//
// ★ Used standing, one-handed, reading six characters across a room: the code is the screen's
// middle, the one action is at the thumb, and nothing streams in front of the input.

const KNOWN_ERRORS = new Set(["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "check_in_closed", "reservation_required", "invalid_code", "overlap", "unknown"]);
/** Three refusals read differently inside a workshop: «انتهت الجلسة» is wrong while day 3 is ahead. */
const DAY_AWARE = new Set(["not_started", "session_ended", "check_in_closed"]);
const CODE_LENGTH = 6;
const ERROR_ID = "check-in-error";

const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ success?: string; already?: string; error?: string; code?: string; conflict?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSession(locale, `/${locale}/app/sessions/${id}/check-in`);
  const [data, t, tDays] = await Promise.all([getCheckInScreenData(locale, id), getTranslations("checkin"), getTranslations("sessions.days")]);
  if (!data) notFound();

  const { success, already, error, code, conflict } = await searchParams;
  const errorKey = error && KNOWN_ERRORS.has(error) ? error : error ? "unknown" : null;
  // REQ-CHK-013: the refusal names the session it collides with — when this member may see it.
  const conflictTitle = errorKey === "overlap" && conflict ? await getConflictTitle(locale, conflict) : null;

  // The member is never ASKED which day: `check_in()` resolves it from the code. The screen says which.
  const label = dayName({ day: data.day, dayCount: data.dayCount, timeZone: data.timeZone }, tDays, locale);
  const say = (key: string): ReactNode => {
    if (key === "overlap" && conflictTitle && conflict) {
      return t.rich("error.overlap_named", {
        title: conflictTitle,
        bdi,
        link: (chunks) => (
          <Link href={`/app/sessions/${conflict}`} className="underline underline-offset-4">
            {chunks}
          </Link>
        ),
      });
    }
    return label && DAY_AWARE.has(key) ? t(`error.${key}_day`, { day: label }) : t(`error.${key}`);
  };

  // REQ-CHK-018: what this session has earned the member, read on every render and streamed — the
  // room's most time-critical input never waits on a points read. It renders nothing when there is
  // nothing to say.
  const award = (
    <Suspense fallback={null}>
      <AwardState sessionId={id} locale={locale} variant="section" />
    </Suspense>
  );

  const positions = Array.from({ length: CODE_LENGTH }, (_, i) => t("codePosition", { position: formatNumber(i + 1), total: formatNumber(CODE_LENGTH) }));
  // The org's rotation, in whole minutes when it is whole minutes (DEC-206 §4.76) — never «10».
  const minutes = data.rotationSeconds % 60 === 0 ? data.rotationSeconds / 60 : null;
  const rotation =
    minutes !== null
      ? t.rich("rules.rotationMinutes", { count: minutes, value: formatNumber(minutes), bdi })
      : t.rich("rules.rotationSeconds", { count: data.rotationSeconds, value: formatNumber(data.rotationSeconds), bdi });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex items-center gap-2.5">
        <Link
          href={`/app/sessions/${id}`}
          aria-label={t("close")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-fg-heading"
        >
          <CloseIcon className="text-[1.125rem]" />
        </Link>
        <h1 className="font-display text-play-sm font-extrabold text-fg-heading">{t("title")}</h1>
      </div>

      <CheckInSessionRow locale={locale} sessionId={id} title={data.title} phase={data.phase} venueName={data.venueName} startsAt={data.startsAt} timeZone={data.timeZone} />
      {label ? <p className="text-body-sm text-fg-heading">{t("dayLine", { day: label })}</p> : null}

      {data.ineligibleReason ? (
        <>
          {/* No form to fill: the reason leads, and «what you earned» follows — both true tomorrow. */}
          <div role="status">
            <Panel tone="info" className="text-body text-fg-heading">
              {say(data.ineligibleReason)}
            </Panel>
          </div>
          {award}
        </>
      ) : (
        <>
          {already ? (
            <div role="status">
              <Panel tone="info" className="text-body text-fg-heading">
                {t("alreadyCheckedIn")}
              </Panel>
            </div>
          ) : null}
          <CheckInSurface
            announce={Boolean(success)}
            // ★ NOT behind `Suspense`: a streamed boundary is swapped in by a script, so without JS a
            // `?success=1` would show nothing. A checked-in member has no form to wait for.
            rest={data.checkedInToday ? <CheckInRest sessionId={id} locale={locale} arrivedAt={data.arrivedAt} timeZone={data.timeZone} teamColor={data.teamColor} /> : null}
          >
            {/* `noValidate`: the refusal below is the app's own sentence (7f4809f). The form posts
                `submitCheckInForm` without JS and `checkInForMoment` once hydrated. */}
            <CheckInForm action={submitCheckInForm.bind(null, locale, id)} momentAction={checkInForMoment.bind(null, locale, id)} className="flex flex-1 flex-col justify-center gap-4 py-6">
              {/* ★ REQ-UIX-035: the prompt IS the group's visible label; each box is named by its
                  position; the posted field is `code`, as it always was. */}
              <CodeInput
                id="code-0"
                name="code"
                align="center"
                label={t("ready")}
                positionLabels={positions}
                defaultValue={code}
                invalid={errorKey !== null}
                aria-describedby={errorKey ? ERROR_ID : undefined}
              />
              {errorKey ? (
                <div role="alert" id={ERROR_ID} className="flex items-start justify-center gap-2 text-center text-body-sm text-error pg-dark:text-error-on-dark">
                  <AlertCircleIcon className="mt-[0.3em] shrink-0" />
                  <span>{say(errorKey)}</span>
                </div>
              ) : null}

              <p className="text-center text-caption text-fg-muted">
                {rotation}
                {data.allowWalkIns ? <> {t("rules.walkIns")}</> : null}
              </p>

              <Suspense fallback={null}>
                <EarnPanel sessionId={id} locale={locale} allDays={data.requireAllDays && data.dayCount > 1} />
              </Suspense>
              {award}

              <ActionBar label={t("barLabel")} primary={<SubmitButton className="w-full">{t("submit")}</SubmitButton>} note={t("note")} />
            </CheckInForm>
          </CheckInSurface>
        </>
      )}
    </div>
  );
}
