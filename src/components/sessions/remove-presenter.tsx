"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircleIcon } from "@/components/ui/icons";
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

/**
 * The words, when the caller is not the proposal page. Pre-rendered by the
 * caller with `<bdi>` around the name (SCR-043 speaks of a session, not a
 * proposal). Absent, the component says exactly what it said before wave 12.
 */
export interface RemovePresenterMessages {
  trigger: ReactNode;
  title: ReactNode;
  body: string;
  confirm: string;
  cancel: string;
}

/**
 * `action` may return a refusal, already worded; it is shown inside the dialog
 * so the person pressing «أزل» reads why nothing happened where they pressed
 * it. The proposal's action returns nothing, and never shows one.
 */
export function RemovePresenter({
  name,
  action,
  messages,
}: {
  name: string | null;
  action: () => Promise<void | { error: string }>;
  messages?: RemovePresenterMessages;
}) {
  const t = useTranslations("proposals.proposal");
  const ui = useTranslations("ui.dialog");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async () => (await action()) ?? null, null);
  const named = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const words: RemovePresenterMessages = messages ?? {
    trigger: t.rich("removeLabel", { name: name ?? "", t: named }),
    title: t.rich("removeConfirmTitle", { name: name ?? "", t: named }),
    body: t("removeConfirmBody"),
    confirm: t("removeConfirm"),
    cancel: t("cancel"),
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="md" className="text-fg-muted">
          {words.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={words.title} description={words.body} closeLabel={ui("close")}>
        <form action={formAction} className="flex flex-wrap gap-2">
          {state?.error ? (
            <p role="alert" className="flex w-full items-start gap-2 text-caption text-error">
              <AlertCircleIcon className="mt-[0.2em]" />
              <span>{state.error}</span>
            </p>
          ) : null}
          <SubmitButton variant="danger" size="md">
            {words.confirm}
          </SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md">
              {words.cancel}
            </Button>
          </DialogClose>
        </form>
      </DialogContent>
    </Dialog>
  );
}
