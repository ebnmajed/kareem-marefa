// STUB — console's file, published by the lead on day one of M9 so the four
// tracks typecheck against the interface before the implementation exists
// (`16` §16.0, DEC-085). Plain semantic HTML, no styling, no behaviour.
//
// console REPLACES this file. Nobody else edits it. The contract is the type
// in `@/components/ui` and it is append-only.

"use client";

import type { TabsProps } from "@/components/ui";

export function Tabs({ items, label, value, defaultValue, children, className = "" }: TabsProps) {
  const active = value ?? defaultValue;
  return (
    <div className={className}>
      <div role="tablist" aria-label={label}>
        {items.map((t) => (
          <a key={t.value} role="tab" aria-selected={t.value === active} href={t.href ?? `#${t.value}`}>
            {t.label}
          </a>
        ))}
      </div>
      {children}
    </div>
  );
}
