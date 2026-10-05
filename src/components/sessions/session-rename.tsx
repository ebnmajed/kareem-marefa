"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PROPOSAL_LIMITS } from "@/components/sessions/proposal-rules";
import { emptyRenameState, type RenameState } from "@/app/[locale]/app/admin/sessions/[id]/_hub/rename-state";

// The hub header's rename — REQ-SES-021, DEC-254 §5, DEC-255. An admin's, offered only before publication (the header
// decides, from the stored state); the database refuses it from `published` on whatever this draws. `CancelAction`'s
// pattern (`_hub/lifecycle.tsx`): a quiet trigger, a dialog naming the session, one field.
//
// ★ The saved state is the server's answer: the toast fires from the action's result, and the `h1` is re-rendered by the
// layout's revalidation from the row — nothing here shows a title it was not given. The dialog closes by the RESULT,
// never on click (a submission across the portal must finish first). Bound action only — no closure crosses the boundary.
// `locked` and `failed` are toasts, not field lines: a locked title re-renders the header without this control.

type Action = (prev: RenameState, formData: FormData) => Promise<RenameState>;

export function RenameAction({ action, title }: { action: Action; title: string }) {
  const t = useTranslations("sessions.hub.rename");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(async (prev: RenameState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.saved !== null) toast.show({ title: t("saved"), tone: "success" });
    else if (result.error === "locked" || result.error === "failed") toast.show({ title: t(result.error), tone: "error" });
    return result;
  }, emptyRenameState);
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.saved !== null || state.error === "locked") setOpen(false);
  }
  const fieldError = state.error === "tooShort" || state.error === "tooLong" ? t(state.error) : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="quiet" size="md">
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.rich("dialogTitle", { title, t: (chunks) => <bdi>{chunks}</bdi> })} closeLabel={t("close")}>
        <form action={formAction} noValidate className="mt-4 space-y-4">
          <Field label={t("label")} error={fieldError}>
            <Input name="title" maxLength={PROPOSAL_LIMITS.titleMax} defaultValue={state.error ? state.title : title} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="md" pending={pending} pendingLabel={t("pending")}>
              {t("save")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("keep")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
