// STUB — lead's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// lead REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { SplashProps } from "@/components/ui";

export function Splash({ label }: SplashProps) {
  return <div aria-hidden data-splash>{label}</div>;
}
