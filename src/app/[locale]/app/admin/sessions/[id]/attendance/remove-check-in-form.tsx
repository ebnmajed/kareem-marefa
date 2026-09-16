"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { UncheckedAttendee } from "@/lib/dal/checkin";
import type { RemoveState } from "./actions";
import { emptyRemoveState } from "./state";

// REQ-CHK-017, C3. Mirrors `manual-mark-form.tsx`'s own shape (a member
// picker plus a mandatory reason, through `useActionState`) with one
// addition: REQ-UIX-013 says every destructive action confirms in
// `ui/dialog`, so the submit button opens a dialog naming the member
// instead of submitting directly. Both fields are CONTROLLED here (not
// `manual-mark-form.tsx`'s uncontrolled `defaultValue` + remount-by-`key`)
// because the confirmation dialog's own text needs to read the current
// selection — React state, not the DOM, is the source of truth either way.
//
// ★ The confirm button inside the dialog is a plain button that calls
// `formRef.current?.requestSubmit()`, not `DialogClose asChild` wrapping the
// submit — `takedown-button.tsx`'s own header names the exact real-build
// timeout this shape avoids (a `DialogClose` wrapping an `onClick` that
// starts a pending transition).
export function RemoveCheckInForm({
  action,
  candidates,
  sessionTitle,
}: {
  action: (prev: RemoveState, formData: FormData) => Promise<RemoveState>;
  candidates: UncheckedAttendee[];
  /** REQ-UIX-013: the confirm dialog names the session too, not just the
   *  member (the lead's own restated constraint for this control) — this
   *  page already reads it for its own `<h1>`, passed straight through. */
  sessionTitle: string;
}) {
  const t = useTranslations("checkin.attendance");
  const [state, formAction, pending] = useActionState(action, emptyRemoveState);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");

  // Resetting the fields on success is DERIVED from `state`, adjusted DURING
  // RENDER (react.dev's own pattern, `members-table.tsx`'s own precedent for
  // this exact shape) — not a `setState` call inside a `useEffect`, which
  // `react-hooks/set-state-in-effect` refuses.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.done) {
      setMemberId("");
      setReason("");
    }
  }

  if (candidates.length === 0) return <p className="mt-3 text-body-sm text-fg-muted">{t("removeEmpty")}</p>;

  const selected = candidates.find((c) => c.memberId === memberId);
  const canConfirm = memberId !== "" && reason.trim().length > 0;

  return (
    // `noValidate`: this form renders the app's own error (`removeError.*`
    // below), so the browser's native validation bubble must stay out of
    // the way — content's own real-build finding (7f4809f): without it, an
    // empty reason blocks the submit silently and neither `removeError.
    // reason_required` nor `remove_check_in()`'s own refusal is ever
    // reached, because the click never becomes a request.
    <form ref={formRef} action={formAction} noValidate className="mt-4 max-w-md space-y-4">
      <div>
        <label htmlFor="remove-member" className="text-label text-fg-heading">
          {t("removeMemberLabel")}
        </label>
        <select
          id="remove-member"
          name="memberId"
          required
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
        >
          <option value="" disabled>
            {t("removeMemberPlaceholder")}
          </option>
          {candidates.map((c) => (
            <option key={c.memberId} value={c.memberId}>
              {c.displayName ?? c.memberId}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="remove-reason" className="text-label text-fg-heading">
          {t("removeReasonLabel")}
        </label>
        <textarea
          id="remove-reason"
          name="reason"
          aria-required="true"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={300}
          className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="danger" disabled={!canConfirm}>
            {t("removeSubmit")}
          </Button>
        </DialogTrigger>
        <DialogContent
          title={t("removeConfirmTitle")}
          description={t.rich("removeConfirmBody", { name: selected?.displayName ?? selected?.memberId ?? "", session: sessionTitle, bdi: (c) => <bdi>{c}</bdi> })}
          closeLabel={t("cancel")}
        >
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              pending={pending}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
              className="h-10 px-5"
            >
              {t("removeSubmit")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="h-10 px-5">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {state.done ? (
        <div role="status">
          <p className="text-body-sm text-fg-heading">{t("removeDone")}</p>
        </div>
      ) : null}
      {state.error ? (
        <div role="alert">
          <p className="text-body-sm text-fg-heading">{t(`removeError.${state.error}`)}</p>
        </div>
      ) : null}
    </form>
  );
}
