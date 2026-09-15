// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { MenuProps } from "@/components/ui";

export function Menu({ trigger, items }: MenuProps) {
  return (
    <details>
      <summary>{trigger}</summary>
      <ul>
        {items.map((i) => (
          <li key={i.label}>
            {i.href ? <a href={i.href}>{i.label}</a> : <button type="button" onClick={i.onSelect} disabled={i.disabled}>{i.label}</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
