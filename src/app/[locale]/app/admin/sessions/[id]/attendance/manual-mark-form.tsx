"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { UncheckedAttendee } from "@/lib/dal/checkin";
import type { ManualMarkState } from "./actions";
import { emptyManualMarkState } from "./state";

export function ManualMarkForm({
  action,
  unchecked,
}: {
  action: (prev: ManualMarkState, formData: FormData) => Promise<ManualMarkState>;
  unchecked: UncheckedAttendee[];
}) {
  const t = useTranslations("checkin.attendance");
  const [state, formAction, pending] = useActionState(action, emptyManualMarkState);
  const formRef = useRef<HTMLFormElement>(null);

  // A successful mark clears the form so it is ready for the next attendee
  // — the row it just marked drops out of `unchecked` on revalidation, but
  // the reason field would otherwise still hold the previous person's text.
  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state.done]);

  if (unchecked.length === 0) return <p className="mt-3 text-body-sm text-fg-muted">{t("empty")}</p>;

  return (
    // `noValidate`: this form renders the app's own `error.*` banner below,
    // so the browser's native validation must stay out of the way —
    // content's own real-build finding (7f4809f): without it, the select's
    // `required` blocks the submit silently and the RPC's own refusal, or
    // this form's Arabic error, never has a chance to render.
    <form ref={formRef} action={formAction} noValidate className="mt-4 max-w-md space-y-4">
      <div>
        <label htmlFor="manual-member" className="text-label text-fg-heading">
          {t("memberLabel")}
        </label>
        {/* `key`: React's form reset restores a <select> to its options' original
            `selected` state, so a new defaultValue alone does not re-select the
            member the admin chose; remounting with the echoed value does. */}
        <select key={`member-${state.memberId ?? ""}-${state.error ?? ""}`} id="manual-member" name="memberId" required defaultValue={state.memberId ?? ""} className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading">
          <option value="" disabled>
            {t("memberPlaceholder")}
          </option>
          {unchecked.map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.displayName ?? m.memberId}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="manual-reason" className="text-label text-fg-heading">
          {t("reasonLabel")}
        </label>
        <textarea
          id="manual-reason"
          name="reason"
          aria-required="true"
          defaultValue={state.reason ?? ""}
          rows={2}
          maxLength={300}
          className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("mark")}
      </Button>
      {state.error ? (
        <p role="alert" className="text-body-sm text-fg-heading">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
