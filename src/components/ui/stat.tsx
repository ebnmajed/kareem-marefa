// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { StatProps } from "@/components/ui";

export function Stat({ label, value, hint, href, className = "" }: StatProps) {
  const body = (
    <>
      <span>{label}</span>
      <strong><bdi>{value}</bdi></strong>
      {hint ? <span>{hint}</span> : null}
    </>
  );
  return href ? <a className={className} href={href}>{body}</a> : <div className={className}>{body}</div>;
}
