import { getFormatter, getTranslations } from "next-intl/server";
import { getRatingsSummary } from "@/lib/dal/ratings";
import { RateForm } from "./rate-form";

// SCR-015 — rate the session and the presenter. Roles: checked-in attendees
// only (REQ-RAT-001 … REQ-RAT-003, REQ-RAT-006). A presenter reaching this
// URL for their own session sees "not checked in" — REQ-CHK-011/OQ-025
// already keep a presenter from checking in to their own session, so this
// needs no special case of its own; the gate falls out of the check-in
// requirement it already depends on.
export default async function RatePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = await getTranslations("ratings");
  const format = await getFormatter();
  const { eligibility, minAggregate } = await getRatingsSummary(locale, id);

  if (eligibility.reason === "not_completed") {
    return <p className="text-body text-fg-muted">{t("states.notCompleted")}</p>;
  }
  if (eligibility.reason === "not_checked_in") {
    return <p className="text-body text-fg-muted">{t("states.notCheckedIn")}</p>;
  }

  if (!eligibility.eligible) {
    return (
      <>
        <h1 className="text-h1 text-fg-heading">{t("form.title")}</h1>
        <p className="mt-3 text-body text-fg-muted">{t("prompt.closed")}</p>
        {eligibility.existing ? (
          <dl className="mt-5 max-w-md space-y-2">
            <div className="flex justify-between">
              <dt className="text-body-sm text-fg-muted">{t("form.sessionLabel")}</dt>
              <dd className="text-body text-fg-heading">{format.number(eligibility.existing.sessionStars)} / 5</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-body-sm text-fg-muted">{t("form.presenterLabel")}</dt>
              <dd className="text-body text-fg-heading">{format.number(eligibility.existing.presenterStars)} / 5</dd>
            </div>
            {eligibility.existing.comment ? <dd className="text-body text-fg-body">«{eligibility.existing.comment}»</dd> : null}
          </dl>
        ) : null}
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("form.title")}</h1>
      <p className="mt-3 max-w-md text-body-sm text-fg-muted">{t("form.anonymityNotice", { min: minAggregate, value: format.number(minAggregate) })}</p>
      {eligibility.windowClosesAt ? (
        <p className="mt-1 text-body-sm text-fg-muted">
          {t("form.windowClosesAt", { date: format.dateTime(new Date(eligibility.windowClosesAt), { dateStyle: "long" }) })}
        </p>
      ) : null}
      <div className="mt-6">
        <RateForm locale={locale} sessionId={id} checkInId={eligibility.checkInId ?? ""} existing={eligibility.existing} />
      </div>
    </>
  );
}
