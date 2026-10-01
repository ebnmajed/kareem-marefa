// The propose screen's skeleton, shaped like `Propose.dc.html`: the title row, the lead, the panel, the progress line
// and the fields of section 1 (REQ-UIX-005). It also covers `/edit`, the same form. `[id]/` has its own.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale` does for the real page.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-2xl flex-col gap-4 pt-2">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width="11rem" />
        <Skeleton variant="text" width="4rem" />
      </div>
      <Skeleton variant="text" width="14rem" />
      <Skeleton variant="row" />
      <Skeleton variant="text" width="9rem" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="text" width="8rem" />
          <Skeleton variant="row" className="mt-2" />
        </div>
      ))}
    </div>
  );
}
