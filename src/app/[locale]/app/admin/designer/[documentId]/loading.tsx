// The studio's route skeleton — SCR-057 (REQ-UIX-005, `16` §7.1 layer 2).
//
// The admin console's own skeleton is a table, and a table is the wrong
// promise for a canvas. This one reserves the header, the poster-shaped
// canvas and the variant strip.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page.
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <div className="mt-8 grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
        <Skeleton variant="row" count={5} className="hidden xl:block" />
        <div className="flex flex-col gap-4">
          <Skeleton variant="media" className="mx-auto max-w-md" />
          <Skeleton variant="row" />
        </div>
        <Skeleton variant="row" count={4} className="hidden xl:block" />
      </div>
    </div>
  );
}
