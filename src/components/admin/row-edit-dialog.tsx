"use client";

import { useState, type ReactNode } from "react";
import type { FormSummaryError } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasAttempted } from "@/lib/form-state";
import type { SavedFormState } from "./saved-form-state";
import { useActionToast } from "./use-action-toast";

// One row of a console list, edited in a dialog — the scoring catalogue's
// rules, the company rules, badges, levels, streaks and perks.
//
// The screens this replaces rendered EVERY row as its own always-open form with
// its own primary «حفظ»: fourteen on the scoring page alone, against `16` §3's
// «one primary action per view», and on a phone a scroll through fifty-six
// controls to change one number. The list now shows each row's values, and
// «عدّل» opens that row's form: on the form model, refused at the field with a
// summary, closing and toasting from the action's result when it saves.
//
// The form lives inside the dialog's content, which Radix unmounts on close, so
// every opening starts from the row as stored — never from the errors of an
// attempt the admin abandoned.
export function RowEditDialog<S extends SavedFormState>({
  triggerLabel,
  triggerName,
  title,
  description,
  closeLabel,
  action,
  emptyState,
  savedToast,
  failedMessage,
  summaryTitle,
  summary,
  submitLabel,
  pendingLabel,
  cancelLabel,
  children,
}: {
  triggerLabel: string;
  /** The trigger's accessible name, naming the row — «عدّل: تعليق». */
  triggerName: string;
  /** Names the row being edited. */
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  action: (previous: S, formData: FormData) => Promise<S>;
  emptyState: S;
  savedToast: string;
  /** The sentence for a whole-form failure key. */
  failedMessage: (key: string) => string;
  summaryTitle: string;
  summary: (state: S) => FormSummaryError[];
  submitLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  /** The fields, given the state of the last attempt. */
  children: (state: S) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" size="sm" aria-label={triggerName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <DialogContent title={title} description={description} closeLabel={closeLabel}>
        <RowEditForm
          action={action}
          emptyState={emptyState}
          onSaved={() => setOpen(false)}
          savedToast={savedToast}
          failedMessage={failedMessage}
          summaryTitle={summaryTitle}
          summary={summary}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
          cancelLabel={cancelLabel}
        >
          {children}
        </RowEditForm>
      </DialogContent>
    </Dialog>
  );
}

function RowEditForm<S extends SavedFormState>({
  action,
  emptyState,
  onSaved,
  savedToast,
  failedMessage,
  summaryTitle,
  summary,
  submitLabel,
  pendingLabel,
  cancelLabel,
  children,
}: {
  action: (previous: S, formData: FormData) => Promise<S>;
  emptyState: S;
  onSaved: () => void;
  savedToast: string;
  failedMessage: (key: string) => string;
  summaryTitle: string;
  summary: (state: S) => FormSummaryError[];
  submitLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  children: (state: S) => ReactNode;
}) {
  // Closing is called from the action's own body, like the toast: the dialog's
  // content — this component — unmounts in the same commit the result lands,
  // so nothing that waits for a re-render of it may carry the close.
  const [state, dispatch] = useActionToast<S>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.saved) onSaved();
      return result;
    },
    emptyState,
    (result) => (result.saved ? { title: savedToast, tone: "success" } : result.formError ? { title: failedMessage(result.formError), tone: "error" } : null),
  );

  return (
    <form action={dispatch} noValidate className="space-y-5">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={summaryTitle} errors={summary(state)} /> : null}
      {children(state)}
      {state.formError ? (
        <p className="flex items-start gap-2 text-body-sm text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{failedMessage(state.formError)}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 pt-1">
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {cancelLabel}
          </Button>
        </DialogClose>
      </div>
    </form>
  );
}
