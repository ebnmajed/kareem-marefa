"use client";

import { useTranslations } from "next-intl";
import { ListEditorForm } from "@/components/admin/list-editor-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminCategory } from "@/lib/dal/admin-lists";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { CATEGORY_FIELDS, emptyCategoryState, type CategoryState } from "./state";

// SCR-047's one form — create (`?new=1`) and rename (`?edit=<id>`), written for wave 22. A name and nothing else:
// no tags (`DEC-227` §3).

export function CategoryForm({
  action,
  category,
  closeHref,
}: {
  action: (prev: CategoryState, formData: FormData) => Promise<CategoryState>;
  category: AdminCategory | null;
  closeHref: string;
}) {
  const t = useTranslations("admin.categories");
  return (
    <ListEditorForm<CategoryState>
      action={action}
      emptyState={emptyCategoryState}
      closeHref={closeHref}
      savedLabel={t("saved")}
      failedMessage={(key) => t(`errors.${key}`)}
      summaryTitle={t("errorSummaryTitle")}
      summary={(state) => summaryErrors(state, { fields: CATEGORY_FIELDS, label: () => t("nameLabel"), message: (key) => t(`errors.${key}`), fieldId: () => "category-name" })}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
    >
      {(state) => (
        <Field id="category-name" label={t("nameLabel")} required error={state.errors.name ? t(`errors.${state.errors.name}`) : undefined}>
          <Input name="name" defaultValue={hasAttempted(state) && !state.saved ? was(state, "name") : (category?.name ?? "")} maxLength={80} />
        </Field>
      )}
    </ListEditorForm>
  );
}
