// STUB — lead's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// lead REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { SkeletonProps } from "@/components/ui";

/** No text, `aria-hidden`, direction-agnostic — it renders before the locale. */
export function Skeleton({ variant = "text", count = 1, width, className = "" }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className={className} data-variant={variant} style={width ? { width } : undefined} />
      ))}
    </>
  );
}
