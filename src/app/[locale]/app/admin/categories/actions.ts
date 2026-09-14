"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoryInput, createCategory, setCategoryActive } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";

// SCR-047's Server Actions (REQ-ADM-007). Zod first, then the DAL. No RPC
// here, deliberately, same reasoning as `admin/venues/actions.ts`: `p2_
// admin_insert`/`p2_admin_update` on `categories` (0004) already say who
// may write, so a function would only re-implement RLS. No delete action
// either — there is no delete grant and no delete policy.

export type CategoryState = { error: string | null };

export async function addCategory(locale: Locale, _prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const parsed = categoryInput.safeParse({ name: formData.get("name")?.toString() ?? "" });
  if (!parsed.success) return { error: "invalid" };

  try {
    await createCategory(locale, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/app/admin/categories`);
  return { error: null };
}

export async function toggleCategory(locale: Locale, categoryId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(categoryId).success) return;
  await setCategoryActive(locale, categoryId, active);
  revalidatePath(`/${locale}/app/admin/categories`);
}
