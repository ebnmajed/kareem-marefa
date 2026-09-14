"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createVenue, setVenueActive, venueInput } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";

// SCR-046's Server Actions (REQ-SES-006, REQ-ADM-006). Zod first, then the DAL.
//
// No RPC and no definer function here, deliberately: `venues` already carries
// `p2_admin_insert` and `p2_admin_update` (0004), so RLS decides who may write
// and a function would only re-implement it. ★ And there is deliberately no
// delete action, because there is no delete grant and no delete policy — which
// is REQ-SES-006's "cannot be deleted, only deactivated" as a privilege rather
// than as a code path.

export type VenueState = { error: string | null };

export async function addVenue(locale: Locale, _prev: VenueState, formData: FormData): Promise<VenueState> {
  const opt = (n: string) => formData.get(n)?.toString().trim() || null;
  const capacity = opt("capacity");
  const parsed = venueInput.safeParse({
    name: formData.get("name")?.toString() ?? "",
    address: opt("address"),
    mapUrl: opt("mapUrl"),
    capacity: capacity === null ? null : Number(capacity),
    notes: opt("notes"),
    timeZone: opt("timeZone"),
  });
  if (!parsed.success) return { error: "invalid" };

  try {
    await createVenue(locale, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/app/admin/venues`);
  return { error: null };
}

export async function toggleVenue(locale: Locale, venueId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(venueId).success) return;
  await setVenueActive(locale, venueId, active);
  revalidatePath(`/${locale}/app/admin/venues`);
}
