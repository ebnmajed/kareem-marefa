// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { CheckboxProps } from "@/components/ui";

export function Checkbox({ label, className = "", ...props }: CheckboxProps) {
  return (
    <label className={className}>
      {/* ui-lint-disable-next-line field — the label is the wrapper here */}
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
