import type { PrivacyState } from "./actions";

// A "use server" module exports async functions and types alone.
export const emptyPrivacyState: PrivacyState = { error: null, ok: false };
