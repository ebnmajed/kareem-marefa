import { describe, expect, it } from "vitest";
import { firstDayOfWeek, groupEnded, groupUpcoming, inPeriod, monthLabel, upcomingGroupOf, type Groupable } from "@/components/browse/timeline-groups";

// The timeline's date groups — `16` §6.2, REQ-UIX-021. In the org's zone,
// weeks starting where the locale says (Sunday for ar-SA).

const TZ = "Asia/Riyadh"; // UTC+3, no daylight saving
// Wednesday 16 September 2026, 12:00 in Riyadh.
const NOW = new Date("2026-09-16T09:00:00Z");
const at = (riyadhLocal: string) => new Date(`${riyadhLocal}+03:00`).toISOString();
const open = (riyadhLocal: string): Groupable => ({ phase: "open", startsAt: at(riyadhLocal), endsAt: null });

describe("upcomingGroupOf", () => {
  it("ar-SA's week starts on Sunday", () => {
    expect(firstDayOfWeek("ar-SA")).toBe(7);
  });

  it("puts a running session first, whatever its date", () => {
    expect(upcomingGroupOf({ phase: "live", startsAt: at("2026-09-16T11:00:00"), endsAt: null }, NOW, TZ)).toBe("live");
  });

  it("★ this week runs to Saturday night in Riyadh, not in UTC", () => {
    expect(upcomingGroupOf(open("2026-09-19T23:30:00"), NOW, TZ)).toBe("thisWeek"); // Saturday 23:30 local = 20:30 UTC
    expect(upcomingGroupOf(open("2026-09-20T00:30:00"), NOW, TZ)).toBe("nextWeek"); // Sunday 00:30 local = Saturday 21:30 UTC
  });

  it("next week is the seven days after, then the rest of the month, then later", () => {
    expect(upcomingGroupOf(open("2026-09-26T18:00:00"), NOW, TZ)).toBe("nextWeek");
    expect(upcomingGroupOf(open("2026-09-28T18:00:00"), NOW, TZ)).toBe("thisMonth");
    expect(upcomingGroupOf(open("2026-10-02T18:00:00"), NOW, TZ)).toBe("later");
  });

  it("★ a month turning inside next week stays «الأسبوع القادم», not «لاحقًا»", () => {
    // Wednesday 30 September 2026; next week spans 4–10 October.
    const late = new Date("2026-09-30T09:00:00Z");
    expect(upcomingGroupOf(open("2026-10-06T18:00:00"), late, TZ)).toBe("nextWeek");
    expect(upcomingGroupOf(open("2026-10-12T18:00:00"), late, TZ)).toBe("later");
  });

  it("an unscheduled session goes last", () => {
    expect(upcomingGroupOf({ phase: "open", startsAt: null, endsAt: null }, NOW, TZ)).toBe("later");
  });
});

describe("groupUpcoming", () => {
  it("returns only non-empty groups, in the timeline's order, keeping the caller's sort inside each", () => {
    const items = [
      { ...open("2026-10-20T18:00:00"), id: "later" },
      { phase: "live" as const, startsAt: at("2026-09-16T11:00:00"), endsAt: null, id: "live" },
      { ...open("2026-09-17T18:00:00"), id: "wk-a" },
      { ...open("2026-09-18T18:00:00"), id: "wk-b" },
    ];
    const groups = groupUpcoming(items, NOW, TZ);
    expect(groups.map((g) => g.key)).toEqual(["live", "thisWeek", "later"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["wk-a", "wk-b"]);
  });
});

describe("groupEnded", () => {
  it("groups by the month the session ended, most recent first as given", () => {
    const ended = (end: string, id: string) => ({ phase: "ended" as const, startsAt: at(end), endsAt: at(end), id });
    const groups = groupEnded([ended("2026-09-10T19:00:00", "a"), ended("2026-09-01T19:00:00", "b"), ended("2026-08-20T19:00:00", "c")], TZ);
    expect(groups.map((g) => g.key)).toEqual(["month:2026-09", "month:2026-08"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("★ labels a month in Western digits (DEC-124)", () => {
    const label = monthLabel("month:2026-09", "ar")!;
    expect(label).toContain("2026");
    expect(label).not.toMatch(/[٠-٩]/);
  });
});

describe("inPeriod — the period filter (DEC-141 ruling 15)", () => {
  // Riyadh, week from Sunday 13 September 2026; today is Wednesday the 16th.
  it("«هذا الأسبوع» is Sunday to Saturday of the week holding today, on the org's calendar", () => {
    expect(inPeriod(at("2026-09-13T00:30:00"), "thisWeek", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-09-19T23:30:00"), "thisWeek", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-09-20T00:30:00"), "thisWeek", NOW, TZ)).toBe(false);
  });

  it("«الأسبوع القادم» is the seven days after it", () => {
    expect(inPeriod(at("2026-09-20T00:30:00"), "nextWeek", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-09-26T23:30:00"), "nextWeek", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-09-27T00:30:00"), "nextWeek", NOW, TZ)).toBe(false);
  });

  it("«هذا الشهر» is the whole calendar month — this week and next week included, the next month not", () => {
    expect(inPeriod(at("2026-09-17T18:00:00"), "thisMonth", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-09-30T23:30:00"), "thisMonth", NOW, TZ)).toBe(true);
    expect(inPeriod(at("2026-10-01T00:30:00"), "thisMonth", NOW, TZ)).toBe(false);
  });

  it("the day turns in the org's zone, not in UTC", () => {
    // 22:30 UTC on Saturday the 19th is 01:30 on Sunday the 20th in Riyadh — next week.
    expect(inPeriod("2026-09-19T22:30:00Z", "thisWeek", NOW, TZ)).toBe(false);
    expect(inPeriod("2026-09-19T22:30:00Z", "nextWeek", NOW, TZ)).toBe(true);
  });

  it("a session with no start is in no period", () => {
    expect(inPeriod(null, "thisMonth", NOW, TZ)).toBe(false);
  });
});
