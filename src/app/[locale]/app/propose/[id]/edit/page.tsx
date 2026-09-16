import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { Locale } from "@/i18n/routing";
import { EDITABLE_PROPOSAL_STATES, getProposal, listCategories } from "@/lib/dal/proposals";
import { updateProposalAction } from "../../actions";
import { ProposalForm } from "../../proposal-form";

// SCR-018's edit path — /app/propose/[id]/edit (REQ-PRO-005, REQ-PRO-006,
// DEC-141 ruling 1). A second URL rather than an inline toggle on the record:
// the record and the form are two documents, and a failed round trip here must
// not re-render the materials slot and the invitation above it.
//
// Reachable only for the PROPOSER, and only in a state they may edit — a draft,
// or a change request. Anything else is `notFound()`, which is what it is to
// this member: there is nothing here for them to do. The authority is still
// `proposals_update_own_editable` and `0011`'s guard; this only stops offering
// a form the database would refuse.
//
// A change request shows what the reviewer wrote ABOVE the form — the member is
// answering it, and should not have to go back a page to reread it.

export default async function EditProposalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [proposal, categories, t, tp, tui] = await Promise.all([
    getProposal(locale, id),
    listCategories(locale),
    getTranslations("proposals.proposal"),
    getTranslations("proposals.propose"),
    getTranslations("ui.pageHeader"),
  ]);
  if (!proposal || !proposal.viewerIsProposer || !EDITABLE_PROPOSAL_STATES.includes(proposal.state)) notFound();

  const allowDraft = proposal.state === "draft";
  const action = updateProposalAction.bind(null, locale as Locale, proposal.id, allowDraft);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/app/propose", label: tp("mine.title") },
          { href: `/app/propose/${proposal.id}`, label: proposal.title },
        ]}
        breadcrumbLabel={tui("breadcrumb")}
        title={t("editTitle")}
      />

      {proposal.state === "changes_requested" && proposal.decisionReason ? (
        <section aria-labelledby="reason" className="mt-6 max-w-2xl">
          <Panel tone="live">
            <h2 id="reason" className="text-label text-fg-heading">
              {t("reasonLabel")}
            </h2>
            <p className="mt-2 whitespace-pre-line text-body text-fg-body">
              <bdi>{proposal.decisionReason}</bdi>
            </p>
          </Panel>
        </section>
      ) : null}

      <ProposalForm
        mode="edit"
        action={action}
        categories={categories}
        allowDraft={allowDraft}
        initial={{
          title: proposal.title,
          abstract: proposal.abstract,
          categoryId: proposal.categoryId,
          level: proposal.level,
          targetAudience: proposal.targetAudience ?? "",
          expectedDurationMinutes: proposal.expectedDurationMinutes === null ? "" : String(proposal.expectedDurationMinutes),
          adminNotes: proposal.adminNotes ?? "",
        }}
      />
    </>
  );
}
