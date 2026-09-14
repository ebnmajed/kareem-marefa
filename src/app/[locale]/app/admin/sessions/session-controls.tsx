"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SessionAction } from "@/lib/dal/sessions";
import type { TransitionState } from "./actions";
import { emptyTransitionState } from "./state";

// SCR-042's manual transitions (REQ-SES-005, REQ-SES-012).
//
// Which buttons appear comes from `actionsFor(state)` in the DAL, so the
// screen and `transition_session()` cannot drift: the RPC refuses anything
// off 02 §6.2's edge set regardless, and this only avoids offering a button
// that would fail.
//
// Cancelling opens a reason box first, because REQ-SES-010 makes the written
// reason the substance of a cancellation — every attendee reads it and it
// stays on the session's page. Not `required` on the textarea: a required
// control inside a collapsed <details> is unfocusable and the browser then
// refuses to submit the whole form, silently. The action and the RPC both
// check it.
export function SessionControls({
  action,
  actions,
}: {
  action: (prev: TransitionState, formData: FormData) => Promise<TransitionState>;
  actions: SessionAction[];
}) {
  const t = useTranslations("admin.sessions");
  const [state, formAction, pending] = useActionState(action, emptyTransitionState);
  if (actions.length === 0) return null;

  const plain = actions.filter((a) => a !== "cancel");
  return (
    <form action={formAction} className="mt-3">
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
            <Button type="submit" name="action" value="cancel" variant="secondary" className="mt-3 h-11 px-4 text-body-sm" disabled={pending}>
              {t("cancelSend")}
            </Button>
          </div>
        </details>
      ) : null}
    </form>
  );
}
