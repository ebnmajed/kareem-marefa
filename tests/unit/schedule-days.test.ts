// ★ THE ONE-DAY PATH, PINNED AT THE SEAM — wave 9's second demonstrable, for
// SCR-043 (DEC-150, DEC-151, REQ-SES-015, REQ-SES-016).
//
// The wave's measure is that «a one-day session is byte-identical in behaviour
// to main». For this screen that is one claim: a form an admin fills in without
// ever opening «جلسة متعدّدة الأيام» reaches `schedule_session()` with the same
// arguments it reaches it with on main. Proving it by reading the diff is how a
// form quietly starts sending `days: []`, so it is asserted here against a
// frozen copy of wave 8's own argument object.
//
// A NEW file (wave-9 rule 4): `schedule-actions.test.ts`,
// `schedule-rules.test.ts` and `sessions-schedule-walk-ins.test.ts` are
// untouched, and stay the evidence they were.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDays, dateOf, dayEnd, withSameClock } from "@/app/[locale]/app/admin/sessions/[id]/schedule/rules";
import type { ScheduleInput } from "@/lib/dal/sessions";

const scheduleSession = vi.fn<(locale: string, sessionId: string, input: ScheduleInput) => Promise<void>>(async () => undefined);
const publishSession = vi.fn<(locale: string, sessionId: string) => Promise<void>>(async () => undefined);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/dal/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dal/sessions")>();
  return { ...actual, scheduleSession, publishSession };
});

const { saveSchedule } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/actions");
const { emptyScheduleState } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/state");
const { SCHEDULE_FIELDS } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/state");

const ZONE = "Asia/Riyadh";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const VENUE = "00000000-0000-4000-8000-0000000000ff";

/** The form exactly as an admin who never opened the affordance submits it. */
function oneDayForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    startsAt: "2026-10-01T18:00",
    durationMinutes: "60",
    endMode: "follow",
    venueChoice: VENUE,
    capacity: "",
    rsvpPreset: "atStart",
    cutoffPreset: "dayBefore",
    certificateMode: "automatic",
    language: "ar",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
  return fd;
}

/**
 * ★ WAVE 8'S FIELD LIST, FROZEN. Copied out of `state.ts` at `5bf0327` and
 * never re-derived from it: a test that imports the thing it is pinning cannot
 * fail. A rename, a reorder or a removal here is a changed one-day form.
 */
const WAVE_8_FIELDS = [
  "startsAt",
  "durationMinutes",
  "endMode",
  "endsAt",
  "venueChoice",
  "customVenueName",
  "customVenueAddress",
  "customVenueMapUrl",
  "capacity",
  "allowWalkIns",
  "rsvpPreset",
  "rsvpDeadlineAt",
  "cutoffPreset",
  "cancellationCutoffAt",
  "certificateMode",
  "language",
] as const;

/**
 * ★ WAVE 8'S ARGUMENT OBJECT, FROZEN, for the form above. Every key
 * `schedule_session()` was given on main, with the value it was given.
 */
const WAVE_8_INPUT = {
  startsAt: "2026-10-01T15:00:00.000Z",
  durationMinutes: 60,
  endsAt: null,
  venueId: VENUE,
  customVenueName: null,
  customVenueAddress: null,
  customVenueMapUrl: null,
  capacity: null,
  rsvpDeadlineAt: "2026-10-01T15:00:00.000Z",
  cancellationCutoffAt: "2026-09-30T15:00:00.000Z",
  certificateMode: "automatic",
  language: "ar",
  allowWalkIns: false,
};

beforeEach(() => {
  scheduleSession.mockClear();
  publishSession.mockClear();
});

