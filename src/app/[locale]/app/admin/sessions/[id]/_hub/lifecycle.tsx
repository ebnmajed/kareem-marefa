"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { emptyLifecycleState, type LifecycleState } from "./lifecycle-state";

// The header's lifecycle action — REQ-UIX-089, DEC-228 §4.2. ONE action, by the stored state, an admin's only:
// «انشر» for a session not yet published (disabled while REQ-SES-001's gate is unmet, saying what is missing — a line
// that changes what the admin does next); «ألغِ الجلسة» for a published or running one, confirmed in a dialog naming
// it, with the written reason REQ-SES-010 requires (REQ-UIX-013). Nothing for completed, archived or cancelled.
// The server decides which (`hub-header.tsx`); this draws it. Bound actions only — no closure crosses the boundary.
//
// ★ The toast fires from inside the action wrapper, never from an effect: the header re-renders with the new state in
// the same commit, and this control (the thing that changed) is replaced by the next state's (`review-card`'s lesson).

type Action = (prev: LifecycleState, formData: FormData) => Promise<LifecycleState>;

function useLifecycle(action: Action) {
  const t = useTranslations("sessions.hub.lifecycle");
  const toast = useToast();
  return useActionState(async (prev: LifecycleState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) toast.show({ title: t(result.done), tone: "success" });
    else if (result.error === "failed") toast.show({ title: t("failed"), tone: "error" });
    return result;
  }, emptyLifecycleState);
}

export function PublishAction({ action, missing }: { action: Action; missing: string | null }) {
  const t = useTranslations("sessions.hub.lifecycle");
  const [, formAction, pending] = useLifecycle(action);
  const noteId = useId();
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {missing ? (
        <p id={noteId} className="text-body-sm text-fg-muted">
          {t("missing", { list: missing })}
        </p>
      ) : null}
      <Button type="submit" size="md" disabled={missing !== null} aria-describedby={missing ? noteId : undefined} pending={pending} pendingLabel={t("pending")}>
        {t("publish")}
      </Button>
    </form>
  );
}

export function CancelAction({ action, title }: { action: Action; title: string }) {
  const t = useTranslations("sessions.hub.lifecycle");
  const [state, formAction, pending] = useLifecycle(action);
  const [open, setOpen] = useState(false);
  // Closed by the RESULT, never on click — a submission across the portal must finish first (`review-card`'s race).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.done) setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="quiet" size="md">
          {t("cancel")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.rich("cancelTitle", { title, t: (chunks) => <bdi>{chunks}</bdi> })} description={t("cancelBody")} closeLabel={t("close")}>
        <form action={formAction} noValidate className="mt-4 space-y-4">
          <Field label={t("reasonLabel")} error={state.error === "reasonRequired" ? t("reasonRequired") : undefined}>
            <Textarea name="reason" rows={3} maxLength={2000} defaultValue={state.reason} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" size="md" pending={pending} pendingLabel={t("pending")}>
              {t("confirm")}
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
