import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

// The gallery's `skeleton` demo — contract 4. Every variant. A skeleton has no
// text and no direction; inside the scope its blocks are the raised step, so they
// read on the ground and on a surface alike. Nothing moves (REQ-UIX-020: its
// pulse is the one the tree already has, and reduced motion stills it).

export function SkeletonDemo() {
  return (
    <div data-demo="skeleton" className="flex w-full max-w-md flex-col gap-4">
      <SkeletonPageHeader />
      <Skeleton variant="title" />
      <Skeleton variant="text" count={3} />
      <Skeleton variant="media" />
      <Skeleton variant="card" />
      <Skeleton variant="row" count={2} />
    </div>
  );
}
