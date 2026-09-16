"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoryInput, createCategory, setCategoryActive } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { CATEGORY_FIELDS, type CategoryField, type CategoryState } from "./state";

// SCR-047's Server Actions (REQ-ADM-007). Zod first, then the DAL. No RPC
// here, deliberately, same reasoning as `admin/venues/actions.ts`: `p2_
// admin_insert`/`p2_admin_update` on `categories` (0004) already say who
// may write, so a function would only re-implement RLS. No delete action
// either — there is no delete grant and no delete policy.

function errorKey(_field: CategoryField, _code: string, empty: boolean): string {
  return empty ? "nameRequired" : "nameTooLong";
}

export async function addCategory(locale: Locale, prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const captured = formStateFrom<CategoryField>(formData, { fields: CATEGORY_FIELDS, previous: prev });
  const raw = { name: was(captured, "name") };
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return withErrors(captured, zodErrors<CategoryField>(parsed.error, errorKey, raw));

  try {
    await createCategory(locale, parsed.data);
  } catch {
    return withFormError(captured, "failed");
  }
  revalidatePath(`/${locale}/app/admin/categories`);
  return emptyFormState<CategoryField>();
}

export async function toggleCategory(locale: Locale, categoryId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(categoryId).success) return;
  await setCategoryActive(locale, categoryId, active);
  revalidatePath(`/${locale}/app/admin/categories`);
}
