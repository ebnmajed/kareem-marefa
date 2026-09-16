"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { CATEGORY_FIELDS, CATEGORY_REQUIRED_FIELDS, emptyCategoryState, type CategoryField, type CategoryState } from "./state";

// SCR-047's add form, onto `lib/form-state`'s shared model for wave 7
// (`16` §8.2, `DEC-137`).

const LABEL_KEY: Record<CategoryField, string> = { name: "nameLabel" };

const FIELD_ID: Record<CategoryField, string> = {
  name: "c-name",
};

export function CategoryForm({ action }: { action: (prev: CategoryState, formData: FormData) => Promise<CategoryState> }) {
  const t = useTranslations("admin.categories");
  const [state, formAction, pending] = useActionState(action, emptyCategoryState);
  const err = (field: CategoryField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: CategoryField) => CATEGORY_REQUIRED_FIELDS.includes(field);

  const summary = summaryErrors(state, {
    fields: CATEGORY_FIELDS,
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

      <Field id="c-name" label={t("nameLabel")} required={required("name")} error={err("name")}>
        <Input name="name" defaultValue={was(state, "name")} maxLength={80} />
      </Field>

      <Button type="submit" pending={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
