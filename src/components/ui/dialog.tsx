"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { CloseIcon } from "@/components/ui/icons";

// The house dialog: Radix for focus trapping, escape, outside-click and the
// accessible wiring (DEC-019); the house tokens for the look. Direction comes
// from the layout's `Direction.Provider`, so nothing here knows about RTL.
//
// Two rules the wrapper enforces rather than documents:
//   · every dialog has a title — `DialogContent` requires one, because a
//     dialog without an accessible name is announced as "dialog" and nothing
//     else;
//   · the close control's label is a prop, not a string baked in here, so it
//     comes from the message catalogue like every other user-facing string.

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

type ContentProps = Omit<ComponentProps<typeof RadixDialog.Content>, "title"> & {
  /** The dialog's accessible name and visible heading. */
  title: ReactNode;
  /** Optional supporting text, announced with the title. */
  description?: ReactNode;
  /** Label for the close button, from `ui.dialog.close`. */
  closeLabel: string;
};

export function DialogContent({ title, description, closeLabel, children, className = "", ...props }: ContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-navy-950)]/60 motion-safe:animate-[fade-in_150ms_ease-out]" />
      <RadixDialog.Content
        className={`fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[calc(100dvh-2rem)] w-auto max-w-lg -translate-y-1/2 overflow-y-auto rounded-field bg-[var(--color-canvas)] p-6 text-[var(--fg-body)] shadow-xl outline-none sm:inset-x-auto sm:start-1/2 sm:w-full sm:-translate-x-1/2 rtl:sm:translate-x-1/2 ${className}`}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title className="text-h3 text-[var(--fg-heading)]">{title}</RadixDialog.Title>
          <RadixDialog.Close
            aria-label={closeLabel}
            className="-me-2 -mt-2 inline-flex size-10 shrink-0 items-center justify-center rounded-field text-[var(--fg-muted)] transition-colors hover:bg-[var(--btn2-bg-hover)] hover:text-[var(--fg-heading)]"
          >
            <CloseIcon className="text-xl" />
          </RadixDialog.Close>
        </div>
        {description ? <RadixDialog.Description className="mt-2 text-body text-[var(--fg-muted)]">{description}</RadixDialog.Description> : null}
        <div className="mt-5">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
