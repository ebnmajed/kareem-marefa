"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { usePendingNudge } from "@/components/ui/pending-nudge";
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
  // ★ The toast fires FROM INSIDE the action, not from a `useEffect` reacting
  // to `state` (the shape every other route in this wave uses). Both `remove`
  // and `dismiss` resolve the report, which drops it from the open-reports
  // query the same round trip revalidates — the refreshed list and this
  // action's own return land in one commit, and React discards a fiber's
  // pending update when its parent's reconciliation removes that fiber in
  // the same commit, so a `useEffect` keyed on `state` never gets to run for
  // `ReportCard`'s own success case (the card is the thing disappearing).
  // Calling `toast.show()` here, in the action's own body, fires it as an
  // ordinary callback on `ToastProvider` — independent of whether
  // `ReportCard` ever re-renders again, the same reason a toast queued from
  // a `fetch().then()` survives the click handler's component unmounting.
  const [state, formAction, pending] = useActionState(async (prev: ModerationState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) toast.show({ title: t("done"), tone: "success" });
    else if (result.error) toast.show({ title: t(`error.${result.error}`), tone: "error" });
    return result;
  }, emptyModerationState);
  // ★ DEC-135: this transition re-renders server content (the queue drops
  // the resolved report), which is exactly the shape React 19.2.4 can lose
  // the retry for — a workaround, not a feature; delete with `pending-nudge.ts`.
  usePendingNudge(pending);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();

  // Closing the dialog is DERIVED from `state`, adjusted DURING RENDER — the
  // same pattern `members-table.tsx`'s `ActionsCell` uses, and safe even
  // though the success case above usually never reaches this render at all:
  // on the error path (the row survives) this still runs normally, and the
  // dialog correctly stays open to show the inline field error.
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
            <Button type="submit" name="action" value="dismiss" variant="secondary" size="sm" disabled={pending}>
              {t("dismiss")}
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
