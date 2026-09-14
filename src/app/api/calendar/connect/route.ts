import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/dal/session";
import { consentUrl, oauthClient, STATE_COOKIE } from "../oauth";

// GET /api/calendar/connect — REQ-CAL-003, SCR-025.
//
// A Route Handler because it ends in a redirect to Google, which a Server
// Action cannot do. `requireSession()` runs first: an unauthenticated request
// must not be able to start an OAuth flow that would bind a Google account to
// whoever happens to be signed in when it returns.

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession("ar");

  const settings = oauthClient();
  const back = new URL("/ar/app/me/calendar", request.url);
  if (!settings) {
    // The Launch input is absent, which is every environment today. Say so on
    // the screen rather than sending the member to a Google error page.
    back.searchParams.set("error", "unconfigured");
    return NextResponse.redirect(back);
  }

  // CSRF: a value we mint, kept in an httpOnly cookie, compared on the way
  // back. Without it a forged callback could bind an attacker's Google
  // account to this member's row.
  const state = randomUUID();
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // `strict` would drop the cookie on Google's cross-site return
    secure: new URL(request.url).protocol === "https:",
    path: "/api/calendar",
    maxAge: 600,
  });

  const redirectUri = new URL("/api/calendar/callback", request.url).toString();
  return NextResponse.redirect(consentUrl(settings, redirectUri, state));
}
