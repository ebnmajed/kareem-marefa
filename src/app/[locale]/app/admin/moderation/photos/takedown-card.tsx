"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { type ModerationState } from "./actions";
import { emptyModerationState } from "./state";

// One card of SCR-051's queue — the photo TAKEDOWN queue, already hidden —
// rebuilt onto the system for wave 7 (`16` §6.7, `DEC-137`). Same shape as
// `moderation/reports/report-card.tsx` (wave 6's proven pattern), `CardMedia`
// included since a takedown IS a photo. `restore` stays instant, one click,
// no dialog — reversible, and the takedown queue exists precisely so a
// mistaken request can be undone quickly. `remove` is permanent, so it gets
// `ui/dialog`'s confirmation (`REQ-UIX-013`), the reason `Field`+`Textarea`
// inside the dialog's own form, one step.
export function TakedownCard({
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
  // ★ Fired from INSIDE the action, not a `useEffect` — both `restore` and
  // `remove` drop this card from the open-takedowns list in the same commit
  // the toast would have to fire from. See `report-card.tsx`'s sibling
  // comment (this queue's own bundle) and wave 6's note §12 for the bug this
  // avoids from the start.
  const [state, formAction, pending] = useActionState(async (prev: ModerationState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) toast.show({ title: t("done"), tone: "success" });
    else if (result.error) toast.show({ title: t(`error.${result.error}`), tone: "error" });
    return result;
  }, emptyModerationState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();

  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.done) setConfirmOpen(false);
  }

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
            <Button type="submit" name="action" value="restore" variant="secondary" size="sm" disabled={pending}>
              {t("restore")}
            </Button>
          </form>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
              {t("remove")}
            </Button>
            <DialogContent
              title={t.rich("removeConfirmTitle", { session: sessionTitle, t: (chunks) => <bdi>{chunks}</bdi> })}
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
