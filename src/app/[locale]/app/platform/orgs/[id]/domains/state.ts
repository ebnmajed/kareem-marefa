import type { DomainState } from "./actions";

// A "use server" module exports async functions and types alone.
export const emptyDomainState: DomainState = { error: null, ok: false };
