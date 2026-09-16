"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardBody } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { type ModerationState } from "./actions";
import { emptyModerationState } from "./state";

// One card of SCR-050's queue — the comment report queue — rebuilt onto the
// system for wave 7 (`16` §6.7, `DEC-137`). Same shape as
// `moderation/reports/report-card.tsx` (wave 6's proven pattern for this
// exact "resolve a report, the row then disappears" case), minus
// `CardMedia`: a comment report has no photo to show.
//
// ★ Remove gets `ui/dialog`'s confirmation (`REQ-UIX-013`) — removal is
// permanent and reverses the comment's points award (`REQ-PTS-013`). The
// reason `Field`+`Textarea` lives INSIDE the dialog's own `<form>`, one step,
// same as the photo report card. Dismiss stays one click, its own `<form>`
// sharing the same `useActionState` action.
export function ReportCard({
  action,
  sessionTitle,
  children,
}: {
  action: (prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  sessionTitle: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.moderation");
  const toast = useToast();
  // ★ Fired from INSIDE the action, not a `useEffect` reacting to `state` —
  // exactly the fix wave 6's own note (`docs/plan/notes/console.md` §12)
  // found for `moderation/reports/report-card.tsx`: resolving drops this
  // card from the list in the SAME commit the toast would have to fire from,
  // and React discards a fiber's pending update when its parent's
  // reconciliation removes that fiber in the same commit — an effect keyed
  // on `state` never gets to run for the disappearing card.
  const [state, formAction, pending] = useActionState(async (prev: ModerationState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) toast.show({ title: t("done"), tone: "success" });
    else if (result.error) toast.show({ title: t(`error.${result.error}`), tone: "error" });
    return result;
  }, emptyModerationState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();

  // Closing the dialog is DERIVED from `state`, adjusted DURING RENDER — the
  // same pattern `members-table.tsx`'s `ActionsCell` and the photo report
  // card use, safe even though the success case above usually never reaches
  // this render at all: on the error path (the card survives) this still
  // runs normally, and the dialog correctly stays open to show the inline
  // field error.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.done) setConfirmOpen(false);
  }

  return (
    <Card>
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
            <DialogContent
              title={t.rich("removeCommentConfirmTitle", { session: sessionTitle, t: (chunks) => <bdi>{chunks}</bdi> })}
              closeLabel={t("closeDialog")}
            >
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