describe("★ the one-day form reaches schedule_session() exactly as it does on main", () => {
  it("sends every wave-8 argument unchanged, and the two new ones as null", async () => {
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), oneDayForm());
    expect(state.saved).toBe(true);
    expect(scheduleSession).toHaveBeenCalledTimes(1);

    const input = scheduleSession.mock.calls[0][2];
    // ★ `toEqual`, not `toMatchObject`: a new key with a non-null value — a
    // `days: []`, a `requireAllDays: false` — is exactly the regression this
    // case exists to catch, and `toMatchObject` would let it through.
    expect(input).toEqual({ ...WAVE_8_INPUT, days: null, requireAllDays: null });
  });

  it("★ null, not an empty array: `p_days => []` is `days_empty` and would refuse every save", async () => {
    await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), oneDayForm());
    const input = scheduleSession.mock.calls[0][2];
    expect(input.days).toBeNull();
    expect(input.days).not.toEqual([]);
  });

  it("★ null, not false: an absent switch leaves REQ-SES-017's default standing", async () => {
    await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), oneDayForm());
    expect(scheduleSession.mock.calls[0][2].requireAllDays).toBeNull();
  });

  it("a one-day publish is still one press, and still saves first", async () => {
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), oneDayForm({ intent: "publish" }));
    expect(state).toMatchObject({ saved: true, published: true, formError: null });
    expect(scheduleSession.mock.calls[0][2].days).toBeNull();
  });
});

describe("★ the field list grows without the one-day form moving", () => {
  it("still declares wave 8's sixteen fields, in wave 8's order", () => {
    const carried = SCHEDULE_FIELDS.filter((f) => !["days", "requireAllDays"].includes(f));
    expect(carried).toEqual([...WAVE_8_FIELDS]);
  });

  it("adds nothing but the day set and its flag", () => {
    const added = SCHEDULE_FIELDS.filter((f) => !WAVE_8_FIELDS.includes(f as (typeof WAVE_8_FIELDS)[number]));
    expect(added.every((f) => ["days", "requireAllDays"].includes(f))).toBe(true);
  });
});

describe("★ a day's clock survives a date-only pick", () => {
  it("shows the picker a DATE, because that is the shape it parses and returns", () => {
    expect(dateOf("2026-10-11T18:00")).toBe("2026-10-11");
    // Not a wall clock: the picker would have shown «لم يُحدَّد بعد» for this.
    expect(dateOf("2026-10-11")).toBe("");
    expect(dateOf("")).toBe("");
  });

  it("★ re-attaches the day's own clock, so an inherited 6 p.m. is not silently midnight", () => {
    expect(withSameClock("2026-10-13", "2026-10-11T18:00")).toBe("2026-10-13T18:00");
    expect(withSameClock("2026-10-13", "2026-10-11T06:30")).toBe("2026-10-13T06:30");
  });

  it("passes a whole wall clock through, which is what minute mode returns", () => {
    expect(withSameClock("2026-10-13T20:15", "2026-10-11T18:00")).toBe("2026-10-13T20:15");
  });

  it("clears on an empty value, and falls back to midnight with no clock to keep", () => {
    expect(withSameClock("", "2026-10-11T18:00")).toBe("");
    expect(withSameClock("2026-10-13", "")).toBe("2026-10-13T00:00");
  });

  it("★ a clockless day breaks three things downstream — the reason this is not «tolerated»", () => {
    // What `set({ startsAt: value })` used to store after a date-only pick, and
    // what every reader then did with it. None of these failed loudly.
    expect(dayEnd({ startsAt: "2026-10-13", endsAt: "" }, "120")).toBe("");        // the end sentence empties
    expect(checkDays([{ startsAt: "2026-10-13", endsAt: "" }, { startsAt: "2026-10-13T18:00", endsAt: "2026-10-13T20:00" }])).toEqual({});  // an overlap goes unseen
    // …and `atZone()` refuses it at submit, so the save is refused on a day
    // that visibly carries a date. With the clock re-attached, all three work.
    const whole = withSameClock("2026-10-13", "2026-10-11T18:00");
    expect(dayEnd({ startsAt: whole, endsAt: "" }, "120")).toBe("2026-10-13T20:00");
    expect(checkDays([{ startsAt: whole, endsAt: "2026-10-13T20:00" }, { startsAt: "2026-10-13T19:00", endsAt: "2026-10-13T21:00" }])).toEqual({ 1: "daysOverlap" });
  });
});
