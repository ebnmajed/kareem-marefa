"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { MenuItem } from "@/components/ui";
import type { SessionAction } from "@/lib/dal/sessions";
import type { TransitionState } from "./actions";
import { emptyTransitionState } from "./state";

// SCR-042's row menu (`REQ-SES-003`, `REQ-SES-005`, `REQ-SES-012`, `REQ-SES-020`),
// written again for wave 21 (`DEC-208`). The artboard has no room for a row of
// buttons under the table, so the state machine's own actions move into the
// row's ⋯ beside the routes it always held (ledger L5).
//
// Kept, each from the wave-6 file:
//  · which actions appear is `actionsFor(state)`, computed on the server and
//    handed down — the screen and `transition_session()` cannot drift;
//  · the action arrives as a BOUND Server Action per row, never a factory;
//  · ★ the toast fires FROM the action, never from an effect in a component
//    that may unmount in the same commit (wave 6's lesson);
//  · cancel confirms in `ui/dialog` naming the session (`REQ-UIX-013`), with
//    the written reason it requires — now inside the dialog (L6);
//  · a dialog closes from the RESULT, adjusted during render, never on click.
// Completing early closes check-in (`DEC-141`), so «أنهِ الجلسة» confirms with
// that sentence before the scheduled end; after it, one press.
/** Read at the press, never during render: the clock is not a render input. */
function beforeEnd(endsAt: string | null): boolean {
  return endsAt !== null && Date.now() < new Date(endsAt).getTime();
}

export function SessionRowActions({
  title,
  links,
  actions,
  action,
  endsAt,
}: {
  title: string;
  links: MenuItem[];
  actions: SessionAction[];
  action?: (prev: TransitionState, formData: FormData) => Promise<TransitionState>;
  endsAt: string | null;
}) {
  const t = useTranslations("admin.sessions");
  const toast = useToast();
  const reasonId = useId();
  const [dialog, setDialog] = useState<"cancel" | "complete" | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: TransitionState, formData: FormData) => {
    if (!action) return prev;
    const result = await action(prev, formData);
    if (result.done) toast.show({ title: t("transitionDone"), tone: "success" });
    else if (result.error && result.error !== "cancelReasonRequired") toast.show({ title: t(result.error), tone: "error" });
    return result;
  }, emptyTransitionState);

  // Close on any NEW result — except the reason refusal, which the dialog shows at its field.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.error !== "cancelReasonRequired") setDialog(null);
  }

  const run = (a: SessionAction) => {
    const fd = new FormData();
    fd.set("action", a);
    startTransition(() => formAction(fd));
  };
  const transitions: MenuItem[] = action
    ? actions.map((a, i) => ({
        label: t(a),
        startsGroup: i === 0,
        tone: a === "cancel" ? ("error" as const) : undefined,
        disabled: pending,
        onSelect: () => {
          if (a === "cancel") setDialog("cancel");
          else if (a === "complete" && beforeEnd(endsAt)) setDialog("complete");
          else run(a);
        },
      }))
    : [];

  const rich = (key: "cancelConfirmTitle" | "completeConfirmTitle") => t.rich(key, { title, t: (chunks) => <bdi>{chunks}</bdi> });

  return (
    <>
      <Menu
        align="end"
        trigger={
          <IconButton label={t.markup("moreActions", { title, t: (chunks) => chunks })} size="sm">
            <MoreIcon />
          </IconButton>
        }
        items={[...links, ...transitions]}
      />

      {action ? (
        <Dialog open={dialog === "cancel"} onOpenChange={(open) => setDialog(open ? "cancel" : null)}>
          <DialogContent title={rich("cancelConfirmTitle")} closeLabel={t("closeDialog")}>
            <form action={formAction} noValidate>
              <input type="hidden" name="action" value="cancel" />
              <Field id={reasonId} label={t("cancelReasonLabel")} required error={state.error === "cancelReasonRequired" ? t("cancelReasonRequired") : undefined}>
                <Textarea name="reason" rows={3} maxLength={2000} />
              </Field>
              <div className="mt-3">
                <Prose size="sm">
                <p>{t("cancelConfirmBody")}</p>
              </Prose>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="submit" variant="danger" pending={pending}>
                  {t("cancelConfirmAction")}
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
      ) : null}

      {action ? (
        <Dialog open={dialog === "complete"} onOpenChange={(open) => setDialog(open ? "complete" : null)}>
          <DialogContent title={rich("completeConfirmTitle")} closeLabel={t("closeDialog")}>
            <Prose size="sm">
              <p>{t("completeNote")}</p>
            </Prose>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" pending={pending} onClick={() => run("complete")}>
                {t("completeConfirmAction")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("cancelDialogCancel")}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
