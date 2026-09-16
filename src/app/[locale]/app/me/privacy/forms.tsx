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

  // ★ Sync-3, the lead's real-build finding: "أُرسل طلبك" never appeared
  // after confirming. The previous shape submitted via
  // `type="submit" form="deactivate-form"` — a NATIVE HTML attribute
  // lookup that has to resolve across Radix's own portal boundary
  // (`DialogContent` renders into `document.body`, outside this
  // component's own DOM subtree) at the exact moment `onClick` was ALSO
  // closing the dialog. Every reasoning path said it should still work,
  // and a jsdom test of the same shape passed (`deactivation-form.test.tsx`)
  // — which is exactly `DEC-135`'s own lesson: jsdom cannot always
  // reproduce a real Flight/transition timing bug, and a mechanism that
  // "should" work is not the same claim as "does," in a production build.
  // `requestSubmit()` on the form's own ref removes the cross-portal HTML
  // attribute lookup entirely — the submission is dispatched directly from
  // code that already holds the form, never through `form="id"` at all.
  function confirmAndSubmit() {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="mt-4 max-w-xl">
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
            <Button type="button" variant="danger" onClick={confirmAndSubmit} pending={pending} className="h-10 px-5">
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
