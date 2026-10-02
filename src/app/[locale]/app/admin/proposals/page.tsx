import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProposalForReview, inProposalFilter, listProposalQueue, proposalQueueFilter } from "@/lib/dal/proposals";
import { ProposalDetail } from "./_components/proposal-detail";

// SCR-041's own route — the queue (the layout's) and, from `lg`, the first proposal of the filter open beside it.
// Below `lg` the detail is hidden and the queue is the page (`ui/split-view`'s `narrow`). Admin only, at the data.

export default async function ProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const queue = await listProposalQueue(locale);
  if (!queue) notFound();
  const filter = proposalQueueFilter(query.state);
  const first = queue.items.find((item) => inProposalFilter(item.state, filter));
  if (!first) return null;
  const proposal = await getProposalForReview(locale, first.id);
  return proposal ? <ProposalDetail locale={locale} proposal={proposal} /> : null;
}
