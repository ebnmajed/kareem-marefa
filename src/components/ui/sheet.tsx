"use client";

import { Dialog as RadixDialog } from "radix-ui";
import type { SheetProps } from "@/components/ui";

// The house sheet over Radix Dialog (DEC-019) — `dialog.tsx` is the house
// precedent for the wrapper shape; this is the same primitive, positioned at
// an edge instead of centred, for the search sheet, the filter sheet and
// anything that would otherwise be a modal at 390 px. Direction comes from
// the layout's `Direction.Provider`; `side="inline-start"/"inline-end"`
// resolves against THAT, never against the DOM, so it never needs its own
// RTL branch.
//
// No close button is rendered: `SheetProps`, unlike `DialogContent`, carries
// no `closeLabel` — deliberately, per the frozen contract (`ui/index.ts`).
// Escape and a tap on the scrim (Radix's own default `onEscapeKeyDown` /
// `onPointerDownOutside` behaviour, wired through `onOpenChange`) are both
// still live; a caller that wants an explicit "تم"/"إلغاء" affordance places
// one in `children`, in its own already-localised namespace.
//
// No entrance/exit animation: `16` §16.2 moves the motion system to M10 —
// only the `--dur-*`/`--ease-out` TOKENS ship in M9, and this primitive has
// no screen to celebrate yet.

const sidePosition: Record<NonNullable<SheetProps["side"]>, string> = {
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-card border-t",
  "inline-start": "inset-y-0 start-0 h-dvh w-[min(22rem,86vw)] border-e",
  "inline-end": "inset-y-0 end-0 h-dvh w-[min(22rem,86vw)] border-s",
};

export function Sheet({ open, onOpenChange, title, description, side = "bottom", children }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-navy-950)]/60" />
        <RadixDialog.Content
          className={`fixed z-50 overflow-y-auto border-edge bg-[var(--color-canvas)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-fg-body shadow-xl outline-none ${sidePosition[side]}`}
        >
          {side === "bottom" ? (
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge-strong" />
          ) : null}
          <RadixDialog.Title className="text-h3 text-fg-heading">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-body-sm text-fg-muted">{description}</RadixDialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
