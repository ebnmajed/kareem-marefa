import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and types alone, so SCR-082's
// form states live here.

/** The add form, plus what happened: the domain as the table STORES it, or that it was already there. */
export type AddDomainState = FormState<"domain"> & { done: "added" | "present" | null; stored: string };
export type FirstAdminState = FormState<"email">;

export const emptyAddDomainState = (): AddDomainState => ({ ...emptyFormState<"domain">(), done: null, stored: "" });
export const emptyFirstAdminState = (): FirstAdminState => emptyFormState<"email">();

export type RemoveDomainResult = { error: string | null };
