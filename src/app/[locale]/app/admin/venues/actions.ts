"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createVenue, setVenueActive, venueInput } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { VENUE_FIELDS, type VenueField, type VenueState } from "./state";

// SCR-046's Server Actions (REQ-SES-006, REQ-ADM-006). Zod first, then the DAL.
//
// No RPC and no definer function here, deliberately: `venues` already carries
// `p2_admin_insert` and `p2_admin_update` (0004), so RLS decides who may write
// and a function would only re-implement it. ★ And there is deliberately no
// delete action, because there is no delete grant and no delete policy — which
// is REQ-SES-006's "cannot be deleted, only deactivated" as a privilege rather
// than as a code path.

/** The message key for a failed field — same reasoning `admin/sessions/
 *  actions.ts`'s `errorKey()` gives. */
function errorKey(field: VenueField, code: string, empty: boolean): string {
  switch (field) {
    case "name":
      return empty ? "nameRequired" : "nameTooLong";
    case "address":
      return "addressTooLong";
    case "mapUrl":
      return "mapUrlInvalid";
    case "capacity":
      return "capacityInvalid";
    case "notes":
      return "notesTooLong";
    case "timeZone":
      return "timeZoneTooLong";
    default:
      return "failed";
  }
}

export async function addVenue(locale: Locale, prev: VenueState, formData: FormData): Promise<VenueState> {
  const captured = formStateFrom<VenueField>(formData, { fields: VENUE_FIELDS, previous: prev });
  const opt = (v: string) => (v.trim() === "" ? null : v.trim());
  const capacityRaw = opt(was(captured, "capacity"));
  const raw = {
    name: was(captured, "name"),
    address: opt(was(captured, "address")),
    mapUrl: opt(was(captured, "mapUrl")),
    capacity: capacityRaw === null ? null : Number(capacityRaw),
    notes: opt(was(captured, "notes")),
    timeZone: opt(was(captured, "timeZone")),
  };
  const parsed = venueInput.safeParse(raw);
  if (!parsed.success) return withErrors(captured, zodErrors<VenueField>(parsed.error, errorKey, raw));

  try {
    await createVenue(locale, parsed.data);
  } catch {
    return withFormError(captured, "failed");
  }
  revalidatePath(`/${locale}/app/admin/venues`);
  // A fresh, empty form for the next entry — the new venue's own row is the
  // confirmation, in the list below (unchanged from before this rebuild).
  return emptyFormState<VenueField>();
}

export async function toggleVenue(locale: Locale, venueId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(venueId).success) return;
  await setVenueActive(locale, venueId, active);
  revalidatePath(`/${locale}/app/admin/venues`);
}
