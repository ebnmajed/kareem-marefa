"use client";

import type { SplitViewProps } from "@/components/ui";
import { Link } from "@/i18n/navigation";

// `sessions'` · a list beside a detail — REQ-UIX-085, REQ-UIX-088, DEC-NEXT-27.
//
// ★ A STUB, landed by the lead with its signature and registry entry (contract 2, `DEC-227`) so the gate stays green
// while `sessions` writes it to its plan (`notes/sessions.md` W21.2): the roving tabindex, ↑ ↓ Home End, focus never
// lost, `useSplitView().focusNext()`. What is here already: the open row's `aria-current`, the two panes, `narrow`
// below `lg`, the back link. No animation.

export function useSplitView(): { focusNext: () => void } {
  return { focusNext: () => {} };
}

export function SplitView({ label, items, currentId, toolbar, empty, detail, detailLabelledBy, narrow, back, className = "" }: SplitViewProps) {
  return (
    <div data-slot="split-view" className={`lg:grid lg:grid-cols-[22.5rem_1fr] lg:gap-6 ${className}`}>
      <div className={narrow === "detail" ? "hidden lg:block" : undefined}>
        {toolbar}
        {items.length === 0 ? (
          empty
        ) : (
          <ul aria-label={label} className="flex flex-col gap-1">
            {items.map((item) => {
              const open = item.id === currentId;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    scroll={false}
                    aria-current={open ? "page" : undefined}
                    className={`block rounded-field border p-3 ${open ? "border-accent bg-raised" : "border-transparent hover:bg-hover"}`}
                  >
                    {item.children}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <section aria-labelledby={detailLabelledBy} className={narrow === "list" ? "hidden lg:block" : undefined}>
        {back ? (
          <Link href={back.href} className="mb-3 inline-block text-label lg:hidden">
            {back.label}
          </Link>
        ) : null}
        {detail}
      </section>
    </div>
  );
}
