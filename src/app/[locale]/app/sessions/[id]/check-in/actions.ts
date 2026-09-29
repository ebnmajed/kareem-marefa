"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { CheckInMomentResult } from "@/components/checkin/moment-check-in";
import { checkInInput, submitCheckIn } from "@/lib/dal/checkin";

// ★ `reservation_required` is a refusal of its own (DEC-197 §4): a walk-in the
// RPC turns away reads the screen's own sentence, never «حدث خطأ».
const KNOWN_ERRORS = ["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "check_in_closed", "reservation_required", "invalid_code", "overlap", "unknown"] as const;

/**
 * The one attempt both actions make. A fresh check-in comes back with its id;
 * everything else — «already», a refusal — comes back as the URL the screen
 * renders it at, identical for the two paths.
 *
 * React 19 calls reset() on this form once the action resolves — even on a
 * redirecting action, the DOM node is reset before navigation completes
 * (sessions found this the hard way, docs/plan/notes/sessions.md §5).
 * Carrying the submitted code back through the error redirect and reading it
 * as the boxes' defaultValue means a wrong-but-almost-right code isn't six
 * fresh empty boxes to retype.
 */
async function attempt(locale: string, sessionId: string, formData: FormData): Promise<{ checkInId: string } | { to: string }> {
  const base = `/${locale}/app/sessions/${sessionId}/check-in`;
  const submitted = encodeURIComponent(formData.get("code")?.toString().toUpperCase().slice(0, 6) ?? "");
  const parsed = checkInInput.safeParse({ code: formData.get("code")?.toString() ?? "" });
  if (!parsed.success) return { to: `${base}?error=invalid_code&code=${submitted}` };

  const result = await submitCheckIn(locale, sessionId, parsed.data.code);
  if (!result.ok) {
    const error = (KNOWN_ERRORS as readonly string[]).includes(result.error) ? result.error : "unknown";
    const conflict = result.conflictSessionId ? `&conflict=${result.conflictSessionId}` : "";
    return { to: `${base}?error=${error}&code=${submitted}${conflict}` };
  }
  // 09 SCR-014: "already checked in" is its own state, not the same copy as a fresh success.
  if (result.alreadyCheckedIn) return { to: `${base}?already=1` };
  return { checkInId: result.checkInId };
}

/** The no-JS path — the form's own `action`. It redirects, always, as it always has. */
export async function submitCheckInForm(locale: string, sessionId: string, formData: FormData) {
  const outcome = await attempt(locale, sessionId, formData);
  redirect("to" in outcome ? outcome.to : `/${locale}/app/sessions/${sessionId}/check-in?success=1`);
}

/**
 * ★ The hydrated path (REQ-UIX-046, DEC-195 §2.1). A fresh check-in RETURNS its
 * id — the occurrence moment 2 plays from, which a redirect would drop — and
 * `refresh()` sends the page's post-check-in tree in the same response, so the
 * coin, the amount and the time arrive with it and a back navigation finds the
 * static state. «Already» and every refusal redirect exactly as the no-JS path.
 */
export async function checkInForMoment(locale: string, sessionId: string, formData: FormData): Promise<CheckInMomentResult> {
  const outcome = await attempt(locale, sessionId, formData);
  if ("to" in outcome) redirect(outcome.to);
  refresh();
  return { checkInId: outcome.checkInId };
}
