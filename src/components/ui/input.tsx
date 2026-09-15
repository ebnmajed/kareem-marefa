// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { InputProps } from "@/components/ui";

// ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
export function Input({ invalid, size, className = "", ...props }: InputProps) {
  // `size` is the DESIGN size, not HTML's visible-character-width `size` —
  // `InputProps` omits the native one. It must not reach the element.
  return <input className={className} data-size={size} aria-invalid={invalid || undefined} {...props} />;
}
