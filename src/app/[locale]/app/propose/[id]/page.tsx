import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProposalMaterials } from "@/components/materials/proposal-list";
import { formatNumber } from "@/components/sessions/numerals";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import { RemovePresenter } from "@/components/sessions/remove-presenter";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Locale } from "@/i18n/routing";
import { EDITABLE_PROPOSAL_STATES, getProposal, type ProposalPresenter } from "@/lib/dal/proposals";
import { answerPresenterInvite, dropCoPresenter } from "../actions";

// SCR-018 · /app/propose/[id] — my proposal (REQ-PRO-003, REQ-PRO-005,
// REQ-PRO-006, REQ-PRO-008), on the M9 system for wave 7 (DEC-137, DEC-141).
//
// Who may see this page is `proposals_read_own_or_staff`, not a check in this
// component: the proposer and the named co-presenters, nobody else. A member
// who is neither gets no row, and no row is `notFound()` rather than a message
// that would confirm the id exists (under `/app`, DEC-134's streamed not-found).
//
// What the page says, in order: the state on the shared status vocabulary;
// what the reviewer wrote, where there is a decision to read; what happens
// next, and the edit where the state allows one; the proposal itself; its draft
// materials; the invitation, for a co-presenter; the presenters.
//
// ★ THE REVIEWER'S REASON SHOWS ONLY IN THE STATES IT BELONGS TO. Approval
// clears `decision_reason`; a RESUBMISSION does not — the proposer cannot write
// the column. Shown whenever it was non-null, a resubmitted proposal would sit
// under «بانتظار المراجعة» with last round's change request beneath it.

