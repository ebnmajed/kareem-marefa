import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and types alone, so the
// field lists and initial states of SCR-080's and SCR-081's forms live here.

/** SCR-081, in the order the fields appear on the page (the summary's order). */
export const NEW_ORG_FIELDS = ["name", "slug", "certificatePrefix", "domains", "firstAdminEmail"] as const;
export type NewOrgField = (typeof NEW_ORG_FIELDS)[number];
export type NewOrgState = FormState<NewOrgField>;

export type SuspendState = FormState<"reason">;
export type DeleteState = FormState<"confirmSlug">;

/** Fresh each call: a shared initial object is shared state between rows. */
export const emptyNewOrgState = (): NewOrgState => emptyFormState<NewOrgField>();
export const emptySuspendState = (): SuspendState => emptyFormState<"reason">();
export const emptyDeleteState = (): DeleteState => emptyFormState<"confirmSlug">();

/** A one-press act's answer: the error key, or none. */
export type RowActionResult = { error: string | null };
