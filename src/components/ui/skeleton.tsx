import type { SkeletonProps } from "@/components/ui";

// The loading vocabulary — `16` §7.1 layer 2, REQ-UIX-005.
//
// ★★ A SKELETON MUST NOT CALL `getTranslations`. It renders BEFORE
// `setRequestLocale` runs for the real page, so a translated skeleton throws
// inside the thing that exists to stop a blank frame. The one skeleton that
// already existed (`app/sessions/loading.tsx`) documents this and every new one
// inherits it: no text, `aria-hidden`, direction-agnostic.
//
// Direction-agnostic is not pedantry either — a skeleton with an asymmetric
// shape renders the same in both directions because it is a placeholder for
// content, not content. Widths are percentages and margins are logical.
//
// ★ WHY THIS BUYS MORE THAN A SPINNER. Every `/app/**` route is dynamic — the
// DAL touches `cookies()` (DEC-013) — and Next 16 SKIPS PREFETCHING for a
// dynamic route that has no `loading.tsx`. So the absence of these files was
// not a missing spinner: it was why navigation blocked on the server round
// trip with no feedback at all. Adding them buys partial prefetching, an
// immediate navigation AND the loading UI, in one change.

const shapes: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  text: "h-4 w-full rounded-field",
  title: "h-8 w-1/2 rounded-field",
  card: "h-52 w-full rounded-field border border-edge",
  media: "aspect-[4/5] w-full rounded-field",
  row: "h-16 w-full rounded-field",
};

export function Skeleton({ variant = "text", count = 1, width, className = "" }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`animate-pulse bg-silver-100 ${shapes[variant]} ${className}`}
          style={width ? { width } : undefined}
        />
      ))}
    </>
  );
}

/**
 * The frame every route skeleton opens with: a page title and a line of
 * description, matching `<PageHeader>`'s shape so the swap does not jump.
 */
export function SkeletonPageHeader() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="title" />
      <Skeleton variant="text" width="60%" className="mt-3" />
    </div>
  );
}
