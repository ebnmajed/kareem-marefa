// STUB — sessions's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// sessions REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

import type { RadioGroupProps } from "@/components/ui";

export function RadioGroup({ name, options, legend, defaultValue, className = "" }: RadioGroupProps) {
  return (
    <fieldset className={className}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value}>
          {/* ui-lint-disable-next-line field — the legend is the group's name */}
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} disabled={o.disabled} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
