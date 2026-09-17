"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

// A confirmation that names the object and states the consequence BEFORE the
// click — `REQ-UIX-013`. The console's one shape for it: deactivating a venue,
// retiring a badge, restoring an email template's default, releasing held
// certificates, writing a manual points adjustment into an append-only ledger.
//
// Controlled: the caller owns `open` and the control that opens it, because the
// thing being confirmed is sometimes a button beside it and sometimes a form's
// own submit. `onConfirm` is the caller's work; while it runs the confirm
// control is pending and cannot be pressed twice (`REQ-UIX-007`), and the
// caller decides whether to close — a refusal the dialog should show keeps it
// open.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  tone = "danger",
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the object — «إيقاف شارة «أول حضور»؟». */
  title: ReactNode;
  /** The consequence, in one or two sentences. */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** `danger` for what cannot be undone from here; `primary` for what can. */
  tone?: "danger" | "primary";
  pending?: boolean;
  onConfirm: () => void;
  /** Anything the decision needs beside the sentence — what is about to be written. */
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} closeLabel={closeLabel}>
        <div className="text-body text-fg-body">{body}</div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant={tone} pending={pending} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {cancelLabel}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
