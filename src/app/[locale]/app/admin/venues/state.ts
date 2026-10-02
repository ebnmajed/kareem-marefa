import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";

// A "use server" module may export async functions and nothing else — the
// fields, the empty state and the «no company» value live here.
//
// ★ wave 22 (`REQ-ADM-022`): `companyId` — the owning company, or «لا شركة»,
// a real and final choice, posted as `NO_COMPANY`.

export const VENUE_FIELDS = ["name", "companyId", "address", "mapUrl", "capacity", "timeZone", "notes"] as const;
export type VenueField = (typeof VENUE_FIELDS)[number];
export const VENUE_REQUIRED_FIELDS: readonly VenueField[] = ["name"];

export type VenueState = SavedFormState<VenueField>;
export const emptyVenueState: VenueState = emptySavedState<VenueField>();

/** The `select`'s value for «لا شركة». */
export const NO_COMPANY = "none";
