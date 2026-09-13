import type { VenueState } from "./actions";

// A "use server" module may export async functions and nothing else.
export const emptyVenueState: VenueState = { error: null };
