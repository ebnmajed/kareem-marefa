"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { disconnectCalendar, retryCalendarSync, type CalendarRetryOutcome } from "@/lib/dal/calendar";

// REQ-CAL-007 — disconnect DELETES the row, immediately. There is no update
// path on `calendar_connections` for any client role, so "mark disconnected
// and keep the token" is not a thing this action could do even by accident.
//
// ★ Bound to the real locale (`.bind(null, locale)` at the call site,
// `privacy/actions.ts`'s own pattern) — this hard-coded `/ar/...` on every
// redirect before, which sent an `/en` member's disconnect back to the
// Arabic route.

export async function disconnect(locale: Locale) {
  try {
    await disconnectCalendar(locale);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/${locale}/app/me/calendar?error=disconnect`);
  }
  redirect(`/${locale}/app/me/calendar?disconnected=1`);
}

// «أعد المحاولة» (REQ-UIX-075, REQ-CAL-005, DEC-218 §2.3) — one form per failed day, so it works without JavaScript.
// The row id is all the form carries: `retry_calendar_sync()` re-derives the member, so a forged id answers
// `not_found` and moves nothing. Every answer but `queued` is the one line «تعذّرت إعادة المحاولة»: the member's
// next step is the same whichever it was.
export async function retry(locale: Locale, formData: FormData) {
  let outcome: CalendarRetryOutcome | "error";
  try {
    outcome = await retryCalendarSync(locale, formData.get("event")?.toString() ?? "");
  } catch (e) {
    unstable_rethrow(e);
    outcome = "error";
  }
  redirect(`/${locale}/app/me/calendar?${outcome === "queued" ? "retried=1" : "error=retry"}`);
}
