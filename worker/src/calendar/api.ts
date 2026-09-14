// The Google Calendar surface the sync jobs use — REQ-CAL-003 … REQ-CAL-008.
//
// Four calls, and no more. 11 §3.4 limits the worker's outbound network to
// Supabase, Google Calendar, Resend and Sentry; keeping the surface this
// narrow is what makes "the OAuth scope requested is the narrowest that
// permits event write" (REQ-CAL-003) true of the code and not only of the
// consent screen.
//
// The OAuth client is a LAUNCH input (PR C). Until it exists the factory
// returns the stub, so every test and every local run exercises the same job
// code against a fake API rather than skipping the path entirely.

export interface CalendarEventBody {
  summary: string;
  description: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  cancelled?: boolean;
}

export class CalendarNotFound extends Error {}
export class CalendarAuthExpired extends Error {}

export interface CalendarApi {
  readonly name: "google" | "stub";
  createEvent(accessToken: string, event: CalendarEventBody): Promise<{ id: string }>;
  updateEvent(accessToken: string, eventId: string, event: CalendarEventBody): Promise<{ id: string }>;
  /** REQ-CAL-006: a 404 is SUCCESS, not an error — the member may have
   *  deleted the event by hand, and insisting otherwise would retry eight
   *  times and dead-letter over something that is already true. */
  deleteEvent(accessToken: string, eventId: string): Promise<void>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }>;
}

const ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The narrowest scope that permits writing an event. REQ-CAL-003. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function toGoogle(event: CalendarEventBody) {
  return {
    summary: event.summary,
    description: event.description,
    ...(event.location ? { location: event.location } : {}),
    // The zone travels with the instant, so the event lands at the hour the
    // session happens rather than the hour the worker's clock thinks it is.
    start: { dateTime: new Date(event.startsAt).toISOString(), timeZone: event.timeZone },
    end: { dateTime: new Date(event.endsAt).toISOString(), timeZone: event.timeZone },
    status: event.cancelled ? "cancelled" : "confirmed",
  };
}

export class GoogleCalendarApi implements CalendarApi {
  readonly name = "google" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async call(accessToken: string, url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 || response.status === 410) throw new CalendarNotFound(`${method} ${url}: gone`);
    if (response.status === 401) throw new CalendarAuthExpired(`${method} ${url}: token rejected`);
    if (!response.ok) throw new Error(`google calendar ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
    return response;
  }

  async createEvent(accessToken: string, event: CalendarEventBody) {
    const response = await this.call(accessToken, ENDPOINT, "POST", toGoogle(event));
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("google calendar accepted the event but returned no id");
    return { id: body.id };
  }

  async updateEvent(accessToken: string, eventId: string, event: CalendarEventBody) {
    await this.call(accessToken, `${ENDPOINT}/${encodeURIComponent(eventId)}`, "PATCH", toGoogle(event));
    return { id: eventId };
  }

  async deleteEvent(accessToken: string, eventId: string) {
    await this.call(accessToken, `${ENDPOINT}/${encodeURIComponent(eventId)}`, "DELETE");
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!response.ok) throw new CalendarAuthExpired(`token refresh ${response.status}`);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new CalendarAuthExpired("token refresh returned no access_token");
    return {
      accessToken: body.access_token,
      expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
    };
  }
}
