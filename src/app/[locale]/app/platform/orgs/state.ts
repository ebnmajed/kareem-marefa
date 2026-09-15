import type { OrgFormState } from "./actions";

// A "use server" module may export async functions and nothing else, so the
// initial state a client component hands `useActionState` lives here.
export const emptyOrgFormState: OrgFormState = { error: null, ok: false };
