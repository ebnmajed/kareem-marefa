import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and types alone, so SCR-083's
// form state lives here.

/** The promotion dialog: one optional field, and whether it went through. */
export type PromoteState = FormState<"name"> & { promoted: boolean };
export const emptyPromoteState = (): PromoteState => ({ ...emptyFormState<"name">(), promoted: false });

/** A one-press act's answer: the error key, or none. */
export type LibraryActResult = { error: string | null };
