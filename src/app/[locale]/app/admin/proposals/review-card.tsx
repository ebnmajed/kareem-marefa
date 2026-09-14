"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { type ReviewState } from "./actions";
import { emptyReviewState } from "./state";

// One row of SCR-041's queue, with its three decisions.
//
// A client component only for the reason box: approving is one click, while
// rejecting and requesting changes open a textarea first, because REQ-PRO-005
// makes the written reason the substance of those two decisions rather than a
// confirmation step. Putting the reason behind a <details> would let it be
// submitted collapsed and empty; keeping it in component state means the
// button that needs a reason cannot be pressed without one on screen.

type Decision = "reject" | "request_changes";

export function ReviewCard({
  action,
  proposalId,
  children,
}: {
  action: (prev: ReviewState, formData: FormData) => Promise<ReviewState>;
  proposalId: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.proposals");
  const [state, formAction, pending] = useActionState(action, emptyReviewState);

  return (
    <li className="rounded-field border border-edge p-5">
      {children}

      {state.error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 border-t border-edge pt-5">
        <input type="hidden" name="proposalId" value={proposalId} />
        <p className="text-body-sm text-fg-muted">{t("approveNote")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" name="action" value="approve" disabled={pending}>
            {t("approve")}
          </Button>
          <Reason label={t("requestChanges")} decision="request_changes" pending={pending} typed={state.reason} />
          <Reason label={t("reject")} decision="reject" pending={pending} typed={state.reason} />
        </div>
      </form>
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
 */
function Reason({ label, decision, pending, typed }: { label: string; decision: Decision; pending: boolean; typed: string }) {
  const t = useTranslations("admin.proposals");
  const id = `${decision}-reason`;
  return (
    <details className="w-full" open={typed !== ""}>
      <summary className="inline-flex h-12 cursor-pointer list-none items-center rounded-field border border-edge-strong px-6 text-label text-fg-heading hover:bg-silver-100">
        {label}
      </summary>
      <div className="mt-3">
        <label htmlFor={id} className="text-label text-fg-heading">
          {t("reasonLabel")}
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
        <Button type="submit" name="action" value={decision} variant="secondary" className="mt-3" disabled={pending}>
          {t("send")}
        </Button>
      </div>
    </details>
  );
}
