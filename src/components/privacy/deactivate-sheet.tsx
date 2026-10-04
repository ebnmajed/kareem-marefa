"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { PrivacyState } from "@/app/[locale]/app/me/privacy/actions";
import { emptyPrivacyState } from "@/app/[locale]/app/me/privacy/state";

// «إيقاف حسابي» on /app/me/privacy — `Privacy.dc.html:32`, REQ-PRF-007, REQ-UIX-117, DEC-251 §3 (P15 – P20).
//
// ★ A coral text action that opens a confirm SHEET; the sheet is the confirmation, so nothing is sent by the first
// press. It holds what the request needs and the artboard does not draw: the REASON, 3 – 500 characters, which the
// DAL validates again and the org's audit row carries (`request_deactivation()`), and the one honest paragraph —
// no self-service deletion, and why (12 §5.4, kept by DEC-251 §3.4).
// ★ The reason is checked before anything is sent (`reportValidity()` in `onSubmit`; `noValidate`, because the server's
// own refusal is shown here too). The submit button sits INSIDE the form, inside the sheet — no `form=` attribute
// across the portal, which is what failed in a real build in wave 7.
// ★ Once sent, the action is replaced by the confirmation (`role="status"`), so no second request is offered.
// ★ Deactivating is an admin's act (REQ-AUT-008): this sends a request and deactivates nobody.

export function DeactivateSheet({ action }: { action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState> }) {
  const t = useTranslations("privacy");
  const [state, formAction] = useActionState(action, emptyPrivacyState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (state.ok) {
    return (
      <p role="status" className="text-body text-fg-heading">
        {t("page.deactivateSent")}
      </p>
    );
  }

  return (
    <>
      <Button type="button" variant="ghost" size="md" className="self-start px-0 text-error!" onClick={() => setOpen(true)}>
        {t("page.deactivateTitle")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={t("page.deactivateTitle")}>
        <form
          ref={formRef}
          action={formAction}
          noValidate
          onSubmit={(e) => {
            if (!formRef.current?.reportValidity()) e.preventDefault();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-body-sm text-fg-body">{t("page.deactivateHonest")}</p>
          {state.error ? (
            <p role="alert" className="text-caption text-error">
              {t(`errors.${state.error}`)}
            </p>
          ) : null}
          <Field id="deactivate-reason" label={t("page.deactivateReasonLabel")} required>
            <Textarea name="reason" required minLength={3} maxLength={500} rows={3} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="md">
              {t("page.deactivateSubmit")}
            </SubmitButton>
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
              {t("page.cancel")}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
