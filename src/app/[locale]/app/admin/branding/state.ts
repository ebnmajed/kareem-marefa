import type { ResetBrandKitState, SaveBrandKitState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptySaveState: SaveBrandKitState = { error: null, saved: false };
export const emptyResetState: ResetBrandKitState = { error: null, reset: false };
