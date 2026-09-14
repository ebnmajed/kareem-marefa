import type { LibraryState } from "./actions";

// A "use server" module exports async functions and types alone.
export const emptyLibraryState: LibraryState = { error: null, ok: false };
