// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { ComboboxProps } from "@/components/ui";

export function Combobox({ id, name, options, multiple, defaultValue, placeholder, className = "" }: ComboboxProps) {
  return (
    // ui-lint-disable-next-line field — the primitive <Field> wraps
    <select id={id} name={name} multiple={multiple} defaultValue={multiple ? defaultValue : defaultValue?.[0]} className={className} aria-label={placeholder}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
