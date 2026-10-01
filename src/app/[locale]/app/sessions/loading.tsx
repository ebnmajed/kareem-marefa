// Browse's skeleton on `/app/sessions` — REQ-UIX-005, `M10a.md` §6: six row
// skeletons, inside the same frame as the page, the rail's cards included from
// `lg` (the home's `RailSkeleton`), so the swap does not jump. No text and no
// `getTranslations`: it renders before `setRequestLocale`.
import { BrowseSkeleton } from "@/components/browse/browse-skeleton";
import { RailSkeleton } from "@/components/feed/feed-skeleton";
import { PageFrame } from "@/components/shell/page-frame";

export default function Loading() {
  return (
    <PageFrame rail={<RailSkeleton />}>
      <BrowseSkeleton />
    </PageFrame>
  );
}
