"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { Prose } from "@/components/ui/prose";
import { useToast } from "@/components/ui/toast";
import { type ReviewState } from "./actions";
import { emptyReviewState } from "./state";

// One row of SCR-041's queue, with its three decisions — rebuilt onto the
// system for wave 6 (`16` §6.7/§7.3, `DEC-130`).
//
// A client component only for the reason box: approving is one click, while
// rejecting and requesting changes open a textarea first, because REQ-PRO-005
// makes the written reason the substance of those two decisions rather than a
// confirmation step. Putting the reason behind a <details> would let it be
// submitted collapsed and empty; keeping it in component state means the
// button that needs a reason cannot be pressed without one on screen.
//
// ★ Feedback moves onto `ui/toast` (`REQ-UIX-007`) — the inline `role="alert"`
// paragraph stays as a visible, read-at-leisure record (a toast a member
// dismissed before reading is a failure they will hit again with no trace),
// but the acknowledgement itself now arrives where the eye is.
//
// ★ Reject alone gets the `ui/dialog` confirmation (`REQ-UIX-013`) naming the
// proposal — approve is forward-moving and request-changes loses nothing (the
// proposer can always revise and resubmit), but a rejection is the one
// decision here that withdraws something. `done: (typed) reason>0` on
// `ReviewState` already existed for the "values survive a failed round trip"
// rule (`16` §8.2 item 6); nothing about it changes here.

type Decision = "reject" | "request_changes";

