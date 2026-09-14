// The calendar API surface and its factory — worker/src/calendar/,
// REQ-CAL-003, REQ-CAL-006, REQ-CAL-008.
//
// The factory is the same decision as the mail transport's (DEC-046): the
// OAuth client is a Launch input, and a missing variable falling through to
// the real Google API would mean a test run writing into somebody's actual
// calendar. There is no undo for that either, so the default is the stub and
// this file says so from both sides.
import { describe, expect, it } from "vitest";
import { createCalendarApi, CALENDAR_SCOPE, StubCalendarApi, CalendarNotFound } from "../../worker/src/calendar/index";

const BODY = {
  summary: "الذكاء الاصطناعي في العمل",
  description: "ملخص الجلسة",
  location: "قاعة الابتكار",
  startsAt: "2026-10-01T15:00:00Z",
  endsAt: "2026-10-01T16:00:00Z",
  timeZone: "Asia/Riyadh",
};

describe("createCalendarApi", () => {
  it("returns the stub when nothing is configured", () => {
    expect(createCalendarApi({}).name).toBe("stub");
  });

  it("returns the stub for a HALF-configured client, rather than failing later", () => {
    // A client id with no secret fails at the first refresh with an opaque
    // 400; failing over to the stub keeps the local run working and the
    // production misconfiguration visible in one place.
    expect(createCalendarApi({ GOOGLE_OAUTH_CLIENT_ID: "id" }).name).toBe("stub");
    expect(createCalendarApi({ GOOGLE_OAUTH_CLIENT_SECRET: "secret" }).name).toBe("stub");
  });

  it("reaches Google only with both halves of the Launch input", () => {
    expect(createCalendarApi({ GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret" }).name).toBe("google");
    // …and an explicit override wins, so a staging run can force the stub.
    expect(createCalendarApi({ GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s", CALENDAR_API: "stub" }).name).toBe("stub");
  });

  it("asks for the narrowest scope that permits writing an event (REQ-CAL-003)", () => {
    expect(CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.events");
    // Not `calendar`, which is read-write over every calendar the member has.
    expect(CALENDAR_SCOPE).not.toMatch(/auth\/calendar$/);
  });
});

describe("StubCalendarApi — the shape the jobs are written against", () => {
  it("creates, then UPDATES the same event rather than making a second one", async () => {
    const api = new StubCalendarApi();
    const { id } = await api.createEvent("token", BODY);
    await api.updateEvent("token", id, { ...BODY, startsAt: "2026-10-02T15:00:00Z", endsAt: "2026-10-02T16:00:00Z" });
    // REQ-CAL-005: the change reaches the calendar without the member
    // re-adding anything, and REQ-CAL-004 means there is still one event.
    expect(api.events.size).toBe(1);
    expect(api.events.get(id)!.startsAt).toBe("2026-10-02T15:00:00Z");
  });

  it("raises CalendarNotFound for an event that is gone — the 404 the jobs treat as success", async () => {
    const api = new StubCalendarApi();
    await expect(api.deleteEvent("token", "never_existed")).rejects.toBeInstanceOf(CalendarNotFound);
    await expect(api.updateEvent("token", "never_existed", BODY)).rejects.toBeInstanceOf(CalendarNotFound);
  });

  it("records what it deleted, and can be made to fail exactly once", async () => {
    const api = new StubCalendarApi();
    const { id } = await api.createEvent("token", BODY);
    api.failNext = "error";
    await expect(api.deleteEvent("token", id)).rejects.toThrow("calendar unavailable");
    await api.deleteEvent("token", id);
    expect(api.deleted).toEqual([id]);
    expect(api.events.size).toBe(0);
  });

  it("hands back a refreshed access token with an expiry in the future", async () => {
    const api = new StubCalendarApi();
    const refreshed = await api.refreshAccessToken("refresh");
    expect(refreshed.accessToken).toMatch(/^stub_access_/);
    expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
