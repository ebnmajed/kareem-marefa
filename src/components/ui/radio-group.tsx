"use client";

import { useId } from "react";
import type { RadioGroupProps } from "@/components/ui";

// The house radio group — `16` §4.2, REQ-UIX-009, REQ-NFR-007.
//
// ★ THE GROUP'S NAME IS A `<legend>`, NOT A FLOATING LABEL, and that is in the
// type (`RadioGroupProps.legend` is required). A set of radios whose question
// is only a `<p>` above them reads, to a screen reader, as three unrelated
// options — the member hears «تمهيدي، زر اختيار، 1 من 3» and never hears what
// is being asked.
//
// ★ SELF-LABELLING, so it does not go inside a `<Field>` — see `ui/checkbox`
// for why a second label is a violation and not a preference.
//
// ★ THE FIELDSET CARRIES `id={name}`, which is how `<FormSummary>` reaches it:
// the summary's link resolves the id and focuses the FIRST CONTROL INSIDE,
// because a `<fieldset>` is not focusable and `focus()` on one does nothing at
// all. Two groups sharing a `name` are the same group, so the id is unique
// wherever the markup is valid.
//
// `role="radiogroup"` with an explicit `aria-labelledby`: the role is what
// carries `aria-invalid` for the group, and naming it from the legend by id
// rather than relying on implicit legend naming is the difference between
// "works in the browsers we tested" and "works".

export function RadioGroup({ name, options, legend, defaultValue, value, onChange, invalid, className = "" }: RadioGroupProps) {
  const legendId = useId();
  const hintId = useId();
  const controlled = value !== undefined;

  return (
    <fieldset
      id={name}
      role="radiogroup"
      aria-labelledby={legendId}
      aria-invalid={invalid || undefined}
      className={className}
    >
      <legend id={legendId} className="text-label text-fg-heading">
        {legend}
      </legend>
      <div className="mt-2">
        {options.map((option, index) => (
          <div key={option.value}>
            <label
              className={`flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body ${option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-silver-100"}`}
            >
              {/* ui-lint-disable-next-line field — the label IS the wrapper (`16` §17) */}
              <input
                type="radio"
                name={name}
                value={option.value}
                disabled={option.disabled}
                aria-describedby={option.hint ? `${hintId}-${index}` : undefined}
                className="size-5 shrink-0 accent-[var(--btn-bg)]"
                {...(controlled
                  ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                  : { defaultChecked: option.value === defaultValue, onChange: () => onChange?.(option.value) })}
              />
              <span>{option.label}</span>
            </label>
            {/* ★ THE HINT SITS OUTSIDE THE `<label>`. Inside it, the hint joins
                the radio's ACCESSIBLE NAME as well as its description, so a
                screen reader reads the whole sentence twice and the option is
                no longer findable by its own name. `ps-10` is the box plus the
                gap plus the row padding, in logical units. */}
            {option.hint ? (
              <p id={`${hintId}-${index}`} className="ps-10 pb-1.5 text-caption text-fg-muted">
                {option.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
