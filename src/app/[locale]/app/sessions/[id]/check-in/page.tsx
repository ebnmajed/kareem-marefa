import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getCheckInScreenData } from "@/lib/dal/checkin";
import { CodeInput } from "@/components/checkin/code-input";
import { dayName } from "@/components/checkin/day-name";
import { Panel } from "@/components/ui/panel";
import { submitCheckInForm } from "./actions";

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
const KNOWN_ERRORS = new Set(["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "check_in_closed", "reservation_required", "invalid_code", "overlap", "unknown"]);

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

  return (
    <>
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
      ) : (
        <>
          <p className="mt-2 max-w-prose text-body text-fg-muted">{t("ready")}</p>

          {success ? (
            <div role="status">
              <Panel tone="info" className="mt-4 text-body text-fg-heading">
                {t("success")}
              </Panel>
            </div>
          ) : null}
          {already ? (
            <div role="status">
              <Panel tone="info" className="mt-4 text-body text-fg-heading">
                {t("alreadyCheckedIn")}
              </Panel>
            </div>
          ) : null}
          {errorKey ? (
            <div role="alert">
              <Panel tone="error" className="mt-4 text-body text-fg-heading">
                {say(errorKey)}
              </Panel>
            </div>
          ) : null}

          {/* `noValidate`: renders `errorKey`'s own Panel below (the app's
              Arabic error, post-submit) — content's bug class (7f4809f):
              without it, a native-blocking field would silently stop the
              submit and neither this banner nor the RPC's own refusal
              would ever run. No `required` field exists on this form
              today (`CodeInput` has none), but the rule is "renders an
              app-side error", not "has a blocking field right now". */}
          <form action={submitCheckInForm.bind(null, locale, id)} noValidate className="mt-8 max-w-sm space-y-4">
            <div>
              <label id="code-label" htmlFor="code-0" className="text-label text-fg-heading">
                {t("codeLabel")}
              </label>
              <div className="mt-1">
                <CodeInput id="code-0" name="code" defaultValue={code} />
              </div>
            </div>
            <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-field bg-navy-950 px-7 text-label text-white hover:bg-navy-900">
              {t("submit")}
            </button>
          </form>
        </>
      )}
    </>
  );
}
