import { Skeleton } from "@/components/ui/skeleton";
import { PendingPoster } from "@/components/shell/pending-poster";

// The event page's skeleton — REQ-UIX-005, `16` §7.1 layer 2, the shape of `Event.dc.html`: the top row, the
// poster at 4:5, the chips, the title, the action card, the sub-nav and two sections; from `lg` the poster
// beside the band. It covers the screens under the event page too — check-in, the host view, the rater — for
// the moment before their own content arrives.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`. `aria-hidden`, direction-agnostic,
// and sized by the skeleton's own variants and `width` (DEC-111).
export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-6xl px-3 pb-12 lg:px-8">
      <div className="flex items-center justify-between py-3 lg:hidden">
        <Skeleton variant="text" width="2.75rem" />
        <Skeleton variant="text" width="7rem" />
        <Skeleton variant="text" width="5rem" />
      </div>
      <div className="flex flex-col gap-3 lg:mt-6 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8">
        {/* ★ Wave 29 (REQ-UIX-122): the poster a jump carried, under its shared name — or the box. */}
        <PendingPoster fallback={<Skeleton variant="media" />} />
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Skeleton variant="text" width="5rem" />
            <Skeleton variant="text" width="4rem" />
            <Skeleton variant="text" width="4rem" />
          </div>
          <Skeleton variant="title" width="80%" />
          <Skeleton variant="row" />
        </div>
      </div>
      <div className="mt-4 rounded-panel border border-edge p-4">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="row" className="mt-3" />
        <Skeleton variant="text" count={3} className="mt-3" />
      </div>
      <div className="mt-5 flex gap-2">
        <Skeleton variant="text" width="4rem" />
        <Skeleton variant="text" width="4rem" />
        <Skeleton variant="text" width="4rem" />
      </div>
      <Skeleton variant="title" width="8rem" className="mt-8" />
      <Skeleton variant="text" count={4} className="mt-3" />
    </div>
  );
}
