import type { AddState, RowState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyRowState: RowState = { error: null, done: false };

export const emptyAddState: AddState = { error: null, done: false, report: [] };
