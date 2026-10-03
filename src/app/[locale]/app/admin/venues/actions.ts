"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedState } from "@/components/admin/saved-form-state";
import { createVenue, setVenueActive, updateVenue, venueInput } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { NO_COMPANY, VENUE_FIELDS, type VenueField, type VenueState } from "./state";

// SCR-046's Server Actions (REQ-SES-006, REQ-ADM-006, REQ-ADM-022). Zod first, then the DAL.
//
// No RPC: `venues` carries `p2_admin_insert` / `p2_admin_update` (0004), so RLS decides who may write; `0180`'s
// trigger refuses a company of another org. No delete action — there is no delete grant. No audit call either: the
// rows (`venue.created` · `venue.changed` · `venue.company_changed` · `venue.deactivated` · `venue.reactivated`) are
// the database's own triggers' (contract 3).
//
// ★ wave 22 (`DEC-232` §3.1): every action answers with what it WROTE. A write that matched no row — an admin
// demoted mid-session, a row RLS filtered away — is «not written», never «saved».

function errorKey(field: VenueField, _code: string, empty: boolean): string {
  switch (field) {
    case "name":
      return empty ? "nameRequired" : "nameTooLong";
    case "companyId":
      return "companyInvalid";
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

/** Create (`venueId` null) or edit — one form, one save. */
export async function saveVenue(locale: Locale, venueId: string | null, prev: VenueState, formData: FormData): Promise<VenueState> {
  const captured = formStateFrom<VenueField>(formData, { fields: VENUE_FIELDS, previous: prev });
  const opt = (v: string) => (v.trim() === "" ? null : v.trim());
  const capacityRaw = opt(was(captured, "capacity"));
  const companyRaw = was(captured, "companyId");
  const raw = {
    name: was(captured, "name"),
    address: opt(was(captured, "address")),
    mapUrl: opt(was(captured, "mapUrl")),
    capacity: capacityRaw === null ? null : Number(capacityRaw),
    notes: opt(was(captured, "notes")),
    timeZone: opt(was(captured, "timeZone")),
    companyId: companyRaw === "" || companyRaw === NO_COMPANY ? null : companyRaw,
  };
  const parsed = venueInput.safeParse(raw);
  if (!parsed.success) return { ...withErrors(captured, zodErrors<VenueField>(parsed.error, errorKey, raw)), saved: false };

  const result = venueId ? await updateVenue(locale, venueId, parsed.data) : await createVenue(locale, parsed.data);
  if (!result.ok) {
    return result.error === "companyInvalid"
      ? { ...withErrors(captured, { companyId: "companyInvalid" }), saved: false }
      : { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(`/${locale}/app/admin/venues`);
  return savedState<VenueField>();
}

export async function setVenueActiveAction(locale: Locale, venueId: string, active: boolean): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(venueId).success) return { ok: false };
  const result = await setVenueActive(locale, venueId, active);
  if (result.ok) revalidatePath(`/${locale}/app/admin/venues`);
  return result;
}
