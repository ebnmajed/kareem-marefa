"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { type ModerationState } from "./actions";
import { emptyModerationState } from "./state";

// One card of SCR-052's queue — the photo report queue, not yet hidden —
// rebuilt onto the system for wave 6 (`16` §6.7, `DEC-130`). `Card`, not
// `DataTable`: DEC-130's own DataTable justification names proposals/
// sessions/members specifically and treats this route as "where a flag
// lands," not a third table candidate — a photo-review queue is card-first
// at every width because the photo IS the primary content.
//
// ★ Remove gets `ui/dialog`'s confirmation (`REQ-UIX-013`) — the photo leaves
// the session permanently. The reason `Field`+`Textarea` lives INSIDE the
// dialog's own `<form>`, not behind a details-then-dialog two-step: there is
// no existing "reveal the reason first" affordance to preserve here (unlike
// proposals/sessions' reason box), so the dialog itself is the one step,
// matching `admin/members/members-table.tsx`'s `ActionsCell` shape — a
// self-contained form entirely inside the portalled `DialogContent`, so no
// `form={id}` association trick is needed at all. Dismiss stays one click,
// its own separate `<form>` sharing the SAME `useActionState` action.
export function ReportCard({
  action,
  photoUrl,
  sessionTitle,
  children,
}: {
  action: (prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  photoUrl: string;
  sessionTitle: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.moderation");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, emptyModerationState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();

  // Closing the dialog is DERIVED from `state`, adjusted DURING RENDER — the
  // same pattern `members-table.tsx`'s `ActionsCell` uses and the same
  // reason: `react-hooks/set-state-in-effect` refuses a `setState` call
  // inside the effect below, which stays for the genuine side effect (the
  // toast) alone.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.done) setConfirmOpen(false);
  }

  useEffect(() => {
    if (state.done) toast.show({ title: t("done"), tone: "success" });
    else if (state.error) toast.show({ title: t(`error.${state.error}`), tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast`/`t` are stable; re-running on them would re-fire the same acknowledgement.
  }, [state]);

  return (
    <Card>
      <CardMedia src={photoUrl || undefined} placeholderFrom={sessionTitle} aspect="16/9" alt="" />
      <CardBody>
        {children}

        {state.error ? (
          <p role="alert" className="text-body-sm text-fg-heading">
            {t(`error.${state.error}`)}
          </p>
        ) : null}

        <CardActions className="mt-2 flex-wrap">
          <form action={formAction}>
            <Button type="submit" name="action" value="dismiss" variant="secondary" size="sm" disabled={pending}>
              {t("dismiss")}
            </Button>
          </form>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
              {t("remove")}
            </Button>
            <DialogContent title={t("removeConfirmTitle", { session: sessionTitle })} closeLabel={t("closeDialog")}>
              <form action={formAction}>
                <Field
                  id={reasonId}
                  label={t("reasonLabel")}
                  hint={t("reasonHint")}
                  required
                  error={state.error === "reason_required" ? t("error.reason_required") : undefined}
                >
                  <Textarea name="reason" rows={3} maxLength={300} />
                </Field>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="submit" name="action" value="remove" variant="danger" disabled={pending}>
                    {t("send")}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      {t("cancelDialogCancel")}
                    </Button>
                  </DialogClose>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardActions>
      </CardBody>
    </Card>
  );
}
