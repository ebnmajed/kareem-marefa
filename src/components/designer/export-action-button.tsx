"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ButtonVariant, Size } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { initialExportActionState, type ExportActionState } from "@/app/[locale]/app/admin/designer/[documentId]/state";

// One export action as a button — «اطلب التصدير» in the page header, «أعِد
// المحاولة» on a failed variant. SCR-057, REQ-DSG-012, REQ-UIX-007.
//
// The answer is a toast where the admin pressed (`16` §7.3), and the button
// keeps its label while pending. No nudge, no timer: a transition that hangs
// is reported with the build it hung on (DEC-146).
//
// ★ The toast is shown FROM THE ACTION'S RESULT, never from an effect keyed
// on the state (wave 6's trap): a retried variant stops being `failed`, so
// the row re-renders without this button, and an effect in an unmounting
// component never runs — the retry would succeed and say nothing.

export function ExportActionButton({
  action,
  label,
  pendingLabel,
  variant = "primary",
  size = "md",
  id,
}: {
  action: (prev: ExportActionState, form: FormData) => Promise<ExportActionState>;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  size?: Size;
  id?: string;
}) {
  const t = useTranslations("designer.exports");
  const toast = useToast();
  const [, formAction] = useActionState(async (previous: ExportActionState, form: FormData) => {
    const result = await action(previous, form);
    if (result.status === "queued") toast.show({ tone: "success", title: t("queuedNotice") });
    else if (result.status === "retried") toast.show({ tone: "success", title: t("retriedNotice") });
    else if (result.status === "not_authorized" || result.status === "invalid") toast.show({ tone: "error", title: t("notAuthorized") });
    return result;
  }, initialExportActionState);

  return (
    <form action={formAction} id={id}>
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
