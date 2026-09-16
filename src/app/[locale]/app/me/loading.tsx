// A route skeleton for the /app/me hub and its six tabs.
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
      <div className="mt-6 flex gap-2">
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="6rem" />
      </div>
      <Skeleton variant="row" count={4} className="mt-6" />
    </div>
  );
}
