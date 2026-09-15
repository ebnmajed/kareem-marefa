// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { PanelProps } from "@/components/ui";

export function Panel({ children, tone, className = "" }: PanelProps) {
  return <div className={className} data-tone={tone}>{children}</div>;
}
