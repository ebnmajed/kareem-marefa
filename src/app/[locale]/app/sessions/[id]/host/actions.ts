"use server";

import { redirect } from "next/navigation";
import { manualCheckInInput, markCheckedInManually, revokeCode, setCheckInOpen, type SetCheckInOpenError } from "@/lib/dal/checkin";

// ★ `dayId` is bound at the call site from the code the page is SHOWING
// (DEC-119), not resolved again here: between render and click the clock can
// cross a day boundary, and revoking «the current day's code» would then
// revoke a code nobody in the room is looking at.
export async function revokeCodeAction(locale: string, sessionId: string, dayId: string | null) {
  await revokeCode(locale, sessionId, dayId);
  redirect(`/${locale}/app/sessions/${sessionId}/host?revoked=1`);
}

// ★ `setWalkInsAction()` is gone — DEC-117: walk-ins move to a publishing
// setting (`sessions`' schedule form), and the host view loses the toggle.

const KNOWN_SWITCH_ERRORS: SetCheckInOpenError[] = ["not_found", "not_authorized", "not_open", "ceiling_passed", "unknown"];

// DEC-141/REQ-CHK-015 — the switch. `open` is bound at the call site (two
// buttons, not a single toggle with a hidden field), the same shape
// `revokeCodeAction` already uses: no client state, the button's own
// `formAction` IS the decision. `set_check_in_open()` re-derives authority
// itself (presenter of THIS session, or staff) — a stale `consoleActive`
// read in this render is not trusted for the write.
export async function setCheckInOpenAction(locale: string, sessionId: string, open: boolean, dayId: string | null) {
  const base = `/${locale}/app/sessions/${sessionId}/host`;
  const result = await setCheckInOpen(locale, sessionId, open, dayId);
  if (!result.ok) {
    const error = KNOWN_SWITCH_ERRORS.includes(result.error) ? result.error : "unknown";
    redirect(`${base}?switchError=${error}`);
  }
  redirect(`${base}?switch=${open ? "opened" : "closed"}`);
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
export async function markManuallyAction(locale: string, sessionId: string, dayId: string | null, formData: FormData) {
  const base = `/${locale}/app/sessions/${sessionId}/host`;
  const memberId = formData.get("memberId")?.toString() ?? "";
  const reason = formData.get("reason")?.toString() ?? "";
  const carry = `&memberId=${encodeURIComponent(memberId)}&reason=${encodeURIComponent(reason)}`;

  const parsed = manualCheckInInput.safeParse({ memberId, reason });
  if (!parsed.success) {
    redirect(`${base}?manualError=reason_required${carry}`);
  }

  const result = await markCheckedInManually(locale, sessionId, parsed.data.memberId, parsed.data.reason, dayId);
  if (!result.ok) {
    const error = (KNOWN_MANUAL_ERRORS as readonly string[]).includes(result.error) ? result.error : "unknown";
    redirect(`${base}?manualError=${error}${carry}`);
  }
  redirect(`${base}?manualSuccess=1`);
}
