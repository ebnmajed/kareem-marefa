// STUB — content's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// content REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { FileDropProps } from "@/components/ui";

export function FileDrop({ name, accept, multiple, requirements, disabled, className = "" }: FileDropProps) {
  return (
    <div className={className}>
      <input type="file" name={name} accept={accept.join(",")} multiple={multiple} disabled={disabled} />
      {requirements?.length ? (
        <ul>
          {requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
