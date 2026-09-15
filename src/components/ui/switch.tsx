// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { SwitchProps } from "@/components/ui";

export function Switch({ label, description, checked, defaultChecked, disabled, name, className = "" }: SwitchProps) {
  return (
    <label className={className}>
      {/* ui-lint-disable-next-line field — the label is the wrapper here */}
      <input type="checkbox" role="switch" name={name} checked={checked} defaultChecked={defaultChecked} disabled={disabled} readOnly={checked !== undefined} />
      <span>{label}</span>
      {description ? <span>{description}</span> : null}
    </label>
  );
}
