"use client";

import type { TextareaProps } from "@/components/ui";
import { controlClass, describedIds, useFieldWiring } from "@/components/ui/field";

// The house textarea — `16` §4.2, REQ-UIX-009. Same contract as `ui/input`:
// `<Field>` owns the labelling, this reads it off the context.
//
// ★ NEVER `overflow: hidden` ON A TEXT LINE — it clips tashkeel (`10` §1).
// A textarea scrolls, which is a different thing and is correct. What this
// must not gain is a fixed height with hidden overflow «to keep the form
// tidy»; `rows` and `field-sizing` are how it grows.
//
// ★ `min-h-32` APPLIES ONLY WHEN THE CALLER GAVE NO `rows`. It is the floor for
// the long-form default (five rows of an abstract), but a caller that asks for
// three rows — the discussion composer, which grows from a short start — must
// get three. A `min-h-*` class passed in cannot undo it: two utilities for one
// property resolve by emit order, not by the order they are written.

export function Textarea({ invalid, className = "", rows, "aria-describedby": describedBy, ...props }: TextareaProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <textarea
      id={field?.id}
      rows={rows ?? 5}
      aria-describedby={describedIds(field?.describedBy, describedBy)}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, "md", rows === undefined ? `min-h-32 ${className}` : className)}
      {...props}
    />
  );
}
