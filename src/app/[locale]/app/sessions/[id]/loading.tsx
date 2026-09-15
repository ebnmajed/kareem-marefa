// A route skeleton for the event page and every screen under it.
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
      <Skeleton variant="media" className="mx-auto max-w-sm" />
      <SkeletonPageHeader />
      <Skeleton variant="card" className="mt-6" />
      <Skeleton variant="text" count={4} className="mt-6" />
    </div>
  );
}
