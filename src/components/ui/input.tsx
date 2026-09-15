"use client";

import type { InputProps } from "@/components/ui";
import { controlClass, useFieldWiring } from "@/components/ui/field";

// The house text input — `16` §4.2, REQ-UIX-009.
//
// It carries no accessibility of its own: `<Field>` owns the label, the hint,
// the error and the aria, and this reads them off the context. Everything an
// explicit prop sets wins, and outside a `<Field>` this is an ordinary input
// with the house classes.
//
// ★ `size` IS THE DESIGN SIZE, not HTML's visible-character-width attribute —
// `InputProps` omits the native one, and the design value must not reach the
// element or the browser sizes the box in characters.

export function Input({ invalid, size = "md", className = "", ...props }: InputProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, size, className)}
      {...props}
    />
  );
}
