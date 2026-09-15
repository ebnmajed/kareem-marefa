// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { TextareaProps } from "@/components/ui";

// ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
export function Textarea({ invalid, className = "", ...props }: TextareaProps) {
  return <textarea className={className} aria-invalid={invalid || undefined} {...props} />;
}
