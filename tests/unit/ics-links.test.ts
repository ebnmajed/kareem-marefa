// Add-to-calendar links — src/components/calendar/links.ts, REQ-CAL-002.
//
// "Each pre-filled and URL-encoded — and tested with Arabic titles, which is
// where naive encoding breaks" (08 §6.2). The specific break this file pins
// is `URLSearchParams`, which encodes a space as `+` because it implements
// form encoding rather than percent-encoding. Google tolerates it; Outlook
// shows the plus signs to the member. Arabic titles are full of spaces.
import { describe, expect, it } from "vitest";
import { calendarLinks } from "../../src/components/calendar/links";

const INPUT = {
  title: "الذكاء الاصطناعي في العمل اليومي",
  description: "ملخص الجلسة، مع فاصلة & علامة",
  location: "قاعة الابتكار، الدور الثاني",
  startsAt: "2026-10-01T15:00:00Z",
  endsAt: "2026-10-01T16:00:00Z",
  timeZone: "Asia/Riyadh",
  icsUrl: "https://kareem.pp.sa/api/sessions/abc/ics",
  eventUrl: "https://kareem.pp.sa/ar/app/sessions/abc",
};

const links = calendarLinks(INPUT);

/** Read one query parameter the way a provider does. */
const param = (url: string, name: string) => new URL(url).searchParams.get(name);

describe("REQ-CAL-002 — each link opens the right provider, pre-filled", () => {
  it("points at Google, Outlook and the ICS download", () => {
    expect(links.google.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE")).toBe(true);
    expect(links.outlook.startsWith("https://outlook.office.com/calendar/0/deeplink/compose")).toBe(true);
    // Apple Calendar has no web compose URL; the ICS download IS the link.
    expect(links.apple).toBe(INPUT.icsUrl);
  });

  it("round-trips the Arabic title, description and venue through both providers", () => {
    for (const [url, titleKey, bodyKey, locationKey] of [
      [links.google, "text", "details", "location"],
      [links.outlook, "subject", "body", "location"],
    ] as const) {
      expect(param(url, titleKey)).toBe(INPUT.title);
      expect(param(url, bodyKey)).toContain(INPUT.description);
      expect(param(url, bodyKey)).toContain(INPUT.eventUrl);
      expect(param(url, locationKey)).toBe(INPUT.location);
    }
  });

  it("percent-encodes spaces — no `+` reaches a provider that shows it literally", () => {
    // The URLSearchParams bug, pinned. `%20` in the raw string, never `+`.
    for (const url of [links.google, links.outlook]) {
      expect(url).toContain("%20");
      expect(url.split("?")[1]).not.toContain("+");
    }
  });

  it("encodes every Arabic character rather than leaving raw bytes in the query", () => {
    for (const url of [links.google, links.outlook]) {
      expect(url).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("escapes an ampersand in the description instead of inventing a parameter", () => {
    expect(param(links.google, "details")).toContain("&");
    expect(new URL(links.google).searchParams.has("%20علامة")).toBe(false);
  });
});

describe("08 §6.1's rule again — the hour is the session's, not the reader's", () => {
  it("sends Google UTC instants plus the session's zone", () => {
    expect(links.google).toContain("dates=20261001T150000Z/20261001T160000Z");
    expect(param(links.google, "ctz")).toBe("Asia/Riyadh");
  });

  it("sends Outlook ISO instants it can resolve on its own", () => {
    expect(param(links.outlook, "startdt")).toBe("2026-10-01T15:00:00.000Z");
    expect(param(links.outlook, "enddt")).toBe("2026-10-01T16:00:00.000Z");
  });
});

describe("a session with no venue", () => {
  it("omits the location parameter rather than sending an empty one", () => {
    const withoutVenue = calendarLinks({ ...INPUT, location: null });
    expect(new URL(withoutVenue.google).searchParams.has("location")).toBe(false);
    expect(new URL(withoutVenue.outlook).searchParams.has("location")).toBe(false);
  });
});
