// STUB — lead's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// lead REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { RouteErrorProps } from "@/components/ui";

/** The shared body of every `error.tsx`. Never a stack trace, never a code. */
export function RouteError({ title, description, retryLabel, backLabel, backHref, reset }: RouteErrorProps) {
  return (
    <div role="alert">
      <h1>{title}</h1>
      <p>{description}</p>
      <button type="button" onClick={reset}>
        {retryLabel}
      </button>
      <a href={backHref}>{backLabel}</a>
    </div>
  );
}
