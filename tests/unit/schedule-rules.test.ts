// SCR-043's rules — REQ-SES-002's relations and REQ-SES-016's «quick for the
// common case», pinned where both the form and the action read them.
import { describe, expect, it } from "vitest";
import {
  CUSTOM_VENUE,
  addMinutes,
  atZone,
  checkRelations,
  deadlineFor,
  endFollows,
  followingEnd,
  minutesBetween,
  missingForPublish,
  presetOf,
} from "@/app/[locale]/app/admin/sessions/[id]/schedule/rules";

describe("wall-clock arithmetic", () => {
  it("moves a wall clock by minutes, across midnight and a month end", () => {
    expect(addMinutes("2026-09-30T23:30", 60)).toBe("2026-10-01T00:30");
    expect(addMinutes("2026-10-01T18:00", -24 * 60)).toBe("2026-09-30T18:00");
    expect(addMinutes("not a time", 60)).toBe("");
  });

  it("measures the minutes between two wall clocks", () => {
    expect(minutesBetween("2026-10-01T18:00", "2026-10-01T19:30")).toBe(90);
    expect(minutesBetween("", "2026-10-01T19:30")).toBeNull();
  });
});

describe("REQ-SES-016: the end follows the duration, and an explicit end wins", () => {
  it("puts the end the duration after the start, and keeps it there as the start moves", () => {
    expect(followingEnd("2026-10-01T18:00", "60")).toBe("2026-10-01T19:00");
    expect(followingEnd("2026-10-02T09:15", "60")).toBe("2026-10-02T10:15");
  });

  it("says nothing until both are usable — never a wrong time", () => {
    expect(followingEnd("", "60")).toBe("");
    expect(followingEnd("2026-10-01T18:00", "")).toBe("");
    expect(followingEnd("2026-10-01T18:00", "5")).toBe("");
    expect(followingEnd("2026-10-01T18:00", "481")).toBe("");
  });

  it("reads a stored end equal to start + duration as following, anything else as set by hand (OQ-001)", () => {
    expect(endFollows("2026-10-01T18:00", "60", "2026-10-01T19:00")).toBe(true);
    expect(endFollows("2026-10-01T18:00", "60", "")).toBe(true);
    expect(endFollows("2026-10-01T18:00", "60", "2026-10-01T19:30")).toBe(false);
  });
});

describe("deadline presets, relative to the start", () => {
  const start = "2026-10-01T18:00";

  it("recognises what schedule_session() stored — a missing deadline is stored AS the start", () => {
    expect(presetOf("", start)).toBe("atStart");
    expect(presetOf(start, start)).toBe("atStart");
    expect(presetOf("2026-10-01T17:00", start)).toBe("hourBefore");
    expect(presetOf("2026-09-30T18:00", start)).toBe("dayBefore");
    expect(presetOf("2026-09-29T12:00", start)).toBe("custom");
  });

  it("means a time for each preset, and follows the start when it moves", () => {
    expect(deadlineFor("atStart", start, "")).toBe(start);
    expect(deadlineFor("hourBefore", start, "")).toBe("2026-10-01T17:00");
    expect(deadlineFor("dayBefore", "2026-10-05T09:00", "")).toBe("2026-10-04T09:00");
    expect(deadlineFor("custom", start, "2026-09-29T12:00")).toBe("2026-09-29T12:00");
    expect(deadlineFor("dayBefore", "", "")).toBe("");
  });
});

describe("REQ-SES-002's constraints, said at the field", () => {
  const ok = { startsAt: "2026-10-01T18:00", endsAt: "2026-10-01T19:00", rsvpDeadlineAt: "2026-10-01T18:00", cancellationCutoffAt: "2026-09-30T18:00" };

  it("passes a schedule the database would accept", () => {
    expect(checkRelations(ok)).toEqual({});
  });

  it("refuses an end at or before the start, and a deadline after it", () => {
    expect(checkRelations({ ...ok, endsAt: "2026-10-01T18:00" })).toEqual({ endsAt: "endBeforeStart" });
    expect(checkRelations({ ...ok, rsvpDeadlineAt: "2026-10-01T18:01" })).toEqual({ rsvpDeadlineAt: "rsvpAfterStart" });
    expect(checkRelations({ ...ok, cancellationCutoffAt: "2026-10-02T09:00" })).toEqual({ cancellationCutoffAt: "cutoffAfterStart" });
  });

  it("says nothing about relations before there is a start", () => {
    expect(checkRelations({ ...ok, startsAt: "", endsAt: "2020-01-01T00:00" })).toEqual({});
  });
});

describe("REQ-SES-001's gate, from the form as it stands", () => {
  const base = { startsAt: "2026-10-01T18:00", durationMinutes: "60", venueChoice: "00000000-0000-4000-8000-000000000001", customVenueName: "", customVenueAddress: "", capacity: "", venueCapacity: 40 };

  it("is satisfied by a venue whose capacity schedule_session() will copy", () => {
    expect(missingForPublish(base)).toEqual([]);
  });

  it("names every missing piece", () => {
    expect(missingForPublish({ ...base, startsAt: "", durationMinutes: "", venueChoice: "", venueCapacity: null })).toEqual(["startsAt", "duration", "venue", "capacity"]);
  });

  it("asks a one-off place for its name, address and capacity", () => {
    expect(missingForPublish({ ...base, venueChoice: CUSTOM_VENUE, venueCapacity: null })).toEqual(["venue", "capacity"]);
    expect(missingForPublish({ ...base, venueChoice: CUSTOM_VENUE, customVenueName: "بيت الخبرة", customVenueAddress: "الرياض", capacity: "20", venueCapacity: null })).toEqual([]);
  });
});

describe("atZone — the room's clock, not the server's (OQ-018)", () => {
  it("reads a wall clock in Riyadh as the instant three hours earlier in UTC", () => {
    expect(atZone("2026-10-01T18:00", "Asia/Riyadh")).toBe("2026-10-01T15:00:00.000Z");
  });
});
