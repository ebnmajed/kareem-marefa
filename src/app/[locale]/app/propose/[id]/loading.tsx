// My proposal's skeleton, shaped like `Proposal.dc.html`: the top row, the line of steps, a card, the summary and the
// presenters' rows (REQ-UIX-005). Its own, so the segment's form skeleton no longer stands in for it.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for the real page.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-2xl flex-col gap-4 pt-2">
      <div className="flex items-center gap-2.5">
        <Skeleton variant="text" width="2.5rem" />
        <Skeleton variant="text" width="7rem" />
      </div>
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="card" />
      <Skeleton variant="text" width="14rem" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} variant="row" />
      ))}
    </div>
  );
}
