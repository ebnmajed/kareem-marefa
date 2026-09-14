"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { CategoryState } from "./actions";
import { emptyCategoryState } from "./state";

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export function CategoryForm({ action }: { action: (prev: CategoryState, formData: FormData) => Promise<CategoryState> }) {
  const t = useTranslations("admin.categories");
  const [state, formAction, pending] = useActionState(action, emptyCategoryState);

  return (
    <form action={formAction} className="mt-4 max-w-md space-y-5">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}
      <div>
        <label htmlFor="c-name" className="text-label text-fg-heading">
          {t("nameLabel")}
        </label>
        <input id="c-name" name="name" required maxLength={80} className={FIELD} />
      </div>
      <Button type="submit" disabled={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