export function ReviewCard({
  action,
  proposalId,
  proposalTitle,
  children,
}: {
  action: (prev: ReviewState, formData: FormData) => Promise<ReviewState>;
  proposalId: string;
  proposalTitle: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.proposals");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, emptyReviewState);
  // ★ DEC-135: this transition re-renders server content (the queue drops the
  // decided proposal), which is exactly the shape React 19.2.4 can lose the
  // retry for — a workaround, not a feature; delete with `pending-nudge.ts`.
  usePendingNudge(pending);
  const formId = useId();

  // ★ `state` is a fresh object on every action resolution (React 19 never
  // reuses the previous one), so this effect is safe to key on the object
  // itself rather than needing a separate "did this just change" ref — it
  // never re-fires for a render the action did not just produce, including
  // the very first mount (`emptyReviewState`'s `done`/`error` are both falsy).
  useEffect(() => {
    if (state.done) toast.show({ title: t("done"), tone: "success" });
    else if (state.error) toast.show({ title: t(state.error), tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `toast`/`t` are stable; re-running on them would re-fire the same acknowledgement.
  }, [state]);

  return (
    <li>
      {/* `Panel`'s own base padding (`p-4`) is kept as-is — piling a second
          padding utility on top of it would be the exact "which wins depends
          on Tailwind's generated stylesheet order, not the className string"
          trap `DEC-111` found in `ps-10`/`px-4`. */}
      <Panel>
        {children}

        {state.error ? (
          <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
            {t(state.error)}
          </p>
        ) : null}

        <form id={formId} action={formAction} className="mt-5 border-t border-edge pt-5">
          <input type="hidden" name="proposalId" value={proposalId} />
          <p className="text-body-sm text-fg-muted">{t("approveNote")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" name="action" value="approve" disabled={pending}>
              {t("approve")}
            </Button>
            <Reason label={t("requestChanges")} decision="request_changes" pending={pending} typed={state.reason} formId={formId} proposalTitle={proposalTitle} state={state} />
            <Reason label={t("reject")} decision="reject" pending={pending} typed={state.reason} formId={formId} proposalTitle={proposalTitle} state={state} />
          </div>
        </form>
      </Panel>
    </li>
  );
}

/**
 * A decision that cannot be taken without its reason.
 *
 * Each box is named for its own decision — `reason-reject`,
 * `reason-request_changes` — because both live in ONE form and a single
 * `reason` name would make `formData.get("reason")` return whichever appeared
 * first, so a filled rejection reason could be replaced by an empty
 * change-request box.
 *
 * Deliberately NOT `required`: a required control inside a collapsed
 * `<details>` is not focusable, and the browser then refuses to submit the
 * form at all — including the approve button — with no visible message. The
 * reason is enforced in the action and again in `review_proposal()`, which is
 * where it has to hold anyway.
 *
 * ★ `reject`'s final submit opens `ui/dialog` instead of submitting directly.
 * The dialog is portalled OUTSIDE this `<details>`'s DOM subtree (Radix
 * renders it on `document.body`), so its own submit button is associated to
 * the outer form by `form={formId}` — an ancestry-based implicit association
 * would silently do nothing once the button is no longer a DOM descendant of
 * the `<form>`.
 */
function Reason({
  label,
  decision,
  pending,
  typed,
  formId,
  proposalTitle,
  state,
}: {
  label: string;
  decision: Decision;
  pending: boolean;
  typed: string;
  formId: string;
  proposalTitle: string;
  state: ReviewState;
}) {
  const t = useTranslations("admin.proposals");
  const id = `${decision}-reason`;
  const [confirmOpen, setConfirmOpen] = useState(false);
  // ★ Closing the dialog is DERIVED from `state`, adjusted DURING RENDER —
  // not a `setConfirmOpen(false)` in the confirm button's own `onClick`
  // (this dialog's original shape). A real build's own run found the
  // "reason required" alert never arriving after confirming reject with an
  // empty box: the confirm button is portalled outside the `<form>` it
  // submits via `form={formId}`, and closing the dialog synchronously on
  // click — before the round trip that `<form>` submission starts even
  // resolves — is exactly the class of timing this codebase has already had
  // to work around twice this wave (the toast-from-a-same-commit-unmount
  // bug, DEC-135's lost React ping). Deriving the close from the actual
  // result removes the race outright, closing on ANY new result (not only
  // `state.done`, unlike `report-card.tsx`'s version of this pattern) —
  // this dialog's own error lives OUTSIDE it, in `ReviewCard`'s own alert,
  // so there is nothing to keep the dialog open to show.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (decision === "reject" && state !== lastHandledState) {
    setLastHandledState(state);
    setConfirmOpen(false);
  }
  return (
    <details className="w-full" open={typed !== ""}>
      <summary className="inline-flex h-12 cursor-pointer list-none items-center rounded-field border border-edge-strong px-6 text-label text-fg-heading hover:bg-silver-100">
        {label}
      </summary>
      <div className="mt-3">
        {/* ★ A real build's own run found both boxes sharing one label —
            «السبب الذي سيصل صاحب المقترح» twice on one card, a screen
            reader hearing two identical fields. Each names its own
            decision now (`reasonLabelReject`/`reasonLabelRequestChanges`). */}
        <label htmlFor={id} className="text-label text-fg-heading">
          {t(decision === "reject" ? "reasonLabelReject" : "reasonLabelRequestChanges")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("reasonHint")}</p>
        <textarea
          id={id}
          name={`reason-${decision}`}
          rows={3}
          maxLength={2000}
          defaultValue={typed}
          className="mt-2 block min-h-24 w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
        />
        {decision === "reject" ? (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" className="mt-3" disabled={pending}>
                {t("send")}
              </Button>
            </DialogTrigger>
            <DialogContent
              title={t.rich("rejectConfirmTitle", { title: proposalTitle, t: (chunks) => <bdi>{chunks}</bdi> })}
              closeLabel={t("closeDialog")}
            >
              <Prose size="sm">
                <p>{t("rejectConfirmBody")}</p>
              </Prose>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="submit" form={formId} name="action" value="reject" variant="danger" disabled={pending}>
                  {t("rejectConfirmAction")}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button type="submit" name="action" value={decision} variant="secondary" className="mt-3" disabled={pending}>
            {t("send")}
          </Button>
        )}
      </div>
    </details>
  );
}
