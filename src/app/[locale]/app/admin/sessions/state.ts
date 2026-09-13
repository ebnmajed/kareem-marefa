import type { CreateSessionState } from "./actions";

// A "use server" module may export async functions and nothing else — Next 16
// refuses a non-function export from a server-action module at BUILD time,
// where `tsc` cannot see it. Same rule, same fix as the review route's
// state.ts.
export const emptyCreateState: CreateSessionState = { error: null };
