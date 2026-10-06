import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { EditOnly } from "@/components/sessions/edit-mode";
import { Link } from "@/i18n/navigation";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getRatingsSummary } from "@/lib/dal/ratings";
import { formatNumber } from "@/components/sessions/numerals";
import { buttonClass } from "@/components/ui/button";

// The `Ratings` slot (TEAM.md §2, SCR-012 item 10): a SUMMARY, not the form
// — SCR-015 (`app/sessions/[id]/rate`) is the form, this is the prompt or
// the presenter's aggregate that sends a member there. Renders nothing
// before completion for anyone but the presenter/staff, and nothing at all
// for a member who never checked in (SCR-012: "for checked-in attendees
// only") — the CTA appearing at all is already the signal.
//
// No <section>/<h2> of its own — same reason as comments.tsx: the event
// page already wraps this slot in its own landmark and "التقييم" heading.
//
// ★ The event page's edit mode (the owner's ruling, `sessions/edit-mode.tsx`): the presenter's aggregate is staff's
// and presenters' alone, so it is drawn behind «تعديل»; `ratingsSummary()` marks the section `editOnly` when that
// block is all it holds, so read mode leaves no empty «التقييم» heading.

/** One read per request for the slot and its summary. */
const readSummary = cache((locale: string, sessionId: string) => getRatingsSummary(locale, sessionId));

function blocksFor({ eligibility, isPresenter, isStaff }: Awaited<ReturnType<typeof getRatingsSummary>>) {
  return {
    showPresenterBlock: (isPresenter || isStaff) && eligibility.reason !== "not_completed",
    showRaterBlock: !isPresenter && (eligibility.reason === null || eligibility.reason === "window_closed" || Boolean(eligibility.existing)),
  };
}

export async function Ratings({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("ratings");
  const summary = await readSummary(locale, sessionId);
  const { aggregate, countForWithheld, minAggregate, eligibility } = summary;
  const { showPresenterBlock, showRaterBlock } = blocksFor(summary);

  if (!showPresenterBlock && !showRaterBlock) return null;

  return (
    <div>
      {showPresenterBlock ? (
        <EditOnly>
          <div className="mt-3">
            <h3 className="text-label text-fg-heading">{t("presenter.heading")}</h3>
            {aggregate ? (
              <div className="mt-2">
                <div className="flex gap-6">
                  <p>
                    <span className="block text-body-sm text-fg-muted">{t("presenter.sessionAvg")}</span>
                    <span className="text-h3 text-fg-heading">{formatNumber(aggregate.sessionAvg ?? 0)}</span>
                  </p>
                  <p>
                    <span className="block text-body-sm text-fg-muted">{t("presenter.presenterAvg")}</span>
                    <span className="text-h3 text-fg-heading">{formatNumber(aggregate.presenterAvg ?? 0)}</span>
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
                  {t("presenter.countSoFar", { count: countForWithheld ?? 0, value: formatNumber(countForWithheld ?? 0) })}
                </p>
                <p className="mt-1 text-body-sm text-fg-muted">{t("presenter.withheldNote", { min: minAggregate, value: formatNumber(minAggregate) })}</p>
              </div>
            )}
          </div>
        </EditOnly>
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
              className={buttonClass("primary", "md")}
            >
              {t("prompt.cta")}
            </Link>
          ) : (
            <p className="text-body text-fg-muted">{t("prompt.closed")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The page's gate and the sub-nav's entry: shown when either block renders; `editOnly` when only the presenter's does. */
export async function ratingsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { showPresenterBlock, showRaterBlock } = blocksFor(await readSummary(locale, sessionId));
  return { visible: showPresenterBlock || showRaterBlock, count: 0, outstanding: null, ...(showPresenterBlock && !showRaterBlock ? { editOnly: true } : {}) };
}
