"use client";

import { DropdownMenu } from "radix-ui";
import type { MenuProps } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

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
//
// ★ `href` items go through `ui/link`, not a raw `<a>` (found while planning
// wave 6, fixed here — `menu.tsx` is console's own file). A house `href` is
// always written locale-less (`/app/admin/sessions`); a plain `<a>` sends
// that straight to the browser as a hard navigation, which `proxy.ts` then
// 307s back through locale detection rather than landing on it directly, and
// it never draws the pending dot `ui/route-progress` reads. `Link` renders
// `next/link`'s own `<a>` as its root (with `LinkPendingReporter` nested
// inside, not a sibling), so `DropdownMenu.Item asChild` composes with it the
// same way it did with the bare `<a>` — `quiet`, since the dot would be noise
// beside a menu item's own icon.

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
            // The page on show: `aria-current` for a screen reader, and a check
            // at the inline end with the rail's own current tint, so the mark is
            // never colour alone (wave 8 — the collapsed admin rail's group menu).
            const content = (
              <>
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.current ? <CheckIcon className="shrink-0 text-[1rem]" /> : null}
              </>
            );
            const className = `${itemBase} ${item.current ? "bg-silver-100" : ""} ${item.tone ? (toneClass[item.tone] ?? "") : ""}`;
            const current = item.current ? ("page" as const) : undefined;
            return (
              <div key={item.label + i}>
                {item.startsGroup ? <DropdownMenu.Separator className="my-1.5 h-px bg-edge" /> : null}
                {item.href ? (
                  <DropdownMenu.Item asChild disabled={item.disabled} className={className}>
                    <Link href={item.href} quiet aria-current={current}>
                      {content}
                    </Link>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item disabled={item.disabled} onSelect={item.onSelect} aria-current={current} className={className}>
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
