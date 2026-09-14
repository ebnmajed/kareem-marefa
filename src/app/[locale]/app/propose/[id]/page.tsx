import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, getProposal } from "@/lib/dal/proposals";
import { answerPresenterInvite, dropCoPresenter } from "../actions";
import { ProposalMaterials } from "@/components/materials/proposal-list";

// SCR-018 · /app/propose/[id] — my proposal.
//
// This wave it carries REQ-PRO-003's half: a named co-presenter answers their
// invitation here, and the proposer sees who has answered. REQ-PRO-008's
// pipeline view — the full history behind each state — is STORY-PRO-004.
//
// Who may see this page is `proposals_read_own_or_staff`, not a check in this
// component: the proposer and the named co-presenters, nobody else. A member
// who is neither gets no row, and no row is a 404 rather than a message that
// would confirm the id exists.

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { created } = await searchParams;

  const [proposal, prefs, t, tp] = await Promise.all([
    getProposal(locale, id),
    getOrgPrefs(locale),
    getTranslations("proposals.proposal"),
    getTranslations("proposals.propose"),
  ]);
  if (!proposal) notFound();

  const answer = answerPresenterInvite.bind(null, locale as Locale, proposal.id);
  const badge = (p: { isProposer: boolean; accepted: boolean; declinedAt: string | null }) =>
    p.isProposer ? t("presenterProposer") : p.declinedAt ? t("presenterDeclined") : p.accepted ? t("presenterAccepted") : t("presenterPending");

  return (
    <>
      {created ? (
        <div role="status" className="max-w-2xl rounded-field border border-edge bg-silver-100 p-5">
          <p className="text-label text-fg-heading">{proposal.state === "draft" ? tp("created.draftTitle") : tp("created.submittedTitle")}</p>
          <p className="mt-2 text-body text-fg-body">
            {tp.rich(proposal.state === "draft" ? "created.draftBody" : "created.submittedBody", {
              title: proposal.title,
              t: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </p>
        </div>
      ) : null}

      <h1 className={`text-h1 text-fg-heading ${created ? "mt-8" : ""}`}>
        <bdi>{proposal.title}</bdi>
      </h1>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-fg-muted">
        <div className="flex gap-2">
          <dt>{t("stateLabel")}</dt>
          <dd className="text-fg-heading">{t(`state.${proposal.state}`)}</dd>
        </div>
        {proposal.categoryName ? (
          <div className="flex gap-2">
            <dt>{tp("form.categoryLabel")}</dt>
            <dd>
              <bdi>{proposal.categoryName}</bdi>
            </dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt>{tp("form.levelLabel")}</dt>
          <dd>{tp(`form.level${proposal.level === "introductory" ? "Introductory" : proposal.level === "intermediate" ? "Intermediate" : "Advanced"}`)}</dd>
        </div>
        {proposal.expectedDurationMinutes !== null ? (
          <div className="flex gap-2">
            <dt>{tp("form.durationLabel")}</dt>
            <dd>
              <bdi>{tp("duration", { count: proposal.expectedDurationMinutes, value: formatNumber(proposal.expectedDurationMinutes, prefs.numerals) })}</bdi>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* REQ-PRO-005: the written reason is the point of a rejection or a
          change-request, so it is not tucked into a status pill. */}
      {proposal.decisionReason ? (
        <div className="mt-6 max-w-2xl rounded-field border border-edge-strong p-5">
          <h2 className="text-label text-fg-heading">{t("reasonLabel")}</h2>
          <p className="mt-2 whitespace-pre-line text-body text-fg-body">
            <bdi>{proposal.decisionReason}</bdi>
          </p>
        </div>
      ) : null}
      {proposal.state === "approved" ? <p className="mt-6 max-w-2xl text-body text-fg-body">{t("approvedNote")}</p> : null}

      <section aria-labelledby="abstract" className="mt-8 max-w-2xl">
        <h2 id="abstract" className="text-label text-fg-heading">
          {t("abstractLabel")}
        </h2>
        <p className="mt-2 whitespace-pre-line text-body text-fg-body">
          <bdi>{proposal.abstract}</bdi>
        </p>
      </section>

      {/* The content slot for draft materials on a proposal (REQ-PRO-004, DEC-045's deferral,
          migration 0053): reassigned to the session the moment one is created from it. */}
      <section aria-labelledby="materials" className="mt-8 max-w-2xl">
        <h2 id="materials" className="text-label text-fg-heading">
          {t("materialsLabel")}
        </h2>
        <ProposalMaterials proposalId={proposal.id} locale={locale} />
      </section>

      {proposal.viewerInvite === "pending" ? (
        <section aria-labelledby="invite" className="mt-8 max-w-2xl rounded-field border border-edge-strong p-5">
          <h2 id="invite" className="text-label text-fg-heading">
            {t("inviteTitle")}
          </h2>
          <p className="mt-2 text-body text-fg-body">{t("inviteBody")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={answer.bind(null, true)}>
              <button type="submit" className="inline-flex h-12 items-center rounded-field bg-navy-950 px-6 text-label text-white hover:bg-navy-900">
                {t("accept")}
              </button>
            </form>
            <form action={answer.bind(null, false)}>
              <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-6 text-label text-fg-heading hover:bg-silver-100">
                {t("decline")}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="presenters" className="mt-8 max-w-2xl">
        <h2 id="presenters" className="text-label text-fg-heading">
          {t("presentersLabel")}
        </h2>
        <ul className="mt-3 space-y-2">
          {proposal.presenters.map((p) => (
            <li key={p.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field border border-edge px-4 py-3">
              <span className="text-body text-fg-heading">
                <bdi>{p.displayName}</bdi>
              </span>
              <span className="text-body-sm text-fg-muted">{badge(p)}</span>
              {proposal.viewerIsProposer && !p.isProposer ? (
                <form action={dropCoPresenter.bind(null, locale as Locale, proposal.id, p.memberId)} className="ms-auto">
                  <button type="submit" className="h-11 rounded-field px-3 text-body-sm text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                    {t.rich("removeLabel", { name: p.displayName ?? "", t: (chunks) => <bdi>{chunks}</bdi> })}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10">
        <Link href="/app/propose" className="text-label text-fg-heading underline underline-offset-4">
          {t("back")}
        </Link>
      </p>
    </>
  );
}
