import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { listProposalQueue } from "@/lib/dal/proposals";
import { QueueView } from "./_components/queue-view";

// SCR-041 · المقترحات — REQ-UIX-088, REQ-PRO-005, DEC-NEXT-27. Rebuilt in wave 21 from `AdminProposals.dc.html`:
// deleted first, then written (`DEC-208`; the table is `notes/sessions.md` W21.3).
//
// ★ A PROPOSAL IS DECIDED WITHOUT LEAVING THE LIST. The queue is this layout's, so it stays mounted while the detail
// beside it changes — ↑ ↓ walk it, Enter opens, and after a decision focus lands on the next row. Under `lg` the queue
// is the page and a proposal opens at `/app/admin/proposals/[id]`.
//
// ★ THE LAYOUT NEVER GATES. `listProposalQueue()` is admin only and `null` for anyone else; this then renders the
// page alone, and every page answers its own streamed not-found (`DEC-134`) — a layout's `notFound()` streams a 200.

export default async function ProposalsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [queue, t] = await Promise.all([listProposalQueue(locale), getTranslations("proposals.review")]);
  if (!queue) return children;
  return (
    <>
      <PageHeader title={t("title")} className="mb-6" />
      <QueueView items={queue.items} counts={queue.counts}>
        {children}
      </QueueView>
    </>
  );
}
