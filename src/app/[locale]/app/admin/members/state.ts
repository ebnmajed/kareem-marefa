import type { RowState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyRowState: RowState = { error: null };
