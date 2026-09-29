import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getCheckInScreenData } from "@/lib/dal/checkin";
import { AwardState } from "@/components/checkin/award-state";
import { dayName } from "@/components/checkin/day-name";
import { CheckInForm, CheckInSurface } from "@/components/checkin/moment-check-in";
import { CheckInRest } from "@/components/checkin/moment-check-in-rest";
import { formatNumber } from "@/components/sessions/numerals";
import { CodeInput } from "@/components/ui/code-input";
import { Panel } from "@/components/ui/panel";
import { PlayScope } from "@/components/ui/scope";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkInForMoment, submitCheckInForm } from "./actions";

// SCR-014 — check-in (REQ-CHK-003, REQ-CHK-006, REQ-CHK-010, REQ-CHK-011,
// REQ-UIX-015, DEC-090). "The most operationally important input in the
// product" (09): used standing, one-handed, under time pressure, reading six
// characters off a screen across a room.
//
// ★ Bug (c) fix (16 §5.4.1 row 4b): this used to render the code form for
// ANY session id — no title, no phase read, no RSVP read — and the member
// found out after typing six characters. `getCheckInScreenData()` reads the
// session first; when `canAttemptCheckIn` is false, the reason renders IN
// PLACE OF the form. The RPC stays authoritative (submitCheckInForm still
// calls it and still handles every one of its refusals) — this screen just
// stops lying before the member starts typing.
//
// ★ Wave 16 (DEC-195 §1.1, REQ-UIX-046): the screen's content is the
// playground's dark scope — never itself transformed — and moment 2 plays on it
// from the check-in's own result (`moment-check-in.tsx`). A member checked in to
// the day this screen is about sees the static state: the coin at rest and the
// three lines, in place of a form they have no use for.
const KNOWN_ERRORS = new Set(["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "check_in_closed", "reservation_required", "invalid_code", "overlap", "unknown"]);
const CODE_LENGTH = 6;
const ERROR_ID = "check-in-error";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ success?: string; already?: string; error?: string; code?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSession(locale, `/${locale}/app/sessions/${id}/check-in`);
  const [data, t, tDays] = await Promise.all([getCheckInScreenData(locale, id), getTranslations("checkin"), getTranslations("sessions.days")]);
  if (!data) notFound();

  const { success, already, error, code } = await searchParams;
  const errorKey = error && KNOWN_ERRORS.has(error) ? error : error ? "unknown" : null;

  // ★ THE DAY (DEC-119), null at one — so a talk reads exactly as it did.
  // The member is never ASKED which day: the code belongs to one, and
  // `check_in()` resolves it from the code. The screen only SAYS which, which
  // is the honest half of not asking.
  const label = dayName({ day: data.day, dayCount: data.dayCount, timeZone: data.timeZone }, tDays, locale);

  // Three refusals read differently inside a workshop: «انتهت الجلسة» is wrong
  // when day 3 is still ahead. The envelope status the RPC returns is
  // unchanged (contract 4) — only the words are the day's, and only when
  // there is a day to name.
  const DAY_AWARE = new Set(["not_started", "session_ended", "check_in_closed"]);
  const say = (key: string) => (label && DAY_AWARE.has(key) ? t(`error.${key}_day`, { day: label }) : t(`error.${key}`));

  // ★ REQ-CHK-018: what this session has earned the member, read from the data
  // on every render — so the reload, and tomorrow's visit, say what the moment
  // after the code said. It renders nothing unless there is something to say.
  // Streamed: the room's most time-critical input never waits on a points read.
  const award = (
    <Suspense fallback={null}>
      <AwardState sessionId={id} locale={locale} variant="section" />
    </Suspense>
  );

  const positions = Array.from({ length: CODE_LENGTH }, (_, i) => t("codePosition", { position: formatNumber(i + 1), total: formatNumber(CODE_LENGTH) }));

  return (
    <PlayScope className="rounded-card px-4 py-6">
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-1 text-body-sm text-fg-muted">
        <bdi>{data.title}</bdi>
      </p>
      {label ? <p className="mt-1 text-body-sm text-fg-heading">{t("dayLine", { day: label })}</p> : null}

      {data.ineligibleReason ? (
        <div role="status">
          <Panel tone="info" className="mt-4 max-w-prose text-body text-fg-heading">
            {say(data.ineligibleReason)}
          </Panel>
        </div>
      ) : null}
      {/* No form to fill: the state follows the reason — «the window has
          closed» and «what you earned» are both true tomorrow. */}
      {data.ineligibleReason ? award : null}
      {data.ineligibleReason ? null : (
        <>
          {already ? (
            <div role="status">
              <Panel tone="info" className="mt-4 text-body text-fg-heading">
                {t("alreadyCheckedIn")}
              </Panel>
            </div>
          ) : null}
          <CheckInSurface
            announce={Boolean(success)}
            rest={
              data.checkedInToday ? (
                <Suspense fallback={null}>
                  <CheckInRest sessionId={id} locale={locale} arrivedAt={data.arrivedAt} timeZone={data.timeZone} teamColor={data.teamColor} />
                </Suspense>
              ) : null
            }
          >
            <p className="mt-2 max-w-prose text-body text-fg-muted">{t("ready")}</p>
            {errorKey ? (
              <div role="alert" id={ERROR_ID}>
                <Panel tone="error" className="mt-4 text-body text-fg-heading">
                  {say(errorKey)}
                </Panel>
              </div>
            ) : null}

            {/* `noValidate`: renders `errorKey`'s own Panel above (the app's
                Arabic error, post-submit) — content's bug class (7f4809f):
                without it, a native-blocking field would silently stop the
                submit and neither this banner nor the RPC's own refusal
                would ever run. The form posts `submitCheckInForm` without JS
                and `checkInForMoment` once hydrated (moment-check-in.tsx). */}
            <CheckInForm action={submitCheckInForm.bind(null, locale, id)} momentAction={checkInForMoment.bind(null, locale, id)} className="mt-8 max-w-sm space-y-4">
              {/* ★ REQ-UIX-035 (DEC-195 §2.4): the group is named by its visible
                  label, each box by its position, and a refusal is tied to the
                  boxes — the Panel above says it, once. The posted field is
                  `code`, as it always was. */}
              <CodeInput
                id="code-0"
                name="code"
                label={t("codeLabel")}
                positionLabels={positions}
                defaultValue={code}
                invalid={errorKey !== null}
                aria-describedby={errorKey ? ERROR_ID : undefined}
              />
              <SubmitButton className="w-full">{t("submit")}</SubmitButton>
            </CheckInForm>

            {award}
          </CheckInSurface>
        </>
      )}
    </PlayScope>
  );
}
