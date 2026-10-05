import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { CompanyDomainError } from "@/lib/dal/admin-lists";

// A "use server" module may export async functions and nothing else.
//
// ★ wave 16 (DEC-195 §3): the team colour posts a NAME or «none», never a hex. ★ wave 22: the same form creates and
// edits — a company is a name, a team colour, and active-or-deactivated; no logo (DEC-195 §4). ★ wave 27 (`DEC-254` §2,
// `REQ-ADM-024`): and its domains — `DEC-231` §6.1's «a company has no domain» is reversed by the owner's ruling.

export const COMPANY_FIELDS = ["name", "teamColour", "domains"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const COMPANY_REQUIRED_FIELDS: readonly CompanyField[] = ["name"];

/** What the save would do, asked before it does it (ruling 7). Counts and the destination's name — never a member's. */
export interface CompanyConfirm {
  moving: number;
  held: number;
  /** Proves on confirm that the population is the one shown; the server re-derives and compares. */
  token: string;
  companyName: string;
  /** The confirm found a different population: the dialog says so and shows the new numbers. */
  changed: boolean;
}

export type CompanyState = SavedFormState<CompanyField> & {
  /** Per domain, why it was refused — the field's error names each one. */
  domainErrors: CompanyDomainError[];
  confirm: CompanyConfirm | null;
};
export const emptyCompanyState: CompanyState = { ...emptySavedState<CompanyField>(), domainErrors: [], confirm: null };

/** The form's value for «بلا لون». */
export const NO_TEAM_COLOUR = "none";

/** The textarea's lines (or commas), trimmed, empties dropped. The database normalises and judges them. */
export function domainLines(raw: string): string[] {
  return raw
    .split(/[\n,،;\s]+/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}
