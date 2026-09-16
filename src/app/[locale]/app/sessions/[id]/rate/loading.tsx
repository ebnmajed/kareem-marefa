// The rate screen's skeleton — REQ-UIX-005, `16` §7.1 layer 2.
//
// Its own, because the event page's skeleton above it draws a full-bleed dark
// band and an action card: this screen is a form in the shell's container — a
// header, a promise panel, two star rows and a comment.
//
// ★ No text and no `getTranslations`: this renders before `setRequestLocale`
// does for the real page. Direction-agnostic, `aria-hidden`.
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="flex max-w-xl flex-col gap-8">
      <SkeletonPageHeader />
      <Skeleton variant="card" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="text" width="8rem" />
          <Skeleton variant="row" width="14rem" className="mt-2" />
        </div>
      ))}
      <div>
        <Skeleton variant="text" width="10rem" />
        <Skeleton variant="row" className="mt-2" />
      </div>
    </div>
  );
}
