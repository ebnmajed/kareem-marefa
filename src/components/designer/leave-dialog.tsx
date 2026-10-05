"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// SCR-057 — the leave dialog: save · discard · stay (REQ-DSG-036, STORY-DSG-019, DEC-258 §2.2). ★ The one thing the
// designer needs that none of the house's seven leave dialogs has: «save» as an answer — and a save can fail, so it
// keeps the person in the editor with the failure on the bar. A title and three buttons; no body (DEC-NEXT-25). The
// studio is the sober register (REQ-UIX-053): nothing here animates — `ui/dialog`'s own overlay is what it is
// (DEC-259 §1.5).

export interface LeaveDialogProps {
  open: boolean;
  /** «احفظ وغادر» is in flight: every answer waits for it. */
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
  /** Where focus returns when the person stays — the link they pressed, which Safari never focuses on a click. */
  returnFocus: HTMLElement | null;
}

export function LeaveDialog({ open, pending, onSave, onDiscard, onStay, returnFocus }: LeaveDialogProps) {
  const t = useTranslations("designer.leave");
  const ui = useTranslations("ui");
  const save = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onStay()}>
      <DialogContent
        title={t("title")}
        closeLabel={ui("dialog.close")}
        onOpenAutoFocus={(event) => {
          // Radix would focus «×», the first tabbable in the header; the answer most people want is «احفظ وغادر».
          event.preventDefault();
          save.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocus || !returnFocus.isConnected) return;
          event.preventDefault();
          returnFocus.focus();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <Button ref={save} type="button" size="md" pending={pending} onClick={onSave}>
            {t("save")}
          </Button>
          <Button type="button" variant="secondary" size="md" disabled={pending} onClick={onDiscard}>
            {t("discard")}
          </Button>
          <Button type="button" variant="ghost" size="md" disabled={pending} onClick={onStay}>
            {t("stay")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
