// The timeline's skeleton — REQ-UIX-005, `16` §7.1 layer 2. Shared by
// `/app/loading.tsx` and `/app/sessions/loading.tsx`, because the two routes
// render one component (DEC-130) and the swap must not jump.
//
// The shape of what replaces it: the page header, the chip row, then one
// column of row cards — a 4:5 poster beside lines of text — under a group
// heading.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page. Direction-agnostic, `aria-hidden`. Sizes come from
// the skeleton's variants and `width`, never an `h-*`/`w-*` class over the
// variant's own (DEC-111).
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

function CardSkeleton() {
  return (
    <div className="flex gap-4 rounded-card border border-edge p-3">
      <div className="w-28 shrink-0 sm:w-36">
        <Skeleton variant="media" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="title" width="85%" />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="45%" />
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-3xl flex-col gap-6">
      <SkeletonPageHeader />
      <div className="flex gap-2">
        <Skeleton variant="text" width="5rem" />
        <Skeleton variant="text" width="5rem" />
        <Skeleton variant="text" width="5rem" />
      </div>
      <Skeleton variant="title" width="9rem" />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
