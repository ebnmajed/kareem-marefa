import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StarDisplay } from "@/components/event/star-rating";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { Locale } from "@/i18n/routing";
import { getRatePageData } from "@/lib/dal/ratings";
import { getSessionHeading } from "@/lib/dal/sessions";
import { getSurveyForMember } from "@/lib/dal/surveys";
import { RateForm } from "./rate-form";

// SCR-015 · /app/sessions/[id]/rate — rate the session and the presenter
// (REQ-RAT-001 … REQ-RAT-004, REQ-RAT-006), on the M9 system for wave 7
// (DEC-137, DEC-141). RATINGS ONLY — the survey is not this wave, and nothing
// from `Survey.dc.html` (SCR-064, the staff results page) is on this screen.
//
// Roles: checked-in attendees. A presenter reaching this URL for their own
// session sees "not checked in" — REQ-CHK-011 already keeps a presenter from
// checking in to their own session, so the gate falls out of the requirement
// it depends on. The screen explains; `ratings_write_self` decides.
//
// The states, in the order the page tests them:
//   · an id the viewer cannot see       → notFound(), not a rule about a session
//                                          that is not there for them
//   · not completed / not checked in    → the reason and the way back
//   · the window has closed             → the rating, read-only, or «أُغلق»
//   · open                              → the promise, the window, the form —
//                                          pre-filled when there is a rating to edit
//   · `?rated=1`                        → a receipt above the (pre-filled) form
//
// ★ `16` §9.2a was read before this file was touched: nothing here writes
// `ratings.submitted_at`, and the page shows no time a rating was made.

export default async function RatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ rated?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { rated } = await searchParams;

  const [heading, data, survey, t, tSurvey, tEvent, tUi] = await Promise.all([
    getSessionHeading(locale, id),
    getRatePageData(locale, id),
    // ★ `null` for a session with no survey — REQ-SUR-001's «shows nothing
    // about one, anywhere» is the absence of a row, not a flag to read.
    getSurveyForMember(locale, id),
    getTranslations("ratings"),
    getTranslations("survey.rate"),
    getTranslations("sessions.event"),
    getTranslations("ui.pageHeader"),
  ]);
  if (!heading) notFound();

  const { eligibility, minAggregate, timeZone } = data;
  const sessionHref = `/app/sessions/${heading.id}`;
  const back = { label: t("form.backToSession"), href: sessionHref };

  const header = (
    <PageHeader
      breadcrumb={[
        { href: "/app/sessions", label: tEvent("breadcrumbRoot") },
        { href: sessionHref, label: heading.title },
      ]}
      breadcrumbLabel={tUi("breadcrumb")}
      title={t("form.title")}
      // The session is named in the breadcrumb, bidi-isolated there; its date is the one thing to add.
      description={heading.startsAt ? formatDate(heading.startsAt, heading.timeZone, locale) : undefined}
    />
  );

  if (eligibility.reason === "not_completed" || eligibility.reason === "not_checked_in") {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        {header}
        <EmptyState title={eligibility.reason === "not_completed" ? t("states.notCompleted") : t("states.notCheckedIn")} action={back} />
      </div>
    );
  }

  if (!eligibility.eligible) {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        {header}
        <Panel tone="ended">
          <p className="text-label text-fg-heading">{t("prompt.closed")}</p>
          {eligibility.existing ? (
            <dl className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-body-sm text-fg-muted">{t("form.sessionLabel")}</dt>
                <dd>
                  <StarDisplay value={eligibility.existing.sessionStars} label={t("form.sessionLabel")} />
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-body-sm text-fg-muted">{t("form.presenterLabel")}</dt>
                <dd>
                  <StarDisplay value={eligibility.existing.presenterStars} label={t("form.presenterLabel")} />
                </dd>
              </div>
              {eligibility.existing.comment ? (
                <div>
                  <dt className="text-body-sm text-fg-muted">{t("form.commentLabel")}</dt>
                  <dd className="mt-1 whitespace-pre-line text-body text-fg-body">
                    <bdi>{eligibility.existing.comment}</bdi>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </Panel>
        <div>
          <ButtonLink href={sessionHref} variant="secondary" size="md">
            {t("form.backToSession")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      {header}

      {rated && eligibility.existing ? (
        // News about the member's own act: a status, not an alert.
        <div role="status">
          <Panel tone="success">
            {/* The survey's receipt says both things happened; a session with no
                survey says exactly what it said before (REQ-SUR-001). */}
            <p className="text-label text-fg-heading">{survey?.answered ? tSurvey("sent") : t("form.submitted")}</p>
            <p className="mt-1 text-body-sm text-fg-body">{t("form.submittedBody")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <StarDisplay value={eligibility.existing.sessionStars} label={t("form.sessionLabel")} />
              <StarDisplay value={eligibility.existing.presenterStars} label={t("form.presenterLabel")} />
            </div>
            <div className="mt-4">
              <ButtonLink href={sessionHref} variant="secondary" size="md">
                {t("form.backToSession")}
              </ButtonLink>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* The promise, honestly — including the admin exception (SCR-015's
          note, REQ-RAT-005): a promise that omits the exception is not one. */}
      <Panel tone="info">
        <p className="text-body-sm text-fg-body">{t("form.anonymityNotice", { min: minAggregate, value: formatNumber(minAggregate) })}</p>
        {eligibility.windowClosesAt ? (
          <p className="mt-2 text-body-sm text-fg-muted">{t("form.windowClosesAt", { date: formatDate(eligibility.windowClosesAt, timeZone, locale) })}</p>
        ) : null}
      </Panel>

      <RateForm locale={locale as Locale} sessionId={heading.id} checkInId={eligibility.checkInId ?? ""} existing={eligibility.existing} survey={survey} />
    </div>
  );
}
