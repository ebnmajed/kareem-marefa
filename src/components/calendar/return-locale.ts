import { routing, type Locale } from "@/i18n/routing";

// Where the Google OAuth round trip returns — `REQ-CAL-003`, wave 20 (`DEC-218` §2.5, C18).
//
// `/api/calendar/connect` and its callback hard-coded `/ar/app/me/calendar`, so an `/en` member who connected came
// back to the Arabic page. The locale now travels with the round trip: `025`'s «اربط» link sends `?locale=`, the
// connect route keeps it in a cookie beside the OAuth state, and the callback reads it back.
//
// ★ A VALUE FROM THE REQUEST NEVER REACHES A REDIRECT. It is matched against the routing's own list and anything
// else is the default — so `?locale=//evil.example` returns to `/ar/app/me/calendar` on this origin, and the
// callback cannot be made into an open redirect.

/** The cookie the connect route sets beside `STATE_COOKIE`, with the same scope and lifetime. */
export const LOCALE_COOKIE = "kareem_cal_locale";

export function returnLocale(raw: string | null | undefined): Locale {
  return (routing.locales as readonly string[]).includes(raw ?? "") ? (raw as Locale) : routing.defaultLocale;
}

/** The calendar page in that locale, on the request's origin. */
export function calendarReturnUrl(request: Request, raw: string | null | undefined, params: Record<string, string> = {}): URL {
  const url = new URL(`/${returnLocale(raw)}/app/me/calendar`, request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
