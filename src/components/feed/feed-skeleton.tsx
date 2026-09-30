import { Skeleton } from "@/components/ui/skeleton";

// The home while it loads — skeletons in the feed's own shape (REQ-UIX-005): the ring row, the week's three
// tiles, two posts (the head row, a whole 4:5 poster, the row of pills). No text and no translation: this
// renders before the page's locale is set. `aria-hidden` throughout, as `ui/skeleton` draws.

export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} aria-hidden className="size-15 shrink-0 animate-pulse rounded-pill bg-raised" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 lg:hidden">
        <Skeleton variant="row" count={3} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden className="flex flex-col gap-2.5 rounded-panel border border-edge p-3">
          <div className="flex items-center gap-2.5">
            <div className="size-10 shrink-0 animate-pulse rounded-pill bg-raised" />
            <Skeleton variant="text" width="40%" />
          </div>
          <Skeleton variant="media" />
          <Skeleton variant="text" width="60%" />
        </div>
      ))}
    </div>
  );
}

/** The game rail's cards while they load — the rank, the streak and points, the race. */
export function RailSkeleton() {
  return (
    <>
      <div aria-hidden className="h-36 animate-pulse rounded-panel bg-raised" />
      <div aria-hidden className="h-20 animate-pulse rounded-panel bg-raised" />
      <div aria-hidden className="h-44 animate-pulse rounded-panel bg-raised" />
    </>
  );
}
