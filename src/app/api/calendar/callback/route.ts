import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/dal/session";
import { exchangeCode, oauthClient, STATE_COOKIE } from "../oauth";

// GET /api/calendar/callback — REQ-CAL-003.
//
// Google returns here with a single-use code. The exchange happens server-side
// and the tokens go straight into `store_calendar_connection()`, which writes
// them for `auth_member_id()` and nothing else. After this request no client
// role can read them again — not the member, not an admin (03 §5.9c).
//
// Every failure lands back on SCR-025 with a reason. A dead end on an OAuth
// return is the worst place to leave someone: they cannot tell whether it
// worked, and trying again is the only thing they can do.

export const runtime = "nodejs";

const back = (request: Request, params: Record<string, string> = {}) => {
  const url = new URL("/ar/app/me/calendar", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
};

export async function GET(request: Request) {
  const { supabase } = await sessionClient("ar");
  const url = new URL(request.url);
  const store = await cookies();

  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  // The member pressed "cancel" on Google's consent screen. Not an error.
  const denied = url.searchParams.get("error");
  if (denied) return back(request, { cancelled: "1" });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return back(request, { error: "state" });

  const settings = oauthClient();
  if (!settings) return back(request, { error: "unconfigured" });

  try {
    const tokens = await exchangeCode(settings, code, new URL("/api/calendar/callback", request.url).toString());
    // The RPC takes no member id: the row it writes is the caller's, and the
    // caller is the JWT. See supabase/proposed/notify/0006.
    const { error } = await supabase.rpc("store_calendar_connection", {
      p_access: tokens.accessToken,
      p_refresh: tokens.refreshToken,
      p_expires: tokens.expiresAt,
      p_scope: tokens.scope,
    });
    if (error) throw new Error(error.message);
  } catch {
    // Deliberately no detail in the URL: the exchange failure message can
    // carry the code, and a code in a browser history is a credential in a
    // browser history.
    return back(request, { error: "exchange" });
  }

  return back(request, { connected: "1" });
}
