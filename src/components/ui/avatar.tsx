// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { AvatarProps, AvatarStackProps } from "@/components/ui";

/** Initials are the default AND the permanent fallback — never a silhouette. */
export function Avatar({ displayName, decorative, className = "" }: AvatarProps) {
  const initial = (displayName ?? "").trim().charAt(0) || "\u061F";
  return (
    <span className={className} aria-hidden={decorative ? true : undefined}>
      <bdi>{initial}</bdi>
    </span>
  );
}

export function AvatarStack({ members, className = "" }: AvatarStackProps) {
  return (
    <span className={className}>
      {members.map((m) => (
        <Avatar key={m.memberId} memberId={m.memberId} displayName={m.displayName} decorative />
      ))}
    </span>
  );
}
