// A route skeleton for the propose flow — a form, so field-shaped.
//
// It covers this segment AND its children — "at or above" is what makes a
// dozen files enough for forty-nine pages (REQ-UIX-005, `16` §7.1 layer 2).
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page.
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <div className="mt-8 flex max-w-2xl flex-col gap-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Skeleton variant="text" width="8rem" />
            <Skeleton variant="row" className="mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
