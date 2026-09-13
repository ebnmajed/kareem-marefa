import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { SlotProps } from "@/components/sessions/slots";
import { getRatingsSummary } from "@/lib/dal/ratings";
import { formatNumber } from "@/components/sessions/numerals";

// The `Ratings` slot (TEAM.md §2, SCR-012 item 10): a SUMMARY, not the form
// — SCR-015 (`app/sessions/[id]/rate`) is the form, this is the prompt or
// the presenter's aggregate that sends a member there. Renders nothing
// before completion for anyone but the presenter/staff, and nothing at all
// for a member who never checked in (SCR-012: "for checked-in attendees
// only") — the CTA appearing at all is already the signal.
export async function Ratings({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("ratings");
  const { eligibility, isPresenter, isStaff, aggregate, countForWithheld, minAggregate, numerals } = await getRatingsSummary(locale, sessionId);

  const showPresenterBlock = (isPresenter || isStaff) && eligibility.reason !== "not_completed";
  const showRaterBlock = !isPresenter && (eligibility.reason === null || eligibility.reason === "window_closed" || Boolean(eligibility.existing));

  if (!showPresenterBlock && !showRaterBlock) return null;

  return (
    <section aria-labelledby="event-ratings-heading">
      <h2 id="event-ratings-heading" className="text-h2 text-fg-heading">
        {t("section.heading")}
      </h2>

      {showPresenterBlock ? (
        <div className="mt-3">
          <h3 className="text-label text-fg-heading">{t("presenter.heading")}</h3>
          {aggregate ? (
            <div className="mt-2">
              <div className="flex gap-6">
                <p>
                  <span className="block text-body-sm text-fg-muted">{t("presenter.sessionAvg")}</span>
                  <span className="text-h3 text-fg-heading">{formatNumber(aggregate.sessionAvg ?? 0, numerals)}</span>
                </p>
                <p>
                  <span className="block text-body-sm text-fg-muted">{t("presenter.presenterAvg")}</span>
                  <span className="text-h3 text-fg-heading">{formatNumber(aggregate.presenterAvg ?? 0, numerals)}</span>
                </p>
              </div>
              <h4 className="mt-4 text-body-sm text-fg-muted">{t("presenter.commentsHeading")}</h4>
              {aggregate.comments.length === 0 ? (
                <p className="mt-1 text-body text-fg-muted">{t("presenter.noComments")}</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {aggregate.comments.map((comment, i) => (
                    <li key={i} className="text-body text-fg-body">
                      «{comment}»
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-body text-fg-heading">
                {t("presenter.countSoFar", { count: countForWithheld ?? 0, value: formatNumber(countForWithheld ?? 0, numerals) })}
              </p>
              <p className="mt-1 text-body-sm text-fg-muted">{t("presenter.withheldNote", { min: minAggregate, value: formatNumber(minAggregate, numerals) })}</p>
            </div>
          )}
        </div>
      ) : null}

      {showRaterBlock ? (
        <div className="mt-3">
          {eligibility.existing ? (
            eligibility.eligible ? (
              <Link href={`/app/sessions/${sessionId}/rate`} className="text-label text-fg-heading underline">
                {t("prompt.editCta")}
              </Link>
            ) : (
              <p className="text-body text-fg-muted">{t("prompt.alreadyRated")}</p>
            )
          ) : eligibility.eligible ? (
            <Link
              href={`/app/sessions/${sessionId}/rate`}
              className="inline-flex h-11 items-center rounded-field bg-[var(--btn-bg)] px-6 text-label text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
            >
              {t("prompt.cta")}
            </Link>
          ) : (
            <p className="text-body text-fg-muted">{t("prompt.closed")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
