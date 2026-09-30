import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

// Browse's skeleton — REQ-UIX-005, `16` §7.1 layer 2, `M10a.md` §6: «the existing
// `loading.tsx` shape, six row skeletons». The shape of what replaces it: the title,
// the search field, the chip row, a group heading, then six rows — a 4:5 thumb beside
// four lines of text.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for
// the real page. Direction-agnostic, `aria-hidden`. Sizes come from the skeleton's
// variants and `width`, never an `h-*`/`w-*` class over the variant's own (DEC-111).

function RowSkeleton() {
  return (
    <div className="flex gap-3 rounded-panel border border-edge p-2.5">
      <div className="w-20 shrink-0">
        <Skeleton variant="media" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <Skeleton variant="text" width="5rem" />
        <Skeleton variant="title" width="85%" />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="45%" />
      </div>
    </div>
  );
}

export function BrowseSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <SkeletonPageHeader />
      <Skeleton variant="title" width="100%" />
      <div className="flex gap-2">
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="4rem" />
      </div>
      <Skeleton variant="title" width="9rem" />
      {Array.from({ length: 6 }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}
