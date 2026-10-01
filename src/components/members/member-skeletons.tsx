import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

// The two skeletons of `/app/members` — REQ-UIX-005, DEC-213 §5.113: the segment root's `loading.tsx` is the
// DIRECTORY's shape (a list), and the profile's own is under `[id]/`, so neither page borrows the other's.
//
// ★ No text and no `getTranslations`: these render before `setRequestLocale` does for the real page.
// Direction-agnostic, `aria-hidden`. Sizes come from the skeleton's variants and `width` (DEC-111).

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-edge px-3 py-2.5">
      <div className="w-11 shrink-0">
        <Skeleton variant="media" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="70%" />
      </div>
      <Skeleton variant="text" width="4.5rem" />
    </div>
  );
}

export function DirectorySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <SkeletonPageHeader />
      <Skeleton variant="title" width="100%" />
      <div className="flex gap-2">
        <Skeleton variant="text" width="3.5rem" />
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="5rem" />
        <Skeleton variant="text" width="6rem" />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <Skeleton variant="text" width="8rem" />
      <div className="flex flex-col gap-3 rounded-panel border border-edge p-4">
        <div className="flex items-center gap-4">
          <div className="w-20 shrink-0">
            <Skeleton variant="media" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton variant="title" width="60%" />
            <Skeleton variant="text" width="40%" />
          </div>
        </div>
        <Skeleton variant="text" count={2} />
      </div>
      <Skeleton variant="card" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-16 shrink-0">
            <Skeleton variant="media" />
          </div>
        ))}
      </div>
      <Skeleton variant="row" count={3} className="mb-2" />
    </div>
  );
}
