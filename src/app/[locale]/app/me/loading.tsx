// The hub's route skeleton — `REQ-UIX-005`, rebuilt with the frame in wave 20 (`REQ-UIX-070`).
//
// A top row, a row of chips, then rows: the shape every hub page opens with. It covers this segment and its children.
// ★ No text and no `getTranslations` — it renders before the page's `setRequestLocale`.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="text" width="9rem" />
      <div className="mt-4 flex gap-1.5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="text" width="5rem" />
        ))}
      </div>
      <Skeleton variant="row" count={4} className="mt-6" />
    </div>
  );
}
