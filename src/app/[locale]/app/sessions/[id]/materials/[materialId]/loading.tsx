import { Skeleton } from "@/components/ui/skeleton";

// SCR-013's own skeleton (DEC-213 §5.89, REQ-UIX-005) — it inherited the event page's, a shape that is not this
// one. The black ground, the bar, a page at 4:3 in the middle, the phone's bottom bar; from `lg` the rail and the
// footer. The raised fill stands on black (DEC-214 §4).
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`. `aria-hidden`, direction-agnostic.
export default function Loading() {
  return (
    <div aria-hidden="true" className="flex h-dvh flex-col bg-void">
      <div className="flex items-center gap-2.5 bg-chrome px-3 py-3.5 lg:h-16 lg:px-5 lg:py-0">
        <Skeleton variant="text" width="2.5rem" className="h-10 rounded-pill" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="5rem" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[168px] shrink-0 flex-col gap-2.5 bg-chrome px-3 py-3.5 lg:flex">
          <Skeleton variant="media" count={6} />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center p-2 lg:p-6">
          <Skeleton variant="media" className="aspect-[4/3] w-full max-w-[880px]" />
        </div>
      </div>
      <div className="flex items-center gap-3 bg-chrome px-3 pb-4.5 pt-2.5 lg:hidden">
        <Skeleton variant="text" width="2.75rem" className="h-11 rounded-pill" />
        <Skeleton variant="text" className="flex-1" />
        <Skeleton variant="text" width="2.75rem" className="h-11 rounded-pill" />
      </div>
      <div className="hidden h-11 bg-chrome lg:block" />
    </div>
  );
}
