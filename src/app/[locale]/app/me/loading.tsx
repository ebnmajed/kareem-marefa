// A route skeleton for the /app/me hub and its seven tabs (wave 7,
// `me/layout.tsx`'s `MeTabStrip`).
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
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="text" width="6rem" />
        ))}
      </div>
      <Skeleton variant="row" count={4} className="mt-6" />
    </div>
  );
}
