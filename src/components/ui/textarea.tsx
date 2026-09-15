"use client";

import type { TextareaProps } from "@/components/ui";
import { controlClass, useFieldWiring } from "@/components/ui/field";

// The house textarea — `16` §4.2, REQ-UIX-009. Same contract as `ui/input`:
// `<Field>` owns the labelling, this reads it off the context.
//
// ★ NEVER `overflow: hidden` ON A TEXT LINE — it clips tashkeel (`10` §1).
// A textarea scrolls, which is a different thing and is correct. What this
// must not gain is a fixed height with hidden overflow «to keep the form
// tidy»; `rows` and `field-sizing` are how it grows.

export function Textarea({ invalid, className = "", rows = 5, ...props }: TextareaProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <textarea
      id={field?.id}
      rows={rows}
      aria-describedby={field?.describedBy}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, "md", `min-h-32 ${className}`)}
      {...props}
    />
  );
}
