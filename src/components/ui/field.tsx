// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import { useId } from "react";
import type { FieldProps } from "@/components/ui";

export function Field({ id, label, hint, error, required, children, className = "" }: FieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={className} data-field={fieldId}>
      <label htmlFor={fieldId}>{label}</label>
      {hint ? <span id={`${fieldId}-hint`}>{hint}</span> : null}
      {children}
      {error ? (
        <p id={`${fieldId}-error`} role="alert">
          {error}
        </p>
      ) : null}
      {required ? <span data-required /> : null}
    </div>
  );
}
