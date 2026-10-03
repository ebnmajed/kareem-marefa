"use client";

import { useTranslations } from "next-intl";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { was } from "@/lib/form-state";

// SCR-054's «أوقف» on a held achievement certificate — `revoke_certificate()` through `certificates.ts`, as it is: the
// reason is MANDATORY (`REQ-CRT-011`) and the revocation is audited as `certificate.revoked` with its serial and cause.
// `?revoke=<id>`, in console's `EditorSurface`, so it works without JS. Nothing notifies the member — the certificate
// was held, never theirs to see.

export function RevokeSheet({ action, certificateId }: { action: (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>; certificateId: string }) {
  const t = useTranslations("recognition.admin.held");
  const router = useRouter();
  const [state, dispatch] = useActionToast<SavedFormState>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.saved) router.replace("/app/admin/recognition");
      return result;
    },
    emptySavedState(),
    (result) => (result.saved ? { title: t("stopped"), tone: "success" } : result.formError ? { title: t(`stopErrors.${result.formError}`), tone: "error" } : null),
  );
  const err = state.errors.reason ? t(`stopErrors.${state.errors.reason}`) : undefined;
  return (
    <form action={dispatch} noValidate className="space-y-5">
      <input type="hidden" name="certificateId" value={certificateId} />
      <Field id="revoke-reason" label={t("stopReason")} required error={err}>
        <Textarea name="reason" rows={3} maxLength={500} defaultValue={was(state, "reason")} />
      </Field>
      {state.formError ? (
        <p className="flex items-start gap-2 text-body-sm text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t(`stopErrors.${state.formError}`)}</span>
        </p>
      ) : null}
      <SubmitButton variant="danger">{t("stopConfirm")}</SubmitButton>
    </form>
  );
}
