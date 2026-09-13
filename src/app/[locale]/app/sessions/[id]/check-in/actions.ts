"use server";

import { redirect } from "next/navigation";
import { checkInInput, submitCheckIn } from "@/lib/dal/checkin";

const KNOWN_ERRORS = ["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "invalid_code", "overlap", "unknown"] as const;

// React 19 calls reset() on this form once the action resolves — even on a
// redirecting action, the DOM node is reset before navigation completes
// (sessions found this the hard way, docs/plan/notes/sessions.md §5).
// Carrying the submitted code back through the error redirect and reading
// it as CodeInput's defaultValue means a wrong-but-almost-right code isn't
// six fresh empty boxes to retype.
export async function submitCheckInForm(locale: string, sessionId: string, formData: FormData) {
  const base = `/${locale}/app/sessions/${sessionId}/check-in`;
  const submitted = encodeURIComponent(formData.get("code")?.toString().toUpperCase().slice(0, 6) ?? "");
  const parsed = checkInInput.safeParse({ code: formData.get("code")?.toString() ?? "" });
  if (!parsed.success) {
    redirect(`${base}?error=invalid_code&code=${submitted}`);
  }

  const result = await submitCheckIn(locale, sessionId, parsed.data.code);
  if (!result.ok) {
    const error = (KNOWN_ERRORS as readonly string[]).includes(result.error) ? result.error : "unknown";
    const conflict = result.conflictSessionId ? `&conflict=${result.conflictSessionId}` : "";
    redirect(`${base}?error=${error}&code=${submitted}${conflict}`);
  }
  // 09 SCR-014: "already checked in" is its own state, not the same copy as a fresh success.
  redirect(`${base}?${result.alreadyCheckedIn ? "already=1" : "success=1"}`);
}
