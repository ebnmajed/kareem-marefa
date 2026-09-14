"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyInput, createCompany, setCompanyActive } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";

// SCR-048's Server Actions (REQ-ADM-008). Same reasoning as
// `admin/categories/actions.ts` and the inherited `admin/venues/actions.ts`:
// `p2_admin_insert`/`p2_admin_update` on `companies` (0004) already say who
// may write, so no RPC; no delete action, since there is no delete grant.

export type CompanyState = { error: string | null };

export async function addCompany(locale: Locale, _prev: CompanyState, formData: FormData): Promise<CompanyState> {
  const parsed = companyInput.safeParse({ name: formData.get("name")?.toString() ?? "" });
  if (!parsed.success) return { error: "invalid" };

  try {
    await createCompany(locale, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/app/admin/companies`);
  return { error: null };
}

export async function toggleCompany(locale: Locale, companyId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(companyId).success) return;
  await setCompanyActive(locale, companyId, active);
  revalidatePath(`/${locale}/app/admin/companies`);
}
