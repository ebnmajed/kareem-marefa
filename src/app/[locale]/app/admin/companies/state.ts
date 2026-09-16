import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else.
//
// ★ Replaces the old `CompanyState = { error: string | null }` — moved onto
// `lib/form-state`'s shared model for wave 7 (`DEC-137`), same as
// `admin/venues/state.ts` and `admin/categories/state.ts`.

export const COMPANY_FIELDS = ["name"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const COMPANY_REQUIRED_FIELDS: readonly CompanyField[] = ["name"];

export type CompanyState = FormState<CompanyField>;
export const emptyCompanyState: CompanyState = emptyFormState<CompanyField>();
