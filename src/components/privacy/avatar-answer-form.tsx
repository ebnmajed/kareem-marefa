"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/ui/submit-button";
import { Panel } from "@/components/ui/panel";
import type { ButtonVariant, Size } from "@/components/ui";

// One answer to «نستخدم صورتك من Google؟», as its own form (REQ-PRF-008,
// DEC-182). Two answers are two forms, each bound on the server to its own
// value (DEC-159), so the form carries no field a crafted post could change —
// and each button's pending state is its own.

export type AvatarAnswerState = { error: string | null; ok: boolean };
const initial: AvatarAnswerState = { error: null, ok: false };

export function AvatarAnswerForm({
  action,
  label,
  variant = "secondary",
  size,
}: {
  action: (prev: AvatarAnswerState, formData: FormData) => Promise<AvatarAnswerState>;
  label: string;
  variant?: ButtonVariant;
  /** wave 26, add-only: privacy's card asks for a smaller control; the /app prompt keeps the default. */
  size?: Size;
}) {
  const t = useTranslations("privacy.errors");
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} noValidate>
      {state.error ? (
        <div role="alert" className="mb-2">
          <Panel tone="error" className="p-3 text-body-sm text-fg-heading">
            {t(state.error)}
          </Panel>
        </div>
      ) : null}
      <SubmitButton pending={pending} variant={variant} size={size}>
        {label}
      </SubmitButton>
    </form>
  );
}
