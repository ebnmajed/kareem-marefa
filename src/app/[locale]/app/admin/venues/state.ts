import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else — same
// rule `admin/sessions/state.ts` documents.
//
// ★ Replaces the old `VenueState = { error: string | null }` — the add form
// moved onto `lib/form-state`'s shared model for wave 7 (`DEC-137`), same as
// `admin/sessions/direct-session-form.tsx` already did in wave 6.

export const VENUE_FIELDS = ["name", "address", "mapUrl", "capacity", "notes", "timeZone"] as const;
export type VenueField = (typeof VENUE_FIELDS)[number];
export const VENUE_REQUIRED_FIELDS: readonly VenueField[] = ["name"];

export type VenueState = FormState<VenueField>;
export const emptyVenueState: VenueState = emptyFormState<VenueField>();
