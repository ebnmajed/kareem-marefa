"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { CloseIcon } from "@/components/ui/icons";
import { usePlayPortal } from "@/components/ui/scope-portal";

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
  /**
   * `media` — the whole viewport on a dark ground, inside the device's safe
   * areas, with the body taking every remaining pixel: for showing one
   * photograph whole (`REQ-EVT-016`, DEC-182, `content`'s R1). The caller lays
   * the image out in the body; this frame never crops or scales it.
   */
  size?: "default" | "media";
};

// ★ `pg:bg-surface` is not decoration. The frame's own background is
// `bg-[var(--color-canvas)]`, and that variable is resolved at the ROOT — it is
// white inside `.theme-dark` and inside the playground alike — while the text
// beside it reads `--fg-body`, which the scope does reassign. Without a
// background of the scope's the dialog was the scope's light text on white. Only
// a browser could see it (`tests/e2e/wave15-lead-gallery.spec.ts`); jsdom
// computes no colour. The surface, not the ground: a dialog is told from the page
// by its surface and a line (DEC-186 §8).
const FRAME = {
  default:
    "fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[calc(100dvh-2rem)] w-auto max-w-lg -translate-y-1/2 overflow-y-auto rounded-field bg-[var(--color-canvas)] p-6 text-[var(--fg-body)] shadow-xl outline-none sm:inset-x-auto sm:start-1/2 sm:w-full sm:-translate-x-1/2 rtl:sm:translate-x-1/2 pg:rounded-panel pg:border pg:border-edge-strong pg:bg-surface pg:shadow-none",
  // Safe-area padding is symmetric on the inline axis (the larger of the two
  // insets), so it needs no direction: a notch on either side is cleared.
  media:
    "fixed inset-0 z-50 flex flex-col bg-[var(--color-navy-950)] px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white outline-none pg-dark:bg-canvas",
} as const;

export function DialogContent({ title, description, closeLabel, size = "default", children, className = "", ...props }: ContentProps) {
  const media = size === "media";
  // ★ Wave 15 (DEC-188): inside the playground's scope the portal lands INSIDE
  // the scope's element, so the dialog wears the scope. Outside a scope this is
  // `undefined` — Radix's default, `<body>`, exactly as before.
  const landing = usePlayPortal();
  return (
    <RadixDialog.Portal container={landing}>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-navy-950)]/60 motion-safe:animate-[fade-in_150ms_ease-out] pg:bg-scrim" />
      <RadixDialog.Content className={`${FRAME[size]} ${className}`} data-size={size} data-dialog="" {...props}>
        <div className={`flex items-start justify-between gap-4 ${media ? "shrink-0 items-center" : ""}`}>
          <RadixDialog.Title className={media ? "min-w-0 text-body font-semibold text-white" : "text-h3 text-[var(--fg-heading)]"}>
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close
            aria-label={closeLabel}
            className={
              media
                ? "-me-2 inline-flex size-11 shrink-0 items-center justify-center rounded-field text-white/85 transition-colors hover:bg-white/10 hover:text-white pg:rounded-pill"
                : "-me-2 -mt-2 inline-flex size-10 shrink-0 items-center justify-center rounded-field text-[var(--fg-muted)] transition-colors hover:bg-[var(--btn2-bg-hover)] hover:text-[var(--fg-heading)] pg:rounded-pill"
            }
          >
            <CloseIcon className="text-xl" />
          </RadixDialog.Close>
        </div>
        {description ? (
          <RadixDialog.Description className={media ? "mt-1 text-body text-white/75" : "mt-2 text-body text-[var(--fg-muted)]"}>
            {description}
          </RadixDialog.Description>
        ) : null}
        <div className={media ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-5"}>{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
