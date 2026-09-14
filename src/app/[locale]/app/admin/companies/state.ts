import type { CompanyState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyCompanyState: CompanyState = { error: null };
