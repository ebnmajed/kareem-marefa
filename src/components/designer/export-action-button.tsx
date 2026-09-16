"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const [state, formAction] = useActionState(action, initialExportActionState);
  const seen = useRef(0);

  useEffect(() => {
    if (state.at === 0 || state.at === seen.current) return;
    seen.current = state.at;
    if (state.status === "queued") toast.show({ tone: "success", title: t("queuedNotice") });
    else if (state.status === "retried") toast.show({ tone: "success", title: t("retriedNotice") });
    else if (state.status === "not_authorized" || state.status === "invalid") toast.show({ tone: "error", title: t("notAuthorized") });
  }, [state, t, toast]);

  return (
    <form action={formAction} id={id}>
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
