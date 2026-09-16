"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";

// SCR-018 — the proposer takes a named co-presenter off their proposal
// (REQ-PRO-003), confirmed in a dialog that names the person (REQ-UIX-013).
// It was a bare underlined button: one press removed a colleague, with nothing
// said before or after.
//
// The confirm is a real <form> around the bound Server Action, so it works
// the way every other write on the page does and the pending state is
// `useFormStatus`'s. On success the page re-renders without this row and the
// dialog goes with it. The dialog is controlled, and the confirm is not
// `DialogClose asChild` — that shape timed out on a real build
// (`photos/takedown-button.tsx`).

export function RemovePresenter({ name, action }: { name: string | null; action: () => Promise<void> }) {
  const t = useTranslations("proposals.proposal");
  const ui = useTranslations("ui.dialog");
  const [open, setOpen] = useState(false);
  const named = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="md" className="text-fg-muted">
          {t.rich("removeLabel", { name: name ?? "", t: named })}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.rich("removeConfirmTitle", { name: name ?? "", t: named })} description={t("removeConfirmBody")} closeLabel={ui("close")}>
        <form action={action} className="flex flex-wrap gap-2">
          <SubmitButton variant="danger" size="md">
            {t("removeConfirm")}
          </SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md">
              {t("cancel")}
            </Button>
          </DialogClose>
        </form>
      </DialogContent>
    </Dialog>
  );
}
