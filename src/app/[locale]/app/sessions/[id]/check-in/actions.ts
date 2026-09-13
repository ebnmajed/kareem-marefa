"use server";

import { redirect } from "next/navigation";
import { checkInInput, submitCheckIn } from "@/lib/dal/checkin";

const KNOWN_ERRORS = ["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "invalid_code", "overlap", "unknown"] as const;

export async function submitCheckInForm(locale: string, sessionId: string, formData: FormData) {
  const base = `/${locale}/app/sessions/${sessionId}/check-in`;
  const parsed = checkInInput.safeParse({ code: formData.get("code")?.toString() ?? "" });
  if (!parsed.success) {
    redirect(`${base}?error=invalid_code`);
  }

  const result = await submitCheckIn(locale, sessionId, parsed.data.code);
  if (!result.ok) {
    const error = (KNOWN_ERRORS as readonly string[]).includes(result.error) ? result.error : "unknown";
    const conflict = result.conflictSessionId ? `&conflict=${result.conflictSessionId}` : "";
    redirect(`${base}?error=${error}${conflict}`);
  }
  redirect(`${base}?success=1`);
}
