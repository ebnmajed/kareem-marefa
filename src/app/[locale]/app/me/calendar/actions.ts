"use server";

import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { disconnectCalendar } from "@/lib/dal/calendar";

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
  } catch {
    redirect(`/${locale}/app/me/calendar?error=disconnect`);
  }
  redirect(`/${locale}/app/me/calendar?disconnected=1`);
}
