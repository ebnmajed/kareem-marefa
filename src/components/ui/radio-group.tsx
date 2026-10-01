"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { RadioGroupProps } from "@/components/ui";
import { AlertCircleIcon } from "@/components/ui/icons";

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
// ★ THE ROW'S HOVER IS A THEME TOKEN, `--btn2-bg-hover`, not `silver-100`. The
// group renders inside `.theme-dark` sections too — the auth card, the event
// hero — where a light silver wash under light text left the hovered option
// unreadable. The token is defined in both themes, so the hover follows the
// section it sits in.
//
// ★ WAVE 15 (DEC-186 §2, §6). The scope reassigns `--fg-heading`, `--fg-body`,
// `--fg-muted`, `--btn-bg` and `--btn2-bg-hover` and sets `color-scheme`, so the
// legend, the rows, the hints, the dot and the hover follow it with no class of
// their own. Two classes are ADDED, never swapped: the input's corner, and the
// error's on-dark constant — `--color-error` is 2.93:1 on the scope's ground.
// Outside the scope neither applies, so `(auth)/choose-org`, the one public
// caller, renders exactly as before.
//
// `role="radiogroup"` with an explicit `aria-labelledby`: the role is what
// carries `aria-invalid` for the group, and naming it from the legend by id
// rather than relying on implicit legend naming is the difference between
// "works in the browsers we tested" and "works".

// ★★ A CONTROLLED GROUP SURVIVES A FORM RESET (REQ-UIX-011) — the same defect
// and the same repair as `ui/switch`: React resets a `<form action>` after
// every submission and never moves a controlled radio's `defaultChecked`, so
// the group fell back to the option it mounted with while its state held
// another. After every commit the radio matching `value` is re-checked and made
// the default.
/**
 * ★ WAVE 19 (DEC-214 §5, `Propose.dc.html`'s «مستوى الجلسة»), add-only — every caller before it is unchanged.
 * `appearance="chips"` draws the options as equal segmented chips, the native radio kept (visually hidden, still
 * focused and still the form's value); `required` marks the group positively (REQ-UIX-011): `aria-required` on the
 * radiogroup, and `requiredLabel` — the caller's «مطلوب», since a primitive reads no catalogue — after the legend,
 * exactly as `<Field>` draws it. To be folded into `RadioGroupProps` in `ui/index.ts` by the lead.
 */
export type RadioGroupWave19Props = RadioGroupProps & {
  appearance?: "rows" | "chips";
  required?: boolean;
  requiredLabel?: string;
};

// The chip: the whole label is the target (44 px), the checked one in the accent, the keyboard focus drawn on the
// chip because the radio inside it is visually hidden.
const CHIP =
  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-pill border border-edge bg-raised px-3 text-label text-fg-heading has-[:checked]:border-transparent has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]";

export function RadioGroup({
  name,
  options,
  legend,
  defaultValue,
  value,
  onChange,
  invalid,
  error,
  className = "",
  appearance = "rows",
  required,
  requiredLabel,
}: RadioGroupWave19Props) {
  const legendId = useId();
  const hintId = useId();
  const errorId = useId();
  // An error makes the group invalid unless the caller says otherwise, as `<Field>` does.
  const isInvalid = invalid ?? Boolean(error);
  const controlled = value !== undefined;
  const group = useRef<HTMLFieldSetElement>(null);

  useLayoutEffect(() => {
    if (!group.current || value === undefined) return;
    for (const radio of Array.from(group.current.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) {
      const chosen = radio.value === value;
      if (radio.defaultChecked !== chosen) radio.defaultChecked = chosen;
      if (radio.checked !== chosen) radio.checked = chosen;
    }
  });

  return (
    <fieldset
      ref={group}
      id={name}
      role="radiogroup"
      aria-labelledby={legendId}
      aria-invalid={isInvalid || undefined}
      aria-required={required || undefined}
      aria-describedby={error ? errorId : undefined}
      className={className}
    >
      <legend id={legendId} className="text-label text-fg-heading">
        {legend}
        {required && requiredLabel ? (
          <>
            {" "}
            <span className="ms-2 text-caption font-normal text-fg-muted">{requiredLabel}</span>
          </>
        ) : null}
      </legend>
      {appearance === "chips" ? (
        <div data-appearance="chips" className="mt-2 flex gap-2">
          {options.map((option) => (
            <label key={option.value} className={`${CHIP} ${option.disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              {/* ui-lint-disable-next-line field — the label IS the wrapper (`16` §17) */}
              <input
                type="radio"
                name={name}
                value={option.value}
                disabled={option.disabled}
                className="sr-only"
                {...(controlled
                  ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                  : { defaultChecked: option.value === defaultValue, onChange: () => onChange?.(option.value) })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-2">
          {options.map((option, index) => (
            <div key={option.value}>
              <label
                className={`flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body pg:rounded-input ${option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[var(--btn2-bg-hover)]"}`}
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
      )}
      {/* The same shape as `<Field>`'s error, and for the same reason no `role="alert"`: the form's
          summary is the announcement; this is what is read on ARRIVAL, through the group's
          `aria-describedby`. */}
      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-caption text-error pg-dark:text-error-on-dark">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
