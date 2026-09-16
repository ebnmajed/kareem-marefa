"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import type { PrivacyState } from "./actions";
import { emptyPrivacyState } from "./state";

// `/app/me/privacy`'s two forms — REQ-PRF-006, REQ-PRF-007.

function Alert({ error }: { error: string | null }) {
  const t = useTranslations("privacy.errors");
  if (!error) return null;
  return (
    <div role="alert">
      <Panel tone="error" className="mt-3 p-3 text-body-sm text-fg-heading">
        {t(error)}
      </Panel>
    </div>
  );
}

export function RequestExportForm({
  label,
  action,
}: {
  label: string;
  action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState>;
}) {
  const [state, formAction, pending] = useActionState(action, emptyPrivacyState);
  return (
    <form action={formAction} className="mt-4">
      <Alert error={state.error} />
      <SubmitButton pending={pending} className="mt-3">
        {label}
      </SubmitButton>
    </form>
  );
}

export function DeactivationForm({
  action,
}: {
  action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState>;
}) {
  const t = useTranslations("privacy.page");
  const [state, formAction, pending] = useActionState(action, emptyPrivacyState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Once the request is in, the form goes and a confirmation stays: leaving a
  // "send the request" button under a sent request invites a second one an
  // admin then has to reconcile.
  if (state.ok) {
    return (
      <p role="status" className="mt-4 rounded-field border border-edge-strong p-4 text-body text-fg-heading">
        {t("deactivateSent")}
      </p>
    );
  }

  // ★ REQ-UIX-013 — every destructive action confirms in a dialog
  // (`takedown-button.tsx`'s established shape). The wrinkle this form has
  // that a plain confirm does not: a REQUIRED reason field the member must
  // fill in first. Native `reportValidity()` runs before the dialog opens —
  // opening a confirm over an empty required field would only surface the
  // browser's own validation message once the member is already looking at
  // the dialog, not the field it concerns.
  function openConfirm() {
    if (formRef.current?.reportValidity()) setConfirmOpen(true);
  }

  return (
    <>
      {/* `id` is what lets the dialog's confirm button — portaled outside
          this element by Radix — submit THIS form via the native `form`
          attribute, rather than needing a second copy of the action. */}
      <form id="deactivate-form" ref={formRef} action={formAction} className="mt-4 max-w-xl">
        <Alert error={state.error} />
        <Field id="deactivate-reason" label={t("deactivateReasonLabel")} required className="mt-3">
          <Textarea name="reason" required minLength={3} maxLength={500} rows={3} />
        </Field>
      </form>

      <Button type="button" variant="secondary" onClick={openConfirm} disabled={pending} className="mt-4">
        {t("deactivateSubmit")}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title={t("deactivateConfirmTitle")} description={t("deactivateConfirmBody")} closeLabel={t("cancel")}>
          <div className="flex gap-2">
            <Button type="submit" form="deactivate-form" variant="danger" onClick={() => setConfirmOpen(false)} pending={pending} className="h-10 px-5">
              {t("deactivateSubmit")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="h-10 px-5">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
