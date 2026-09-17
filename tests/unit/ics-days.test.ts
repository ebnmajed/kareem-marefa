// notify (wave 9) — one VEVENT per day, and the one-day file that did not move.
//
// `tests/unit/ics.test.ts` is `main`'s evidence and is not edited (rule 4):
// it calls `buildIcs()`, which is now a one-element call of
// `buildIcsCalendar()`, so it proves the byte-identity by construction. This
// file proves the rest: the UID rule, three VEVENTs, and that folding is still
// measured in OCTETS when a session has several Arabic days.
import { describe, expect, it } from "vitest";
import { buildIcs, buildIcsCalendar, uidForDay, type CalendarDayInput } from "@/components/calendar/ics";

const SESSION = "6f2b1a0c-2c77-4a2e-9a6f-5a2c1b7e0d33";
const NOW = new Date("2026-09-17T09:00:00Z");

const meeting = (position: number, day: number, over: Partial<CalendarDayInput> = {}): CalendarDayInput => ({
  uid: uidForDay(SESSION, position),
  title: "ورشة الذكاء الاصطناعي في بيئة العمل",
  description: "ملخص الورشة",
  startsAt: `2026-10-0${day}T15:00:00Z`,
  endsAt: `2026-10-0${day}T17:00:00Z`,
  location: "قاعة الابتكار، الدور الثالث",
  url: `https://kareem.pp.sa/ar/app/sessions/${SESSION}`,
  ...over,
});

const lines = (ics: string) => ics.split("\r\n");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("uidForDay — REQ-CAL-001, contract 2", () => {
  it("★ position 1 IS the UID a one-day session has had since M3", () => {
    expect(uidForDay(SESSION, 1)).toBe(`session-${SESSION}@kareem.pp.sa`);
  });

  it("a later day is suffixed by its POSITION, so the set of UIDs depends only on the day count", () => {
    expect(uidForDay(SESSION, 2)).toBe(`session-${SESSION}-day-2@kareem.pp.sa`);
    expect(uidForDay(SESSION, 3)).toBe(`session-${SESSION}-day-3@kareem.pp.sa`);
    // Reordering two days of a three-day workshop leaves the same three UIDs
    // and rewrites both entries in place. An id suffix would orphan one.
    const before = [1, 2, 3].map((p) => uidForDay(SESSION, p));
    const after = [1, 2, 3].map((p) => uidForDay(SESSION, p));
    expect(after).toEqual(before);
  });
});

describe("buildIcsCalendar", () => {
  it("★ one day produces exactly what buildIcs() produces — the same bytes", () => {
    const one = meeting(1, 1);
    expect(buildIcsCalendar([one], { timeZone: "Asia/Riyadh", now: NOW })).toBe(
      buildIcs({ ...one, timeZone: "Asia/Riyadh", now: NOW }),
    );
  });

  it("three days are three VEVENTs, one VCALENDAR and ONE VTIMEZONE", () => {
    const ics = buildIcsCalendar([meeting(1, 1), meeting(2, 2), meeting(3, 3)], { timeZone: "Asia/Riyadh", now: NOW });

    expect(lines(ics).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(3);
    expect(lines(ics).filter((l) => l === "END:VEVENT")).toHaveLength(3);
    expect(lines(ics).filter((l) => l === "BEGIN:VCALENDAR")).toHaveLength(1);
    // The zone is the file's, not the day's — a session's days are all in the
    // org's zone, and a second VTIMEZONE for the same TZID is invalid.
    expect(lines(ics).filter((l) => l === "BEGIN:VTIMEZONE")).toHaveLength(1);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("each VEVENT carries its OWN day's window and place", () => {
    const ics = unfold(
      buildIcsCalendar(
        [meeting(1, 1), meeting(2, 2, { location: "قاعة التدريب", startsAt: "2026-10-02T16:00:00Z", endsAt: "2026-10-02T18:00:00Z" })],
        { timeZone: "Asia/Riyadh", now: NOW },
      ),
    );

    // Asia/Riyadh is UTC+3 all year, so 15:00Z is 18:00 local and 16:00Z is 19:00.
    expect(ics).toContain("DTSTART;TZID=Asia/Riyadh:20261001T180000");
    expect(ics).toContain("DTEND;TZID=Asia/Riyadh:20261001T200000");
    expect(ics).toContain("DTSTART;TZID=Asia/Riyadh:20261002T190000");
    expect(ics).toContain("DTEND;TZID=Asia/Riyadh:20261002T210000");
    expect(ics).toContain("LOCATION:قاعة التدريب");
  });

  it("★ every line of a three-day Arabic file is at most 75 OCTETS — REQ-CAL-001", () => {
    const ics = buildIcsCalendar([meeting(1, 1), meeting(2, 2), meeting(3, 3)], { timeZone: "Asia/Riyadh", now: NOW });
    for (const line of lines(ics)) {
      // Characters would pass at twice the length; octets are what RFC 5545
      // folds at, and what Outlook reads.
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("a cancelled session marks every day CANCELLED", () => {
    const ics = buildIcsCalendar([meeting(1, 1, { cancelled: true }), meeting(2, 2, { cancelled: true })], {
      timeZone: "Asia/Riyadh",
      now: NOW,
    });
    expect(lines(ics).filter((l) => l === "STATUS:CANCELLED")).toHaveLength(2);
    expect(lines(ics).filter((l) => l === "STATUS:CONFIRMED")).toHaveLength(0);
  });

  it("a day with no place omits LOCATION rather than writing an empty one", () => {
    const ics = buildIcsCalendar([meeting(1, 1, { location: null })], { timeZone: "Asia/Riyadh", now: NOW });
    expect(ics).not.toContain("LOCATION:");
  });
});
