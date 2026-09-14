import type { ModerationState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyModerationState: ModerationState = { error: null };
