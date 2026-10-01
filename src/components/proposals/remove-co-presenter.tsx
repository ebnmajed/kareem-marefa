"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

// SCR-018 — the proposer takes a co-presenter off their proposal (REQ-PRO-003), confirmed in a `sheet` that names the
// person (DEC-213 §5.103, REQ-UIX-013). Offered on any row but the proposer's, in the four open states only (DEC-214
// D9) — the page decides that. The confirm is a real <form> around the bound Server Action; the page re-renders
// without the row and the sheet goes with it.
//
// A new file rather than `components/sessions/remove-presenter.tsx`, which SCR-043 (a frozen console screen) uses.

export function RemoveCoPresenter({ name, action }: { name: string | null; action: () => Promise<void> }) {
  const t = useTranslations("proposals.proposal");
  const [open, setOpen] = useState(false);
  // A plain string (an `aria-label`, a sheet's title), so the name is isolated with FSI … PDI — `<bdi>` in text.
  const isolate = (chunks: string) => `\u2068${chunks}\u2069`;
  const who = name ?? "";
  return (
    <>
      <IconButton label={t.markup("removeLabel", { name: who, t: isolate })} variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <CloseIcon />
      </IconButton>
      <Sheet open={open} onOpenChange={setOpen} title={t.markup("removeConfirmTitle", { name: who, t: isolate })} description={t("removeConfirmBody")}>
        <form action={action} className="flex flex-wrap gap-2">
          <SubmitButton variant="danger" size="md">
            {t("removeConfirm")}
          </SubmitButton>
          <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
