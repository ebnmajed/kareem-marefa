import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else.
//
// ★ Replaces the old `CompanyState = { error: string | null }` — moved onto
// `lib/form-state`'s shared model for wave 7 (`DEC-137`), same as
// `admin/venues/state.ts` and `admin/categories/state.ts`.

// ★ wave 16 (DEC-195 §3): the team colour is chosen while the company is
// added. It posts a NAME or «none», never a hex.
export const COMPANY_FIELDS = ["name", "teamColour"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const COMPANY_REQUIRED_FIELDS: readonly CompanyField[] = ["name"];

export type CompanyState = FormState<CompanyField>;
export const emptyCompanyState: CompanyState = emptyFormState<CompanyField>();

/** The add form's value for «بلا لون». */
export const NO_TEAM_COLOUR = "none";
