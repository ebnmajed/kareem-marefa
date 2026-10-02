"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedState } from "@/components/admin/saved-form-state";
import { categoryInput, createCategory, setCategoryActive, updateCategory } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { CATEGORY_FIELDS, type CategoryField, type CategoryState } from "./state";

// SCR-047's Server Actions (REQ-ADM-007, REQ-UIX-094). Zod first, then the DAL. `p2_admin_insert` / `p2_admin_update`
// on `categories` (0004) say who may write; there is no delete grant, so there is no delete action. The audit rows
// (`category.created` · `category.changed` · `category.deactivated` · `category.reactivated`) are the database's
// triggers' (contract 3). ★ Every action answers with what it WROTE (`DEC-232` §3.1).

function errorKey(_field: CategoryField, _code: string, empty: boolean): string {
  return empty ? "nameRequired" : "nameTooLong";
}

/** Create (`categoryId` null) or rename. */
export async function saveCategory(locale: Locale, categoryId: string | null, prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const captured = formStateFrom<CategoryField>(formData, { fields: CATEGORY_FIELDS, previous: prev });
  const raw = { name: was(captured, "name") };
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return { ...withErrors(captured, zodErrors<CategoryField>(parsed.error, errorKey, raw)), saved: false };

  const result = categoryId ? await updateCategory(locale, categoryId, parsed.data) : await createCategory(locale, parsed.data);
  if (!result.ok) return { ...withFormError(captured, "failed"), saved: false };
  revalidatePath(`/${locale}/app/admin/categories`);
  return savedState<CategoryField>();
}

export async function setCategoryActiveAction(locale: Locale, categoryId: string, active: boolean): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(categoryId).success) return { ok: false };
  const result = await setCategoryActive(locale, categoryId, active);
  if (result.ok) revalidatePath(`/${locale}/app/admin/categories`);
  return result;
}
