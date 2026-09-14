import "server-only";

// The Google OAuth client for calendar sync — REQ-CAL-003.
//
// The client id and secret are a LAUNCH input (PR C, `STATUS.md`). Until they
// exist every route here answers "not configured" and SCR-025 says so in
// Arabic, the same shape as the `NEXT_PUBLIC_` guard that makes every
// platform route a 404 before launch (DEC-038).
//
// FOR THE OWNER, AT LAUNCH: this puts the calendar OAuth **client secret** on
// Vercel. That is not the `service_role` key invariant 7 forbids, and 08 §6.3
// gives "Connect" no job — the authorization code is single-use and expires in
// minutes, so a queued exchange adds a window in which it dies unredeemed.
// The alternative is a worker-side exchange with a new job name, which is a
// change to `11`. Flagged in docs/plan/notes/notify.md.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The cookie that carries the CSRF state across the round trip. */
export const STATE_COOKIE = "kareem_cal_state";

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

/** Null when the Launch input is absent, which is every environment today. */
export function oauthClient(): OAuthClient | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  // Both or neither: a half-configured client fails at the exchange with an
  // opaque 400 instead of here with a sentence.
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function consentUrl(client: OAuthClient, redirectUri: string, state: string): string {
  const q = (value: string) => encodeURIComponent(value);
  return (
    `${AUTH_ENDPOINT}?client_id=${q(client.clientId)}` +
    `&redirect_uri=${q(redirectUri)}` +
    "&response_type=code" +
    `&scope=${q(CALENDAR_SCOPE)}` +
    // `offline` is what yields a refresh token, and `consent` is what makes
    // Google return one again on a re-connect. Without the second, a member
    // who reconnects gets no refresh token and goes silently unsynced an hour
    // later — which is the case store_calendar_connection() also guards.
    "&access_type=offline&prompt=consent" +
    `&state=${q(state)}`
  );
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
}

export async function exchangeCode(client: OAuthClient, code: string, redirectUri: string): Promise<ExchangedTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!response.ok) throw new Error(`google token exchange ${response.status}`);

  const body = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new Error("google token exchange returned no access_token");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
    scope: body.scope ?? CALENDAR_SCOPE,
  };
}
