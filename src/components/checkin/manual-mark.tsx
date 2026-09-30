"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

// Marking by hand — SCR-016 (REQ-CHK-008, STORY-CHK-004, REQ-UIX-062; `Host.dc.html` «تسجيل يدوي»).
//
// ★ STAFF ONLY, AND THE PAGE DECIDES IT: this component is rendered for an admin or a moderator on
// a live or pre-flight console, and `mark_checked_in_manually()` re-derives it anyway. The reason is
// mandatory — Zod, then the RPC — and the action (`markManuallyAction`, unchanged) carries the member
// and the reason back on a refusal, because React resets the form (DEC-149 §1).
//
// ★ ONE FORM IN THE DOCUMENT AT A TIME. The server, and a browser without JavaScript, get today's
// inline form with a native `select` — it posts `memberId` and `reason` as it always has. Once
// hydrated it is replaced by the trigger and a `sheet` holding the same form with a searchable
// `combobox` (the same field names). A refusal opens the sheet on arrival with what was typed; the
// page re-keys this component on every result, so a success closes it.

const noSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

export type ManualCandidate = { memberId: string; displayName: string | null };

export function ManualMark({
  action,
  candidates,
  memberId,
  reason,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  candidates: ManualCandidate[];
  /** What a refused submission carried back. */
  memberId?: string;
  reason?: string;
  /** The refusal, already in words — rendered as the form's alert. */
  error?: ReactNode;
}) {
  const t = useTranslations("checkin.host");
  const hydrated = useHydrated();
  const [open, setOpen] = useState(Boolean(error));

  const alert = error ? (
    <div role="alert" className="rounded-card border border-error-border p-3 text-body-sm text-error pg:rounded-panel pg-dark:border-error-on-dark pg-dark:text-error-on-dark">
      {error}
    </div>
  ) : null;

  const reasonField = (
    <Field id="reason" label={t("manualReason")} required>
      <Input name="reason" required maxLength={300} defaultValue={reason ?? ""} />
    </Field>
  );

  if (!hydrated) {
    return (
      <section aria-labelledby="manual" className="col-span-full">
        <h2 id="manual" className="text-h3 text-fg-heading">
          {t("manualTitle")}
        </h2>
        {candidates.length === 0 ? (
          <p className="mt-3 text-body text-fg-muted">{t("manualNoCandidates")}</p>
        ) : (
          <form action={action} noValidate className="mt-4 space-y-4">
            {alert}
            <Field id="memberId" label={t("manualMember")} required>
              <Select name="memberId" required defaultValue={memberId ?? ""}>
                {candidates.map((c) => (
                  <option key={c.memberId} value={c.memberId}>
                    {c.displayName ?? c.memberId}
                  </option>
                ))}
              </Select>
            </Field>
            {reasonField}
            <SubmitButton variant="secondary">{t("manualSubmit")}</SubmitButton>
          </form>
        )}
      </section>
    );
  }

  return (
    <>
      <Button type="button" variant="quiet" size="md" className="w-full" onClick={() => setOpen(true)}>
        {t("manualOpen")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={t("manualTitle")}>
        {candidates.length === 0 ? (
          <p className="text-body text-fg-muted">{t("manualNoCandidates")}</p>
        ) : (
          <form action={action} noValidate className="space-y-4">
            {alert}
            <Field id="memberId" label={t("manualMember")} required>
              <Combobox
                name="memberId"
                options={candidates.map((c) => ({ value: c.memberId, label: c.displayName ?? c.memberId }))}
                defaultValue={memberId ? [memberId] : undefined}
                placeholder={t("manualSearch")}
                resultsLabel={(count) => t("manualResults", { count, value: formatNumber(count) })}
              />
            </Field>
            {reasonField}
            <SubmitButton className="w-full">{t("manualSubmit")}</SubmitButton>
          </form>
        )}
      </Sheet>
    </>
  );
}
