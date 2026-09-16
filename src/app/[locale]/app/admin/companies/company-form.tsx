"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { COMPANY_FIELDS, COMPANY_REQUIRED_FIELDS, emptyCompanyState, type CompanyField, type CompanyState } from "./state";

// SCR-048's add form, onto `lib/form-state`'s shared model for wave 7
// (`16` §8.2, `DEC-137`).

const LABEL_KEY: Record<CompanyField, string> = { name: "nameLabel" };

const FIELD_ID: Record<CompanyField, string> = {
  name: "co-name",
};

export function CompanyForm({ action }: { action: (prev: CompanyState, formData: FormData) => Promise<CompanyState> }) {
  const t = useTranslations("admin.companies");
  const [state, formAction, pending] = useActionState(action, emptyCompanyState);
  const err = (field: CompanyField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: CompanyField) => COMPANY_REQUIRED_FIELDS.includes(field);

  const summary = summaryErrors(state, {
    fields: COMPANY_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
    // ★ The summary's links target the CONTROL's id, which is the `<Field id>`
    // below — not the field's name. Without this map every link pointed at an
    // element that does not exist and focused nothing (wave 8, F4; REQ-UIX-009).
    fieldId: (field) => FIELD_ID[field],
  });

  return (
    <form action={formAction} noValidate className="mt-4 max-w-md space-y-5">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <Field id="co-name" label={t("nameLabel")} required={required("name")} error={err("name")}>
        <Input name="name" defaultValue={was(state, "name")} maxLength={120} />
      </Field>

      <Button type="submit" pending={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
