"use server";

import { redirect } from "next/navigation";
import { manualCheckInInput, markCheckedInManually, revokeCode } from "@/lib/dal/checkin";

export async function revokeCodeAction(locale: string, sessionId: string) {
  await revokeCode(locale, sessionId);
  redirect(`/${locale}/app/sessions/${sessionId}/host?revoked=1`);
}

const KNOWN_MANUAL_ERRORS = ["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "unknown"] as const;

// STORY-CHK-004's manual backup, from the host view. Zod first (shape), the
// RPC re-derives authority (staff only) and can still refuse even though
// the form only offers this to a staff viewer — a stale role in this
// render is not trusted for the write.
//
// React 19 calls reset() on this form once the action resolves, which
// empties the (uncontrolled) member select and reason field even though
// the redirect below changes the URL rather than staying put (sessions
// found this the hard way, docs/plan/notes/sessions.md §5) — so a
// moderator who mistypes nothing but hits reason_required would otherwise
// have to reselect the member and retype the reason. Carrying both back
// through the error redirect and reading them as defaultValue avoids that.
export async function markManuallyAction(locale: string, sessionId: string, formData: FormData) {
  const base = `/${locale}/app/sessions/${sessionId}/host`;
  const memberId = formData.get("memberId")?.toString() ?? "";
  const reason = formData.get("reason")?.toString() ?? "";
  const carry = `&memberId=${encodeURIComponent(memberId)}&reason=${encodeURIComponent(reason)}`;

  const parsed = manualCheckInInput.safeParse({ memberId, reason });
  if (!parsed.success) {
    redirect(`${base}?manualError=reason_required${carry}`);
  }

  const result = await markCheckedInManually(locale, sessionId, parsed.data.memberId, parsed.data.reason);
  if (!result.ok) {
    const error = (KNOWN_MANUAL_ERRORS as readonly string[]).includes(result.error) ? result.error : "unknown";
    redirect(`${base}?manualError=${error}${carry}`);
  }
  redirect(`${base}?manualSuccess=1`);
}
