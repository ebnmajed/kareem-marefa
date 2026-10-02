"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useSplitView } from "@/components/ui/split-view";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { emptyModerationState, type ModerationState } from "../../state";

// SCR-051's decision — REQ-UIX-104, REQ-EVT-012, REQ-EVT-014. «احذف نهائيًا» is the primary, as the board draws it
// (the house rule for a destructive action is the confirmation, REQ-UIX-013, not a weaker button); it confirms in
// `ui/dialog` naming the session, with its reason at the field; the other is one press — «أعدها للعرض» for a takedown, «تجاهل» for a
// report (D6: a reported photo was never hidden, so there is nothing to restore). After a decision focus lands on the
// next row (`split-view`'s `focusNext()`), and the toast fires inside the action — never from an effect.

export function Decide({
  sessionTitle,
  remove,
  other,
}: {
  sessionTitle: string;
  remove: (prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  other: { label: string; run: () => Promise<ModerationState> };
}) {
  const t = useTranslations("photos.moderation");
  const toast = useToast();
  const { focusNext } = useSplitView();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [running, startRunning] = useTransition();

  const report = (result: ModerationState) => {
    if (result.done) {
      toast.show({ title: t("done"), tone: "success" });
      focusNext();
    } else if (result.error && result.error !== "reason_required") toast.show({ title: t(`error.${result.error}`), tone: "error" });
  };

  const [state, formAction, removing] = useActionState(async (prev: ModerationState, formData: FormData) => {
    const result = await remove(prev, formData);
    report(result);
    if (result.done || (result.error && result.error !== "reason_required")) setOpen(false);
    return result;
  }, emptyModerationState);

  const busy = removing || running;

  return (
    <div className="flex flex-wrap gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <Button type="button" variant="primary" disabled={busy} onClick={() => setOpen(true)}>
          {t("remove")}
        </Button>
        <DialogContent title={t.rich("removeTitle", { session: sessionTitle, bdi: (chunks) => <bdi>{chunks}</bdi> })} closeLabel={t("close")}>
          {/* `noValidate` — the reason is said at the field, and checked again in the action and in `remove_photo()`. */}
          <form action={formAction} noValidate>
            <Field id={reasonId} label={t("reasonLabel")} required error={state.error === "reason_required" ? t("error.reason_required") : undefined}>
              <Textarea name="reason" rows={3} maxLength={300} />
            </Field>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" variant="danger" pending={removing} disabled={removing}>
                {t("confirm")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("cancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Button type="button" variant="secondary" pending={running} disabled={busy} onClick={() => startRunning(async () => report(await other.run()))}>
        {other.label}
      </Button>
    </div>
  );
}
