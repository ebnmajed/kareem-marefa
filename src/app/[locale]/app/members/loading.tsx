// A member profile's skeleton — REQ-UIX-005, `16` §7.1 layer 2.
//
// The shape of SCR-020 as wave 7 draws it: the avatar beside the name, the bio,
// a row of four stats, and a list. (There is no directory page under this
// segment today, so the old card grid described a screen that does not exist.)
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page. Direction-agnostic, `aria-hidden`.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Skeleton variant="row" width="4rem" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton variant="title" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" count={2} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="row" />
        ))}
      </div>
      <Skeleton variant="row" count={3} className="mb-2" />
    </div>
  );
}
