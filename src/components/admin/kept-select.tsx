"use client";

import type { SelectProps } from "@/components/ui";
import { Select } from "@/components/ui/select";

// A `ui/select` whose choice survives the reset React runs on a
// `<form action>` after EVERY submission — a refusal included (REQ-UIX-011).
//
// A reset puts each control back to its default. React keeps an input's and a
// textarea's default in step with its props, and an uncontrolled checkbox's or
// radio's; it never does for a `<select>`: `defaultValue` marks an option at
// mount only, and a controlled `value` marks none. So a refused form showed
// the option the select mounted with — or its first — while every field
// around it kept what was typed, and a controlled select showed one option
// while its state held another. Found on the manual award: «اختر شارة» under
// «يحمل هذا العضو الشارة».
//
// The option on show is marked as the default whenever it can change: on the
// admin's own change, and after every render, which is where a controlled
// `value` lands. A reset then restores what was on show.
//
// ★ This belongs in `ui/select`, where every form would get it — requested in
// `docs/plan/notes/console.md`; the wrapper goes when the primitive has it.

function markShownAsDefault(select: HTMLSelectElement) {
  for (const option of Array.from(select.options)) {
    // Only an option whose mark differs is touched: adding `selected` to an
    // option nobody has chosen would select it.
    if (option.defaultSelected !== option.selected) option.defaultSelected = option.selected;
  }
}

export function KeptSelect({ onChange, ...props }: Omit<SelectProps, "ref">) {
  return (
    <Select
      {...props}
      ref={(select) => {
        if (select) markShownAsDefault(select);
      }}
      onChange={(event) => {
        markShownAsDefault(event.currentTarget);
        onChange?.(event);
      }}
    />
  );
}
