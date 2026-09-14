import type { ManualMarkState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyManualMarkState: ManualMarkState = { error: null, done: false };
