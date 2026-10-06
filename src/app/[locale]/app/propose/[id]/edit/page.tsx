import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReasonCard } from "@/components/proposals/reason-card";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import type { Locale } from "@/i18n/routing";
import { EDITABLE_PROPOSAL_STATES, getOrgPrefs, getProposal, listCategories } from "@/lib/dal/proposals";
import { updateProposalAction } from "../../actions";
import { ProposalForm } from "../../proposal-form";

// /app/propose/[id]/edit — SCR-017's RESUBMIT state (`M10b.md` §3, REQ-PRO-005, REQ-PRO-006, DEC-141 ruling 1),
// written from the artboard after the old page was deleted (DEC-208). The same form, pre-filled; the reviewer's
// reason pinned ABOVE section 1, because the member is answering it; submit reads «أعد إرسال المقترح» and there is no
// draft button for a change request; co-presenters are managed on the proposal's own page.
//
// Reachable only for the PROPOSER, in a draft or a change request — anything else is `notFound()`. The authority is
// still `proposals_update_own_editable` and `0011`'s guard; this only stops offering a form the database would refuse.

export default async function EditProposalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [proposal, categories, prefs, t, tp] = await Promise.all([
    getProposal(locale, id),
    listCategories(locale),
    getOrgPrefs(locale),
    getTranslations("proposals.proposal"),
    getTranslations("proposals.propose"),
  ]);
  if (!proposal || !proposal.viewerIsProposer || !EDITABLE_PROPOSAL_STATES.includes(proposal.state)) notFound();

  const allowDraft = proposal.state === "draft";
  const action = updateProposalAction.bind(null, locale as Locale, proposal.id, allowDraft);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2.5 pt-2">
        <Link
          href={`/app/propose/${proposal.id}`}
          aria-label={tp("mine.open")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading"
        >
          <ArrowIcon direction="back" aria-hidden="true" className="text-[1.125rem]" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-play-sm font-extrabold text-fg-heading">{t("editTitle")}</h1>
          <p className="text-caption text-fg-muted">
            <bdi>{proposal.title}</bdi>
          </p>
        </div>
      </div>

      {proposal.state === "changes_requested" && proposal.decisionReason ? (
        <ReasonCard reason={proposal.decisionReason} decidedAt={proposal.updatedAt} timeZone={prefs.timeZone} locale={locale} tone="signal" />
      ) : null}

      <ProposalForm
        mode="edit"
        action={action}
        categories={categories}
        allowDraft={allowDraft}
        initial={{
          eventType: proposal.eventType,
          title: proposal.title,
          abstract: proposal.abstract,
          categoryId: proposal.categoryId,
          level: proposal.level,
          targetAudience: proposal.targetAudience ?? "",
          expectedDurationMinutes: proposal.expectedDurationMinutes === null ? "" : String(proposal.expectedDurationMinutes),
          adminNotes: proposal.adminNotes ?? "",
        }}
      />
    </div>
  );
}
