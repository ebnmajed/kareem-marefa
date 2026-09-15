// STUB — lead's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// lead REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { RouteProgressProps } from "@/components/ui";

export function RouteProgress({ delayMs = 150 }: RouteProgressProps) {
  // The real one subscribes to the store `ui/link` writes and shows only past
  // the threshold; below it a bar is a flash of noise (`16` §7.1.1).
  void delayMs;
  return null;
}
