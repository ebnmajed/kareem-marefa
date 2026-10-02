// The boards' route skeleton — `Board.dc.html`'s geometry (wave 20, PR B): the top row, the window chips, the rank
// card, the podium's three blocks and the rows. It covers this segment and its children (REQ-UIX-005).
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for the real page.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="flex max-w-3xl flex-col gap-4">
      <Skeleton variant="title" width="50%" />
      <div className="flex gap-2">
        <Skeleton variant="text" className="h-9 w-24 rounded-pill" />
        <Skeleton variant="text" className="h-9 w-20 rounded-pill" />
        <Skeleton variant="text" className="h-9 w-24 rounded-pill" />
        <Skeleton variant="text" className="h-9 w-28 rounded-pill" />
      </div>
      <Skeleton variant="card" className="h-20" />
      <div className="flex items-end justify-center gap-2">
        <Skeleton variant="card" className="h-36 w-26" />
        <Skeleton variant="card" className="h-44 w-26" />
        <Skeleton variant="card" className="h-32 w-26" />
      </div>
      <Skeleton variant="row" count={7} />
    </div>
  );
}
