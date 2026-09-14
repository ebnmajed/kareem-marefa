import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, listProposalsForReview } from "@/lib/dal/proposals";
import { decideProposal } from "./actions";
import { ReviewCard } from "./review-card";

// SCR-041 · /app/admin/proposals — the review queue (REQ-PRO-005, REQ-PRO-006).
//
// Owned by `sessions` for wave 1 only and handed to `console` at wave 3
// (DEC-042): M2's demonstrable runs propose → approve → schedule → publish,
// and the middle two need a surface.
//
// Admin only. The check is `listProposalsForReview()` returning null, not a
// role test in this component: a moderator is `is_staff()` and CAN read
// proposals under 03 §5.2a, so a page-level guard is the only thing standing
// between them and a queue whose every button `review_proposal()` would
// refuse. 404, not a message — a moderator has no business knowing the queue
// is there.

export default async function AdminProposalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [queue, prefs, t, tp] = await Promise.all([
    listProposalsForReview(locale),
    getOrgPrefs(locale),
    getTranslations("admin.proposals"),
    getTranslations("proposals.propose"),
  ]);
  if (queue === null) notFound();

  const action = decideProposal.bind(null, locale as Locale);
  const num = (n: number) => formatNumber(n, prefs.numerals);
  const levelKey = (l: string) => `form.level${l === "introductory" ? "Introductory" : l === "intermediate" ? "Intermediate" : "Advanced"}`;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      {queue.length === 0 ? (
        <p className="mt-8 text-body text-fg-body">{t("empty")}</p>
      ) : (
        <>
          <p className="mt-6 text-body-sm text-fg-muted">{t("count", { count: queue.length, value: num(queue.length) })}</p>
          <ul className="mt-4 max-w-3xl space-y-5">
            {queue.map((p) => (
              <ReviewCard key={p.id} action={action} proposalId={p.id}>
                <h2 className="text-h2 text-fg-heading">
                  <bdi>{p.title}</bdi>
                </h2>
                <p className="mt-2 text-body-sm text-fg-muted">
                  {t(`state.${p.state === "in_review" ? "in_review" : "submitted"}`)} · {t("age", { count: p.ageDays, value: num(p.ageDays) })}
                </p>

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("proposerLabel")}</dt>
                    <dd className="text-fg-heading">
                      <bdi>{p.proposerName}</bdi>
                    </dd>
                  </div>
                  {p.categoryName ? (
                    <div className="flex gap-2">
                      <dt className="text-fg-muted">{t("categoryLabel")}</dt>
                      <dd className="text-fg-heading">
                        <bdi>{p.categoryName}</bdi>
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("levelLabel")}</dt>
                    <dd className="text-fg-heading">{tp(levelKey(p.level))}</dd>
                  </div>
                  {p.expectedDurationMinutes !== null ? (
                    <div className="flex gap-2">
                      <dt className="text-fg-muted">{t("durationLabel")}</dt>
                      <dd className="text-fg-heading">
                        <bdi>{tp("duration", { count: p.expectedDurationMinutes, value: num(p.expectedDurationMinutes) })}</bdi>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {p.presenters.length > 1 ? (
                  <p className="mt-3 text-body-sm">
                    <span className="text-fg-muted">{t("presentersLabel")}</span>{" "}
                    <span className="text-fg-heading">
                      {p.presenters.map((x, i) => (
                        <span key={x.memberId}>
                          {i > 0 ? "، " : ""}
                          <bdi>{x.displayName}</bdi>
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}

                <h3 className="mt-4 text-label text-fg-heading">{t("abstractLabel")}</h3>
                <p className="mt-1 whitespace-pre-line text-body text-fg-body">
                  <bdi>{p.abstract}</bdi>
                </p>

                {p.targetAudience ? (
                  <p className="mt-3 text-body-sm">
                    <span className="text-fg-muted">{t("audienceLabel")}</span>{" "}
                    <bdi className="text-fg-body">{p.targetAudience}</bdi>
                  </p>
                ) : null}
                {p.adminNotes ? (
                  <>
                    <h3 className="mt-4 text-label text-fg-heading">{t("notesLabel")}</h3>
                    <p className="mt-1 whitespace-pre-line text-body text-fg-body">
                      <bdi>{p.adminNotes}</bdi>
                    </p>
                  </>
                ) : null}
              </ReviewCard>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
