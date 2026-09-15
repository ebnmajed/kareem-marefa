// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { DateTimeProps } from "@/components/ui";

export function DateTime({ id, name, defaultValue, granularity = "minute", min, max, className = "" }: DateTimeProps) {
  return (
    // ui-lint-disable-next-line field — the primitive <Field> wraps
    <input
      id={id}
      name={name}
      type={granularity === "date" ? "date" : "datetime-local"}
      defaultValue={defaultValue ?? undefined}
      min={min}
      max={max}
      className={className}
    />
  );
}
