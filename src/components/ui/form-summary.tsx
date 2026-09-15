// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { FormSummaryProps } from "@/components/ui";

/** Above the form on failure, focused, with ONE LINK PER FAILED FIELD. */
export function FormSummary({ errors, title, className = "" }: FormSummaryProps) {
  if (errors.length === 0) return null;
  return (
    <div className={className} role="alert" tabIndex={-1}>
      <p>{title}</p>
      <ul>
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`}>
              <bdi>{e.label}</bdi>: {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
