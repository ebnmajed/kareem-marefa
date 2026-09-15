// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { BadgeProps, SessionStatusBadgeProps } from "@/components/ui";

export function Badge({ children, className = "" }: BadgeProps) {
  return <span className={className}>{children}</span>;
}

export function SessionStatusBadge({ phase, seat, className = "" }: SessionStatusBadgeProps) {
  return (
    <span className={className} data-phase={phase} data-seat={seat}>
      {phase}
    </span>
  );
}
