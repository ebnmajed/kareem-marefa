"use client";

import type { ReactNode } from "react";
import { FormAlert } from "@/components/admin/form-alert";
import type { SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import type { FormSummaryError } from "@/components/ui";
import { FormSummary } from "@/components/ui/form-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { useRouter } from "@/i18n/navigation";
import { hasAttempted } from "@/lib/form-state";

// The create/edit form of a managed list's row (`SCR-046` – `048`, wave 22), inside `EditorSurface`.
//
// On the form model (`lib/form-state`): refused at the field with a summary, `noValidate`. ★ The toast AND the close
// come from the action's own result (`useActionToast`, wave 6): a save that wrote says so and returns to the list; a
// save that did not write says that (`DEC-232` §3.1). Without JS the form posts to the same URL and shows its saved
// line in place — nothing about it needs a script to be true.

export function ListEditorForm<S extends SavedFormState>({
  action,
  emptyState,
  closeHref,
  savedLabel,
  failedMessage,
  summaryTitle,
  summary,
  submitLabel,
  pendingLabel,
  children,
}: {
  action: (previous: S, formData: FormData) => Promise<S>;
  emptyState: S;
  closeHref: string;
  savedLabel: string;
  failedMessage: (key: string) => string;
  summaryTitle: string;
  summary: (state: S) => FormSummaryError[];
  submitLabel: string;
  pendingLabel: string;
  children: (state: S) => ReactNode;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionToast<S>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.saved) router.replace(closeHref, { scroll: false });
      return result;
    },
    emptyState,
    (result) => (result.saved ? { title: savedLabel, tone: "success" } : result.formError ? { title: failedMessage(result.formError), tone: "error" } : null),
  );

  return (
    <form action={dispatch} noValidate className="space-y-5">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={summaryTitle} errors={summary(state)} /> : null}
      {state.formError ? <FormAlert>{failedMessage(state.formError)}</FormAlert> : null}
      {state.saved ? (
        <p role="status" className="text-body-sm text-fg-heading">
          {savedLabel}
        </p>
      ) : null}
      {children(state)}
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}
