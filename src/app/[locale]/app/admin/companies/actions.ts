"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyInput, createCompany, setCompanyActive } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { COMPANY_FIELDS, type CompanyField, type CompanyState } from "./state";

// SCR-048's Server Actions (REQ-ADM-008). Same reasoning as
// `admin/categories/actions.ts` and the inherited `admin/venues/actions.ts`:
// `p2_admin_insert`/`p2_admin_update` on `companies` (0004) already say who
// may write, so no RPC; no delete action, since there is no delete grant.

function errorKey(_field: CompanyField, _code: string, empty: boolean): string {
  return empty ? "nameRequired" : "nameTooLong";
}

export async function addCompany(locale: Locale, prev: CompanyState, formData: FormData): Promise<CompanyState> {
  const captured = formStateFrom<CompanyField>(formData, { fields: COMPANY_FIELDS, previous: prev });
  const raw = { name: was(captured, "name") };
  const parsed = companyInput.safeParse(raw);
  if (!parsed.success) return withErrors(captured, zodErrors<CompanyField>(parsed.error, errorKey, raw));

  try {
    await createCompany(locale, parsed.data);
  } catch {
    return withFormError(captured, "failed");
  }
  revalidatePath(`/${locale}/app/admin/companies`);
  return emptyFormState<CompanyField>();
}

export async function toggleCompany(locale: Locale, companyId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(companyId).success) return;
  await setCompanyActive(locale, companyId, active);
  revalidatePath(`/${locale}/app/admin/companies`);
}
