// The event page's skeleton — REQ-UIX-005, `16` §7.1 layer 2.
//
// The shape of what replaces it: the dark band with a badge, a title and a row
// of chips; the action card beside the sections from `md` and after the band on
// the phone; the sub-nav; two sections. It covers the screens under the event
// page too — check-in, the host view, the rater — for the moment before their
// own content arrives.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page. Direction-agnostic, `aria-hidden`. Sizes come from
// the skeleton's own variants and `width` — never an `h-*`/`w-*` class over the
// variant's, which would be two utilities for one property (DEC-111).
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <div className="bg-navy-950">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 md:px-8 md:pb-16 md:pt-6 [&_.animate-pulse]:bg-navy-800">
          <Skeleton variant="text" width="8rem" />
          <Skeleton variant="text" width="7rem" className="mt-5" />
          <Skeleton variant="title" width="70%" className="mt-3" />
          <div className="mt-5 flex gap-2">
            <Skeleton variant="text" width="4.5rem" />
            <Skeleton variant="text" width="4.5rem" />
            <Skeleton variant="text" width="4.5rem" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-12 md:px-8">
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_372px] md:items-start md:gap-12">
          <div className="-mt-4 rounded-card border border-edge bg-canvas p-5 md:col-start-2 md:row-start-1 md:-mt-10">
            <Skeleton variant="title" width="60%" />
            <Skeleton variant="text" className="mt-3" />
            <Skeleton variant="row" className="mt-5" />
            <Skeleton variant="text" count={3} className="mt-4" />
          </div>
          <div className="mt-8 md:col-start-1 md:row-start-1">
            <Skeleton variant="text" />
            <Skeleton variant="title" width="8rem" className="mt-10" />
            <Skeleton variant="text" count={4} className="mt-4" />
            <Skeleton variant="title" width="10rem" className="mt-10" />
            <Skeleton variant="row" count={2} className="mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
