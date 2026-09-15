"use client";

import { DropdownMenu } from "radix-ui";
import type { MenuProps } from "@/components/ui";

// The house dropdown menu over Radix (DEC-019), the same wrapper shape as
// `dialog.tsx`: Radix owns focus trapping, typeahead, roving tabindex and
// closing on Escape/outside-click/item-select; the house tokens own the
// look. Direction comes from the layout's `Direction.Provider` (wired once,
// `src/app/[locale]/layout.tsx`) — Radix's positioning primitives read it
// from context, not from the DOM, so nothing here mentions RTL.
//
// `trigger` keeps its own accessible name (16 §4.2's MenuProps comment) —
// this wrapper never renders a second one, it only makes the trigger open
// the menu.

const itemBase =
  "flex w-full items-center gap-2 rounded-field px-3 py-2 text-start text-body-sm text-fg-heading outline-none data-[highlighted]:bg-silver-100 data-[disabled]:pointer-events-none data-[disabled]:text-fg-muted/50";

const toneClass: Record<string, string> = {
  error: "text-error data-[highlighted]:bg-error-bg",
};

export function Menu({ trigger, items, align = "start" }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* No entrance animation in M9 — `16` §16.2 moves the motion system to
            M10 and only its duration/ease TOKENS ship here. */}
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-40 min-w-48 rounded-card border border-edge bg-canvas p-1.5 shadow-[var(--shadow-card)]"
        >
          {items.map((item, i) => {
            const content = (
              <>
                {item.icon}
                <span className="flex-1">{item.label}</span>
              </>
            );
            const className = `${itemBase} ${item.tone ? (toneClass[item.tone] ?? "") : ""}`;
            return (
              <div key={item.label + i}>
                {item.startsGroup ? <DropdownMenu.Separator className="my-1.5 h-px bg-edge" /> : null}
                {item.href ? (
                  <DropdownMenu.Item asChild disabled={item.disabled} className={className}>
                    <a href={item.href}>{content}</a>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item disabled={item.disabled} onSelect={item.onSelect} className={className}>
                    {content}
                  </DropdownMenu.Item>
                )}
              </div>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
