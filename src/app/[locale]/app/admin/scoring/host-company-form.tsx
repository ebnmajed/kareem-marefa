"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { CompanyOption, HostableSession } from "@/lib/dal/scoring-admin";

// The hosting company of a session — the input the company-hosting rule pays
// on (`0081`). It was a session UUID typed into a text field, a stopgap its own
// copy apologised for; it is now a searchable session, and choosing one puts
// its current host in the company select, so an admin sees what they change.
// It stays on this screen by the lead's sync-1 ruling (the schedule form does
// not take it).

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;

export function HostCompanyForm({ action, sessions, companies, timeZone, locale }: { action: Action; sessions: HostableSession[]; companies: CompanyOption[]; timeZone: string; locale: string }) {
  const t = useTranslations("scoring.admin.hostCompany");
  const tc = useTranslations("admin.combobox");
  const [resetKey, setResetKey] = useState(0);
  const [company, setCompany] = useState("");
  const [state, dispatch] = useActionToast<SavedFormState>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.saved) {
        setResetKey((k) => k + 1);
        setCompany("");
      }
      return result;
    },
    emptySavedState(),
    (result) => (result.saved ? { title: t("saved"), tone: "success" } : result.formError ? { title: t(`errors.${result.formError}`), tone: "error" } : null),
  );
  const attempted = hasAttempted(state);
  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const labels: Record<string, string> = { sessionId: t("sessionLabel"), companyId: t("companyLabel") };

  return (
    <form key={resetKey} action={dispatch} noValidate className="max-w-xl space-y-5">
      {attempted ? (
        <FormSummary
          key={state.attempt}
          title={t("summaryTitle")}
          errors={summaryErrors(state, {
            fields: ["sessionId", "companyId"],
            label: (field) => labels[field],
            message: (key) => t(`errors.${key}`),
            fieldId: (field) => (field === "sessionId" ? "host-session" : "host-company"),
          })}
        />
      ) : null}
      <Field id="host-session" label={t("sessionLabel")} required error={err("sessionId")}>
        <Combobox
          name="sessionId"
          placeholder={t("sessionPlaceholder")}
          defaultValue={attempted && was(state, "sessionId") ? [was(state, "sessionId")] : undefined}
          options={sessions.map((s) => ({ value: s.id, label: s.title, hint: s.startsAt ? formatDateTime(s.startsAt, timeZone, locale) : t("notScheduled") }))}
          onChange={(selected) => setCompany(sessions.find((s) => s.id === selected[0])?.hostCompanyId ?? "")}
          resultsLabel={(count) => (count === 0 ? t("noMatches") : tc("resultsCount", { count, value: formatNumber(count) }))}
        />
      </Field>
      <Field id="host-company" label={t("companyLabel")} error={err("companyId")}>
        <Select name="companyId" value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">{t("none")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {state.formError ? (
        <p className="flex items-start gap-2 text-body-sm text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t(`errors.${state.formError}`)}</span>
        </p>
      ) : null}
      <SubmitButton variant="secondary" pendingLabel={t("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
