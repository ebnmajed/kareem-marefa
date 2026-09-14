"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PrivacyState } from "./actions";
import { emptyPrivacyState } from "./state";

// `/app/me/privacy`'s two forms — REQ-PRF-006, REQ-PRF-007.

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

function Alert({ error }: { error: string | null }) {
  const t = useTranslations("privacy.errors");
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
      {t(error)}
    </p>
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
      <Button type="submit" disabled={pending} className="mt-3">
        {label}
      </Button>
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

  return (
    <form action={formAction} className="mt-4 max-w-xl">
      <Alert error={state.error} />
      <label htmlFor="deactivate-reason" className="mt-3 block text-label text-fg-heading">
        {t("deactivateReasonLabel")}
      </label>
      <textarea id="deactivate-reason" name="reason" required minLength={3} maxLength={500} rows={3} className={FIELD} />
      <Button type="submit" variant="secondary" disabled={pending} className="mt-4">
        {t("deactivateSubmit")}
      </Button>
    </form>
  );
}
