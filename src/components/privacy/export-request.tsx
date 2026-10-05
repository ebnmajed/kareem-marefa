"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PrivacyState } from "@/app/[locale]/app/me/privacy/actions";
import { emptyPrivacyState } from "@/app/[locale]/app/me/privacy/state";

// The export row's request control on /app/me/privacy — REQ-PRF-006, REQ-NFR-005 (P1, P8). The rate limit is the
// RPC's (`request_data_export()`, in the insert's own transaction); a refusal is said beside the button, `role="alert"`.
// A form, so it posts without JavaScript too.

export function ExportRequest({ label, action }: { label: string; action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState> }) {
  const t = useTranslations("privacy.errors");
  const [state, formAction] = useActionState(action, emptyPrivacyState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <SubmitButton size="sm" variant="secondary">
        {label}
      </SubmitButton>
      {state.error ? (
        <p role="alert" className="text-caption text-error">
          {t(state.error)}
        </p>
      ) : null}
    </form>
  );
}
