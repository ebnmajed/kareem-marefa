import type { ReviewState } from "./actions";

// A "use server" module may export async functions and nothing else — Next 16
// refuses a non-function export from a server-action module at build time,
// where `tsc` cannot see it.
export const emptyReviewState: ReviewState = { error: null, done: false, reason: "" };
