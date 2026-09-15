// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { SheetProps } from "@/components/ui";

export function Sheet({ open, title, description, children }: SheetProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}
