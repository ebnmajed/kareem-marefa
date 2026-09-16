import type { ManualMarkState, RemoveState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyManualMarkState: ManualMarkState = { error: null, done: false };
export const emptyRemoveState: RemoveState = { error: null, done: false };
