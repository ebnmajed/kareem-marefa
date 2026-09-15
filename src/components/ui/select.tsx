"use client";

import type { SelectProps } from "@/components/ui";
import { controlClass, useFieldWiring } from "@/components/ui/field";

// The house select — `16` §4.2, REQ-UIX-009. Same contract as `ui/input`.
//
// ★ THE NATIVE CONTROL, AND THE NATIVE ARROW. No `appearance-none` and no
// drawn chevron, on purpose. A custom indicator has to be positioned, and a
// positioned indicator in a bidirectional product is a physical-property
// decision that `rtl:` variants cannot rescue (`10` §2.3 — they add no
// specificity, so the physical utility wins). The browser already puts its own
// indicator on the correct side of a `dir="rtl"` select, picks up the platform
// theme, and opens a picker that works on a phone. The rich, searchable,
// Arabic-normalised control is `ui/combobox`, which is `console`'s and is a
// different component for a different job (`16` §4.2 ★).

export function Select({ invalid, className = "", children, ...props }: SelectProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <select
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, "md", className)}
      {...props}
    >
      {children}
    </select>
  );
}
