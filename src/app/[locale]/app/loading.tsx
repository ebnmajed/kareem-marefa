// The home's route skeleton — SCR-010 (REQ-UIX-005, `16` §7.1 layer 2): the feed's own shape inside the same
// frame, the rail's cards included from `lg`, so the swap does not jump. It covers this segment and any child
// without a boundary of its own.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for the real page.
import { FeedSkeleton, RailSkeleton } from "@/components/feed/feed-skeleton";
import { PageFrame } from "@/components/shell/page-frame";

export default function Loading() {
  return (
    <PageFrame rail={<RailSkeleton />}>
      <FeedSkeleton />
    </PageFrame>
  );
}
