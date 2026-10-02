import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProposalForReview } from "@/lib/dal/proposals";
import { ProposalDetail } from "../_components/proposal-detail";

// `/app/admin/proposals/[id]` — one proposal, beside the queue from `lg` and on its own below it, with a way back
// (`DEC-NEXT-27`, `DEC-227` §5.5). The address SCR-043's log links to. Admin only, at the data: a moderator, a member,
// a draft or an unknown id answers the streamed not-found.

export default async function ProposalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const proposal = await getProposalForReview(locale, id);
  if (!proposal) notFound();
  return <ProposalDetail locale={locale} proposal={proposal} />;
}
