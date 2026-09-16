"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Prose } from "@/components/ui/prose";
import { useToast } from "@/components/ui/toast";
import type { SessionAction } from "@/lib/dal/sessions";
import type { TransitionState } from "./actions";
import { emptyTransitionState } from "./state";

// SCR-042's manual transitions (REQ-SES-005, REQ-SES-012), onto the system
// for wave 6 (`16` §7.3, `DEC-130`).
//
// Which buttons appear comes from `actionsFor(state)` in the DAL, so the
// screen and `transition_session()` cannot drift: the RPC refuses anything
// off 02 §6.2's edge set regardless, and this only avoids offering a button
// that would fail.
//
// Start/complete/archive/reopen stay plain, one-click buttons — forward-moving
// or reversible, the same "not destructive" reasoning `admin/proposals/
// review-card.tsx` gives for approve and request-changes. ★ Cancel alone gets
// `ui/dialog`'s confirmation (`REQ-UIX-013`), naming the session — it is the
// one transition here that withdraws something from every attendee who
// reserved a seat. The reason box stays behind its `<details>` exactly as
// built (not `required`, so a required control never sits inside a collapsed
// disclosure and silently blocks the whole form) — only the final commit step
// gains the named confirmation. The dialog's own submit button is portalled
// onto `document.body` by Radix, outside the `<details>` it opens from, so it
// is associated to the form by `form={formId}`, not DOM ancestry — same
// mechanism, same reason, as the proposals' reject dialog.
export function SessionControls({
  action,
  actions,
  sessionTitle,
}: {
  action: (prev: TransitionState, formData: FormData) => Promise<TransitionState>;
  actions: SessionAction[];
  sessionTitle: string;
}) {
  const t = useTranslations("admin.sessions");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, emptyTransitionState);
  const formId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.done) toast.show({ title: t("transitionDone"), tone: "success" });
    else if (state.error) toast.show({ title: t(state.error), tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast`/`t` are stable; re-running on them would re-fire the same acknowledgement.
  }, [state]);

  if (actions.length === 0) return null;

  const plain = actions.filter((a) => a !== "cancel");
  return (
    <form id={formId} action={formAction} className="mt-3">
      {state.error ? (
        <p role="alert" className="mb-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {plain.map((a) => (
          <Button key={a} type="submit" name="action" value={a} variant="secondary" disabled={pending} className="h-11 px-4 text-body-sm">
            {t(a)}
          </Button>
        ))}
      </div>
      {plain.includes("complete") ? <p className="mt-2 text-body-sm text-fg-muted">{t("completeNote")}</p> : null}

      {actions.includes("cancel") ? (
        <details className="mt-3">
          <summary className="inline-flex h-11 cursor-pointer list-none items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100">
            {t("cancel")}
          </summary>
          <div className="mt-3">
            <label htmlFor="cancel-reason" className="text-label text-fg-heading">
              {t("cancelReasonLabel")}
            </label>
            <p className="mt-1 text-body-sm text-fg-muted">{t("cancelReasonHint")}</p>
            <textarea
              id="cancel-reason"
              name="reason"
              rows={3}
              maxLength={2000}
              className="mt-2 block min-h-24 w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
            />
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary" className="mt-3 h-11 px-4 text-body-sm" disabled={pending}>
                  {t("cancelSend")}
                </Button>
              </DialogTrigger>
              <DialogContent title={t("cancelConfirmTitle", { title: sessionTitle })} closeLabel={t("closeDialog")}>
                <Prose size="sm">
                  <p>{t("cancelConfirmBody")}</p>
                </Prose>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="submit" form={formId} name="action" value="cancel" variant="danger" disabled={pending} onClick={() => setConfirmOpen(false)}>
                    {t("cancelConfirmAction")}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      {t("cancelDialogCancel")}
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </details>
      ) : null}
    </form>
  );
}
