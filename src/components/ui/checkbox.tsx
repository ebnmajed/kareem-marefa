"use client";

import type { CheckboxProps } from "@/components/ui";

// The house checkbox — `16` §4.2, REQ-UIX-009, REQ-NFR-007.
//
// ★ IT IS SELF-LABELLING, SO IT DOES NOT GO INSIDE A `<Field>`. The label is
// the wrapper here — which is what makes the whole row a target rather than a
// 20 px square — and a `<Field>` around it would give the control a second
// label. That is an `axe` `form-field-multiple-labels` violation, not a matter
// of taste. A GROUP of checkboxes is a `<fieldset>` with a `<legend>`, the
// shape `ui/radio-group` uses; `<Field>` is for a control with one value.
//
// ★ THE WHOLE ROW IS THE TARGET. `min-h-11` is the 44 px floor, and it is on
// the label rather than the box: a member reserving a seat on a phone in a
// moving car should not have to hit a small square.
//
// Native, with `accent-color`. A drawn checkbox has to position its own tick,
// and a positioned tick is a physical-property decision in a bidirectional
// product; the platform control is already correct in both directions, in both
// themes, and with the platform's own high-contrast settings.

export function Checkbox({ label, className = "", disabled, ...props }: CheckboxProps) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-silver-100"} ${className}`}
    >
      {/* ui-lint-disable-next-line field — the label IS the wrapper (`16` §17) */}
      <input
        type="checkbox"
        disabled={disabled}
        className="size-5 shrink-0 accent-[var(--btn-bg)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
