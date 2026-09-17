"use client";

import { useLayoutEffect, useRef, type ChangeEvent } from "react";
import type { SelectProps } from "@/components/ui";
import { controlClass, describedIds, useFieldWiring } from "@/components/ui/field";

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

// ★★ WHAT IS ON SHOW SURVIVES A FORM RESET (REQ-UIX-011). React calls the
// native `form.reset()` after EVERY `<form action>` submission — a refusal and
// a success alike — at the end of the commit's mutation phase. A reset puts
// each option back to `defaultSelected`, and React never keeps that in step for
// a select: `defaultValue` marks an option at mount only, and a controlled
// `value` marks none. So a refused form showed the option the select MOUNTED
// with while its state held another, and the next submission posted what was
// on show — a second «احفظ» silently undid the first. Found by `console` on
// the manual award (wave 8, sync 2); it reached the schedule form too.
//   · Controlled: after every commit — a layout effect runs after the reset —
//     the option matching `value` is re-selected and made the default.
//   · Uncontrolled: the admin's own change is made the default, so the reset
//     restores it. A form that should come back empty after a success remounts
//     (a `key`), which is how this product's forms already start over.

function keepAsDefault(select: HTMLSelectElement, isChosen: (option: HTMLOptionElement) => boolean) {
  for (const option of Array.from(select.options)) {
    const chosen = isChosen(option);
    // Only a mark that differs is touched: setting `defaultSelected` on an
    // option nobody chose would select it.
    if (option.defaultSelected !== chosen) option.defaultSelected = chosen;
    if (option.selected !== chosen) option.selected = chosen;
  }
}

export function Select({ invalid, className = "", children, "aria-describedby": describedBy, ref, onChange, ...props }: SelectProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const own = useRef<HTMLSelectElement | null>(null);
  const { value } = props;

  useLayoutEffect(() => {
    const select = own.current;
    if (!select || value === undefined) return;
    const wanted = new Set((Array.isArray(value) ? value : [value]).map(String));
    keepAsDefault(select, (option) => wanted.has(option.value));
  });

  return (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <select
      id={field?.id}
      aria-describedby={describedIds(field?.describedBy, describedBy)}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, "md", className)}
      {...props}
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => {
        if (value === undefined) keepAsDefault(event.currentTarget, (option) => option.selected);
        onChange?.(event);
      }}
    >
      {children}
    </select>
  );
}
