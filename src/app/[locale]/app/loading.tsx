// A route skeleton for `/app` — which IS the sessions timeline (DEC-112,
// DEC-130), so it draws the timeline's own skeleton and the swap does not jump.
//
// It covers this segment AND its children — "at or above" is what makes a
// dozen files enough for forty-nine pages (REQ-UIX-005, `16` §7.1 layer 2).
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page.
import { TimelineSkeleton } from "@/components/browse/timeline-skeleton";

export default function Loading() {
  return <TimelineSkeleton />;
}
