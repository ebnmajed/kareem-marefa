// The stubbed calendar API — every test and every local run (DEC-046's rule
// for mail, applied to the other external service).
//
// It holds events in a Map so a test can assert that the SAME event was
// updated rather than a second one created — REQ-CAL-004's idempotency is a
// database constraint, but "the update reaches the calendar without the
// member re-adding anything" (REQ-CAL-005) is a property of the job, and this
// is what lets it be tested without a Google account.

import { CalendarAuthExpired, CalendarNotFound, type CalendarApi, type CalendarEventBody } from "./api.js";

export class StubCalendarApi implements CalendarApi {
  readonly name = "stub" as const;
  readonly events = new Map<string, CalendarEventBody>();
  readonly deleted: string[] = [];
  /** Set to make the next call fail, to exercise the failure path. */
  failNext: "not_found" | "auth" | "error" | null = null;
  private counter = 0;

  private maybeFail() {
    const mode = this.failNext;
    this.failNext = null;
    if (mode === "not_found") throw new CalendarNotFound("stub: gone");
    if (mode === "auth") throw new CalendarAuthExpired("stub: token rejected");
    if (mode === "error") throw new Error("stub: calendar unavailable");
  }

  async createEvent(_accessToken: string, event: CalendarEventBody) {
    this.maybeFail();
    const id = `stub_event_${++this.counter}`;
    this.events.set(id, event);
    return { id };
  }

  async updateEvent(_accessToken: string, eventId: string, event: CalendarEventBody) {
    this.maybeFail();
    if (!this.events.has(eventId)) throw new CalendarNotFound(`stub: ${eventId}`);
    this.events.set(eventId, event);
    return { id: eventId };
  }

  async deleteEvent(_accessToken: string, eventId: string) {
    this.maybeFail();
    if (!this.events.has(eventId)) throw new CalendarNotFound(`stub: ${eventId}`);
    this.events.delete(eventId);
    this.deleted.push(eventId);
  }

  async refreshAccessToken(_refreshToken: string) {
    this.maybeFail();
    return { accessToken: `stub_access_${++this.counter}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  }

  clear() {
    this.events.clear();
    this.deleted.length = 0;
    this.failNext = null;
  }
}
