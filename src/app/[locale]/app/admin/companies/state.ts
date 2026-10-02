import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";

// A "use server" module may export async functions and nothing else.
//
// ★ wave 16 (DEC-195 §3): the team colour posts a NAME or «none», never a hex. ★ wave 22: the same form creates and
// edits — a company is a name, a team colour, and active-or-deactivated; no logo (DEC-195 §4), no domain (DEC-231 §6.1).

export const COMPANY_FIELDS = ["name", "teamColour"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const COMPANY_REQUIRED_FIELDS: readonly CompanyField[] = ["name"];

export type CompanyState = SavedFormState<CompanyField>;
export const emptyCompanyState: CompanyState = emptySavedState<CompanyField>();

/** The form's value for «بلا لون». */
export const NO_TEAM_COLOUR = "none";