const LEVEL_KEY = { introductory: "form.levelIntroductory", intermediate: "form.levelIntermediate", advanced: "form.levelAdvanced" } as const;

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { created, updated } = await searchParams;

  const [proposal, t, tp] = await Promise.all([getProposal(locale, id), getTranslations("proposals.proposal"), getTranslations("proposals.propose")]);
  if (!proposal) notFound();

  const answer = answerPresenterInvite.bind(null, locale as Locale, proposal.id);
  const named = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const editable = proposal.viewerIsProposer && EDITABLE_PROPOSAL_STATES.includes(proposal.state);
  const showReason = Boolean(proposal.decisionReason) && (proposal.state === "changes_requested" || proposal.state === "rejected");

  const presenterBadge = (p: ProposalPresenter) =>
    p.isProposer ? (
      <Badge tone="neutral" outline size="sm">
        {t("presenterProposer")}
      </Badge>
    ) : p.declinedAt ? (
      <Badge tone="ended" size="sm">
        {t("presenterDeclined")}
      </Badge>
    ) : p.accepted ? (
      <Badge tone="success" size="sm">
        {t("presenterAccepted")}
      </Badge>
    ) : (
      <Badge tone="live" size="sm">
        {t("presenterPending")}
      </Badge>
    );

  // A receipt for the round trip that brought the member here. `role="status"`,
  // because it is news about the member's own action and must not interrupt.
  const receipt = created
    ? {
        title: proposal.state === "draft" ? tp("created.draftTitle") : tp("created.submittedTitle"),
        body: tp.rich(proposal.state === "draft" ? "created.draftBody" : "created.submittedBody", { title: proposal.title, t: named }),
      }
    : updated
      ? {
          title: updated === "draft" ? t("updated.draftTitle") : t("updated.submittedTitle"),
          body: updated === "draft" ? null : t.rich("updated.submittedBody", { title: proposal.title, t: named }),
        }
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {receipt ? (
        <div role="status">
          <Panel tone="success">
            <p className="text-label text-fg-heading">{receipt.title}</p>
            {receipt.body ? <p className="mt-2 text-body text-fg-body">{receipt.body}</p> : null}
          </Panel>
        </div>
      ) : null}

      <PageHeader
        breadcrumb={[{ href: "/app/propose", label: tp("mine.title") }]}
        breadcrumbLabel={(await getTranslations("ui.pageHeader"))("breadcrumb")}
        status={<ProposalStatusBadge state={proposal.state} />}
        title={proposal.title}
        meta={
          <p className="text-body-sm text-fg-muted">
            {proposal.categoryName ? (
              <>
                <bdi>{proposal.categoryName}</bdi>
                {" · "}
              </>
            ) : null}
            {tp(LEVEL_KEY[proposal.level])}
            {proposal.expectedDurationMinutes !== null ? (
              <>
                {" · "}
                <bdi>{tp("duration", { count: proposal.expectedDurationMinutes, value: formatNumber(proposal.expectedDurationMinutes) })}</bdi>
              </>
            ) : null}
          </p>
        }
        actions={
          editable ? (
            <ButtonLink href={`/app/propose/${proposal.id}/edit`} variant={proposal.state === "changes_requested" ? "primary" : "secondary"} size="md">
              {proposal.state === "changes_requested" ? t("editChanges") : t("editDraft")}
            </ButtonLink>
          ) : null
        }
      />

      {/* REQ-PRO-005: the written reason is the point of a rejection or a
          change request, so it is its own region, not a line under a pill. */}
      {showReason ? (
        <section aria-labelledby="reason">
          <Panel tone={proposal.state === "rejected" ? "error" : "live"}>
            <h2 id="reason" className="text-label text-fg-heading">
              {t("reasonLabel")}
            </h2>
            <p className="mt-2 whitespace-pre-line text-body text-fg-body">
              <bdi>{proposal.decisionReason}</bdi>
            </p>
          </Panel>
        </section>
      ) : null}

      {proposal.state === "approved" ? <p className="text-body text-fg-body">{t("approvedNote")}</p> : null}
      {proposal.state === "submitted" || proposal.state === "in_review" ? <p className="text-body text-fg-muted">{t("nextPending")}</p> : null}
      {proposal.state === "draft" && proposal.viewerIsProposer ? <p className="text-body text-fg-muted">{t("nextDraft")}</p> : null}

      <section aria-labelledby="abstract" className="flex flex-col gap-3">
        <SectionHeader id="abstract" title={t("abstractLabel")} />
        <p className="whitespace-pre-line text-body text-fg-body">
          <bdi>{proposal.abstract}</bdi>
        </p>
        {proposal.targetAudience || proposal.adminNotes ? (
          <dl className="mt-2 flex flex-col gap-4 border-t border-edge pt-4">
            {proposal.targetAudience ? (
              <div>
                <dt className="text-label text-fg-heading">{tp("form.audienceLabel")}</dt>
                <dd className="mt-1 text-body text-fg-body">
                  <bdi>{proposal.targetAudience}</bdi>
                </dd>
              </div>
            ) : null}
            {proposal.adminNotes ? (
              <div>
                <dt className="text-label text-fg-heading">{tp("form.notesLabel")}</dt>
                <dd className="mt-1 whitespace-pre-line text-body text-fg-body">
                  <bdi>{proposal.adminNotes}</bdi>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      {/* The content slot for draft materials on a proposal (REQ-PRO-004,
          DEC-045's deferral, migration 0053): reassigned to the session the
          moment one is created from it. The page owns the landmark. */}
      <section aria-labelledby="materials" className="flex flex-col gap-3">
        <SectionHeader id="materials" title={t("materialsLabel")} />
        <ProposalMaterials proposalId={proposal.id} locale={locale} />
      </section>

      {proposal.viewerInvite === "pending" ? (
        <section aria-labelledby="invite">
          <Panel tone="live">
            <h2 id="invite" className="text-h3 text-fg-heading">
              {t("inviteTitle")}
            </h2>
            <p className="mt-2 text-body text-fg-body">{t("inviteBody")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={answer.bind(null, true)}>
                <SubmitButton size="md">{t("accept")}</SubmitButton>
              </form>
              <form action={answer.bind(null, false)}>
                <SubmitButton variant="secondary" size="md">
                  {t("decline")}
                </SubmitButton>
              </form>
            </div>
          </Panel>
        </section>
      ) : null}

      <section aria-labelledby="presenters" className="flex flex-col gap-3">
        <SectionHeader id="presenters" title={t("presentersLabel")} count={proposal.presenters.length} />
        <ul className="flex flex-col gap-2">
          {proposal.presenters.map((p) => (
            <li key={p.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-edge px-4 py-3">
              <Avatar memberId={p.memberId} displayName={p.displayName} size={32} decorative />
              <span className="text-body text-fg-heading">
                <bdi>{p.displayName}</bdi>
              </span>
              {presenterBadge(p)}
              {proposal.viewerIsProposer && !p.isProposer ? (
                <span className="ms-auto">
                  <RemovePresenter name={p.displayName} action={dropCoPresenter.bind(null, locale as Locale, proposal.id, p.memberId)} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
