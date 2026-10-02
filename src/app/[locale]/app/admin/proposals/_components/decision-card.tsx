"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { useSplitView } from "@/components/ui/split-view";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { FormAlert } from "@/components/admin/form-alert";
import type { ReviewState } from "../actions";
import { emptyReviewState } from "../state";

// SCR-041's decision card — REQ-PRO-005, REQ-PRO-006, REQ-UIX-088, from `AdminProposals.dc.html`: ONE message to the
// proposer and three decisions — «اعتمد», «اطلب تعديلًا», and «ارفض» at the inline-end, quiet and coral.
//
// ★ Kept from the review card it replaces (W21.3, rows 4 – 11):
//   · a change-request and a rejection need the message — said AT THE BOX, checked again in the action and the RPC;
//     the box is never `required` and the form is `noValidate`;
//   · what was typed survives a failed round trip (`state.reason`, React resets the form);
//   · «ارفض» confirms in `ui/dialog`, naming the proposal (REQ-UIX-013); its confirm submits THIS form across the
//     portal by `form=`, and the dialog closes from the result, never on click (the race a real build found);
//   · the toast fires from inside the action wrapper, never from an effect — the card is the thing that disappears.
// ★ New (DEC-228 §4.1 (b)): a message typed and then «اعتمد» is refused at the box — approval carries no message, so
// it would otherwise be discarded in silence. ★ New (REQ-UIX-088): after a decision focus lands on the next row of
// the queue, so the next proposal is one Enter away.

export function DecisionCard({
  action,
  proposalId,
  proposalTitle,
}: {
  action: (prev: ReviewState, formData: FormData) => Promise<ReviewState>;
  proposalId: string;
  proposalTitle: string;
}) {
  const t = useTranslations("proposals.review");
  const toast = useToast();
  const { focusNext } = useSplitView();
  const [state, formAction, pending] = useActionState(async (prev: ReviewState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) {
      toast.show({ title: t("done"), tone: "success" });
      focusNext();
    } else if (result.error === "failed") toast.show({ title: t("failed"), tone: "error" });
    return result;
  }, emptyReviewState);
  const formId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setConfirmOpen(false);
  }
  const boxError = state.error === "reasonRequired" || state.error === "approveWithMessage" ? t(state.error) : undefined;

  return (
    <Panel>
      {state.error === "failed" ? <FormAlert className="mb-4">{t("failed")}</FormAlert> : null}
      <form id={formId} action={formAction} noValidate className="space-y-4">
        <input type="hidden" name="proposalId" value={proposalId} />
        <Field label={t("message")} error={boxError}>
          <Textarea name="reason" rows={2} maxLength={2000} defaultValue={state.reason} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="action" value="approve" size="md" disabled={pending}>
            {t("approve")}
          </Button>
          <Button type="submit" name="action" value="request_changes" variant="quiet" size="md" disabled={pending}>
            {t("requestChanges")}
          </Button>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="md" className="ms-auto text-error" disabled={pending}>
                {t("reject")}
              </Button>
            </DialogTrigger>
            <DialogContent
              title={t.rich("rejectConfirmTitle", { title: proposalTitle, t: (chunks) => <bdi>{chunks}</bdi> })}
              description={t("rejectConfirmBody")}
              closeLabel={t("closeDialog")}
            >
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="submit" form={formId} name="action" value="reject" variant="danger" size="md" disabled={pending}>
                  {t("rejectConfirmAction")}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="md">
                    {t("cancel")}
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </form>
    </Panel>
  );
}
