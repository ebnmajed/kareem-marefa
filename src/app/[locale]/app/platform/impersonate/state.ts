import type { ImpersonationState } from "./actions";

// A "use server" module exports async functions and types alone.
export const emptyImpersonationState: ImpersonationState = { error: null, started: false };
