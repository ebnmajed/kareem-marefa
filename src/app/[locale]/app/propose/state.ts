import type { ProposeState } from "./actions";

// A "use server" module may export async functions and nothing else, so the
// initial state lives here (Next 16 refuses it at build time, where tsc
// cannot see it).
export const emptyProposeState: ProposeState = { errors: {}, formError: null, values: {}, coPresenters: [] };
